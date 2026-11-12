/** VX-705: read-only Testnet endpoints (guide §13.4). */
import type { FastifyInstance, FastifyReply } from "fastify";
import type { Pool } from "pg";
import { amountFields, BadRequest, page, pagination, paginationSchema } from "./conventions.js";

type Row = Record<string, unknown>;
type Contracts = { registry: string; bond: string; scoreboard: string };
export interface NetworkReads {
  contracts: Contracts;
  lifetime(id: string): Promise<unknown>;
  claimEvidence(id: string): Promise<string | null>;
  head(): Promise<{ ledger: number; closeTime: bigint }>;
  ledgerClose(ledger: number): Promise<bigint | null>;
  evidence(hash: string): Promise<unknown>;
}

const hex = { type: "string", pattern: "^[a-f0-9]{64}$" } as const;
const numericId = { type: "string", pattern: "^[0-9]{1,19}$" } as const;
const object = { type: "object", additionalProperties: true } as const;
const list = {
  type: "object",
  required: ["items", "next_cursor"],
  properties: {
    items: { type: "array", items: object },
    next_cursor: { type: ["string", "null"] },
  },
} as const;
const claimStatuses = ["filed", "challenged", "paid", "rejected", "expired"];
const explorer = "https://stellar.expert/explorer/testnet/tx/";
const idText = (value: unknown) => {
  if (
    typeof value !== "string" ||
    !/^[0-9]{1,19}$/.test(value) ||
    BigInt(value) > 9223372036854775807n
  )
    throw new BadRequest("Invalid ID");
  return value;
};
const idWire = (value: unknown) => {
  const id = BigInt(String(value));
  return id <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(id) : id.toString();
};
const utc = (value: unknown) =>
  value instanceof Date ? value.toISOString().replace(/\.000Z$/, "Z") : value;
const money = (key: string, value: unknown) => amountFields(key, BigInt(String(value)));
const missing = (reply: FastifyReply) =>
  reply.code(404).send({ error: { code: "not_found", message: "Resource not found" } });
const unavailable = (reply: FastifyReply) =>
  reply.code(503).send({ error: { code: "unavailable", message: "Upstream service unavailable" } });
const params = (name: string, schema: object) => ({
  type: "object",
  required: [name],
  properties: { [name]: schema },
});
const response = { 200: object };
const collection = { querystring: paginationSchema, response: { 200: list } };
const paging = (query: { limit?: unknown; cursor?: unknown }, numeric = false) => {
  const p = pagination(query);
  if (p.after !== null) {
    if (numeric) idText(p.after);
    else if (!/^[a-f0-9]{64}$/.test(p.after)) throw new BadRequest("Invalid cursor");
  }
  return p;
};
function pack(rows: Row[], limit: number, key: string, map: (row: Row) => Row) {
  const selected = rows.slice(0, limit);
  return page(selected.map(map), rows.length > limit ? String(selected.at(-1)?.[key]) : null);
}

const claimSelect = `select c.*, m.provider_id, p.evidence_hash
  from claims c join commitments m using (commitment_id) left join payments p on p.payment_id=c.payment_id`;

function claim(row: Row) {
  return {
    claim_id: idWire(row.claim_id),
    status: row.status,
    outcome: row.outcome,
    breach: row.breach,
    commitment_id: idWire(row.commitment_id),
    provider_id: row.provider_id,
    payment_id: row.payment_id,
    ...money("penalty", row.penalty),
    reserved: row.reserved,
    shortfall: row.shortfall,
    amount_paid: row.amount_paid,
    bond: row.bond,
    claimant: row.claimant,
    beneficiary: row.beneficiary,
    filed_at: utc(row.filed_at),
    challenge_deadline: utc(row.challenge_deadline),
    resolved_at: utc(row.resolved_at),
  };
}

function commitment(row: Row) {
  const available = BigInt(String(row.stake_total)) - BigInt(String(row.stake_reserved));
  const max = row.max_penalty == null ? null : BigInt(String(row.max_penalty));
  const inFlight = BigInt(String(row.in_flight ?? 0));
  const denominator = max === null ? 0n : max * inFlight;
  const ratio = denominator > 0n ? (available * 1_000_000n) / denominator : 1_500_000n;
  return {
    commitment_id: idWire(row.commitment_id),
    provider_id: row.provider_id,
    template_id: row.template_id,
    template_version: row.template_version,
    stake_asset: row.stake_asset,
    status: row.status,
    effective_from: utc(row.effective_from),
    exit_requested_at: utc(row.exit_requested_at),
    ...money("stake_total", row.stake_total),
    ...money("stake_reserved", row.stake_reserved),
    ...amountFields("available_stake", available),
    ...(max === null
      ? { max_penalty: null, max_penalty_display: null }
      : amountFields("max_penalty", max)),
    coverage_ratio:
      denominator === 0n && inFlight > 0n
        ? null
        : Number(ratio > 1_500_000n ? 1_500_000n : ratio) / 1_000_000,
  };
}
const commitmentSelect = `select c.*,
  least(trunc((t.body#>>'{scope,max_amount}')::numeric * (t.body#>>'{penalty,PerBreachBps,bps}')::numeric / 10000),
    (t.body#>>'{penalty,PerBreachBps,cap}')::numeric) as max_penalty,
  (select count(*) from payments p where p.commitment_id=c.commitment_id
    and p.status in ('tagged','settled','completed','breached')
    and (p.t0_ms is null or p.t0_ms::numeric + (t.body->>'target_ms')::numeric +
      (t.body->>'grace_ms')::numeric + p.pause_ms + (t.body->>'claim_window_secs')::numeric * 1000
      >= extract(epoch from now()) * 1000)) as in_flight
  from commitments c left join templates t on (t.template_id,t.version)=(c.template_id,c.template_version)`;

export function registerWeekendRoutes(
  app: FastifyInstance,
  db: Pick<Pool, "query">,
  network: NetworkReads,
) {
  app.get<{ Querystring: { limit?: unknown; cursor?: unknown } }>(
    "/v1/providers",
    { schema: collection },
    async ({ query }) => {
      const { limit, after } = paging(query);
      const { rows } = await db.query<Row>(
        `select p.provider_id,p.home_domain,p.verified,p.status,coalesce(sum(c.stake_total),0) as stake_total
       from providers p left join commitments c using (provider_id) where ($1::text is null or p.provider_id>$1)
       group by p.provider_id order by p.provider_id limit $2`,
        [after, limit + 1],
      );
      return pack(rows, limit, "provider_id", (r) => ({
        ...r,
        ...money("stake_total", r.stake_total),
        score: null,
      }));
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/providers/:id",
    { schema: { params: params("id", hex), response } },
    async ({ params: { id } }, reply) => {
      const {
        rows: [provider],
      } = await db.query<Row>("select * from providers where provider_id=$1", [id]);
      if (!provider) return missing(reply);
      const [{ rows }, counts, lifetime] = await Promise.all([
        db.query<Row>(`${commitmentSelect} where c.provider_id=$1 order by c.commitment_id`, [id]),
        db.query<Row>(
          `select c.status,count(*)::text as count from claims c join commitments m using (commitment_id)
        where m.provider_id=$1 group by c.status`,
          [id],
        ),
        network.lifetime(id),
      ]);
      return {
        ...provider,
        registered_at: utc(provider.registered_at),
        commitments: rows.map(commitment),
        lifetime,
        claim_counts: Object.fromEntries(counts.rows.map((r) => [r.status, idWire(r.count)])),
      };
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/commitments/:id",
    { schema: { params: params("id", numericId), response } },
    async ({ params: { id } }, reply) => {
      const {
        rows: [row],
      } = await db.query<Row>(`${commitmentSelect} where c.commitment_id=$1`, [idText(id)]);
      return row ? commitment(row) : missing(reply);
    },
  );

  app.get<{ Querystring: { limit?: unknown; cursor?: unknown } }>(
    "/v1/templates",
    { schema: collection },
    async ({ query }) => {
      const { limit, after } = paging(query, true);
      const { rows } = await db.query<Row>(
        `select distinct on (template_id) template_id,body from templates where status='active'
       and ($1::bigint is null or template_id>$1) order by template_id,version desc limit $2`,
        [after, limit + 1],
      );
      return pack(rows, limit, "template_id", (row) => row.body as Row);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/templates/:id",
    { schema: { params: params("id", numericId), response } },
    async ({ params: { id } }, reply) => {
      const {
        rows: [row],
      } = await db.query<Row>(
        "select body from templates where template_id=$1::bigint and status='active' order by version desc limit 1",
        [idText(id)],
      );
      return row ? row.body : missing(reply);
    },
  );

  app.get<{
    Querystring: {
      limit?: unknown;
      cursor?: unknown;
      status?: string;
      provider?: string;
      commitment?: string;
    };
  }>(
    "/v1/claims",
    {
      schema: {
        querystring: {
          ...paginationSchema,
          properties: {
            ...paginationSchema.properties,
            status: { type: "string", enum: claimStatuses },
            provider: hex,
            commitment: numericId,
          },
        },
        response: { 200: list },
      },
    },
    async ({ query }) => {
      const { limit, after } = paging(query, true);
      const { rows } = await db.query<Row>(
        `${claimSelect} where ($1::bigint is null or c.claim_id>$1) and ($2::text is null or c.status=$2)
         and ($3::text is null or m.provider_id=$3) and ($4::bigint is null or c.commitment_id=$4)
         order by c.claim_id limit $5`,
        [
          after,
          query.status ?? null,
          query.provider ?? null,
          query.commitment ? idText(query.commitment) : null,
          limit + 1,
        ],
      );
      return pack(rows, limit, "claim_id", claim);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/v1/claims/:id",
    { schema: { params: params("id", numericId), response } },
    async ({ params: { id } }, reply) => {
      const {
        rows: [row],
      } = await db.query<Row>(`${claimSelect} where c.claim_id=$1`, [idText(id)]);
      if (!row) return missing(reply);
      const [{ rows: votes }, evidence] = await Promise.all([
        db.query<Row>(
          "select observer,uphold,attestation_hash from claim_votes where claim_id=$1 order by observer",
          [id],
        ),
        row.evidence_hash ?? network.claimEvidence(id),
      ]);
      return {
        ...claim(row),
        evidence_hash: evidence,
        votes,
        transactions: { filed: row.filed_tx, resolved: row.resolved_tx },
        explorer_links: { filed: explorer + String(row.filed_tx) },
      };
    },
  );

  app.get<{ Params: { payment_id: string } }>(
    "/v1/payments/:payment_id",
    { schema: { params: params("payment_id", hex), response } },
    async ({ params: { payment_id } }, reply) => {
      const {
        rows: [row],
      } = await db.query<Row>(
        "select payment_id,sep31_tx_id,provider_id,commitment_id,amount,asset,stellar_tx_hash,t0_ms,t1_ms,pause_ms,status,verdict,latency_ms,claim_id,created_at,updated_at from payments where payment_id=$1",
        [payment_id],
      );
      if (!row) return missing(reply);
      const { rows: carve_outs } = await db.query<Row>(
        `select event,ts_ms::text from signed_events where payment_id=$1 and verified
       and event in ('receiver_bank_holiday','compliance_hold_declared','invalid_beneficiary','sender_info_incomplete')
       order by ts_ms,id`,
        [payment_id],
      );
      return {
        ...row,
        ...money("amount", row.amount),
        created_at: utc(row.created_at),
        updated_at: utc(row.updated_at),
        commitment_id: row.commitment_id == null ? null : idWire(row.commitment_id),
        claim_id: row.claim_id == null ? null : idWire(row.claim_id),
        carve_outs,
      };
    },
  );

  app.get<{ Params: { hash: string } }>(
    "/v1/evidence/:hash",
    { schema: { params: params("hash", hex), response } },
    async ({ params: { hash } }, reply) => {
      try {
        return (await network.evidence(hash)) ?? missing(reply);
      } catch {
        return unavailable(reply);
      }
    },
  );

  app.get("/v1/network", { schema: { response } }, async (_request, reply) => {
    try {
      const [
        head,
        {
          rows: [cursor],
        },
      ] = await Promise.all([
        network.head(),
        db.query<Row>("select ledger from cursors where name='indexer:events'"),
      ]);
      const indexed = cursor ? Number(cursor.ledger) : null;
      const close =
        indexed === null
          ? null
          : indexed >= head.ledger
            ? head.closeTime
            : await network.ledgerClose(indexed);
      const lag = close === null ? null : head.closeTime - close;
      return {
        network: "testnet",
        contracts: network.contracts,
        latest_ledger: head.ledger,
        latest_indexed_ledger: indexed,
        lag_seconds: lag === null ? null : idWire(lag < 0n ? 0n : lag),
      };
    } catch {
      return unavailable(reply);
    }
  });
}
