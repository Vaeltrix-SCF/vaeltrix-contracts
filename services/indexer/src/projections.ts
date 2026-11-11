/** VX-702: ordered projections of the frozen contract event catalog (§8.4, §13.2). */
import type { PoolClient } from "pg";
import type { SlaTemplate } from "@vaeltrix/bindings-registry";
import type { ContractName } from "./ingest.js";

export type ProjectionEvent = {
  id: string;
  ledger: string;
  ledger_closed_at: Date;
  tx_hash: string;
  contract: ContractName;
  topic: string;
  key: string | null;
  data: unknown;
};

export type Project = (db: PoolClient, event: ProjectionEvent) => Promise<void>;
type Views = {
  provider(id: Uint8Array): Promise<{ signers: Uint8Array[]; metadata_uri: string }>;
  template(id: number, version: number): Promise<SlaTemplate>;
  claim(id: bigint): Promise<{ challenge_deadline: bigint }>;
};

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Expected an event data map");
  }
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== "string" || !value) throw new Error("Expected event text");
  return value;
}

function hash(value: unknown): string {
  const hex = text(value);
  if (!/^[a-f0-9]{64}$/.test(hex)) throw new Error("Expected 32-byte event hash");
  return hex;
}

function integer(value: unknown): string {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return value;
  throw new Error("Expected a nonnegative event integer");
}

function u32(value: unknown): number {
  const n = Number(integer(value));
  if (n > 0xffff_ffff) throw new Error("Expected u32 event integer");
  return n;
}

function timestamp(value: unknown): Date {
  const seconds = typeof value === "bigint" ? value : BigInt(integer(value));
  if (seconds < 0n || seconds > 8_640_000_000_000n) throw new Error("Invalid event timestamp");
  return new Date(Number(seconds * 1000n));
}

function variant(value: unknown): string {
  return text(Array.isArray(value) ? value[0] : value);
}

function templateBody(t: SlaTemplate, status: string): string {
  const [penalty] = t.penalty.values;
  return JSON.stringify(
    {
      ...t,
      status,
      metric: t.metric.tag,
      start_event: t.start_event.tag,
      end_event: t.end_event.tag,
      evidence_mode: t.evidence_mode.tag,
      penalty: { [t.penalty.tag]: penalty },
      carve_outs: t.carve_outs.map((c) => c.tag),
      scope: { ...t.scope, direction: t.scope.direction.tag },
    },
    (_key, value: unknown) => (typeof value === "bigint" ? value.toString() : value),
  );
}

const providerStatus = { prov_sus: "suspended", prov_rein: "active" } as const;
const templateStatus = {
  tmpl_prop: "Proposed",
  tmpl_act: "Active",
  tmpl_canc: "Deprecated",
  tmpl_dep: "Deprecated",
} as const;
const commitmentStatus = {
  cmt_pause: "paused",
  cmt_resum: "active",
  exit_req: "exiting",
  exit_fin: "exited",
} as const;
const governance = new Set([
  "registry:init",
  "registry:adm_prop",
  "registry:adm_set",
  "registry:act_prop",
  "registry:act_exec",
  "registry:act_canc",
  "bond:upg_prop",
  "bond:upg_exec",
  "scoreboard:bond_set",
  "scoreboard:claim_out",
]);

async function registry(db: PoolClient, e: ProjectionEvent, views: Views): Promise<boolean> {
  switch (e.topic) {
    case "prov_reg": {
      const d = record(e.data);
      const id = hash(e.key);
      const p = await views.provider(Buffer.from(id, "hex"));
      await db.query(
        `insert into providers (provider_id, admin, home_domain, metadata_uri, signers, verified, status, registered_at)
         values ($1, $2, $3, $4, $5, false, 'active', $6) on conflict (provider_id) do nothing`,
        [
          id,
          text(d.admin),
          text(d.home_domain),
          p.metadata_uri || null,
          p.signers.map((signer) => Buffer.from(signer).toString("hex")),
          e.ledger_closed_at,
        ],
      );
      return true;
    }
    case "prov_sig": {
      const { new_value } = record(e.data);
      if (!Array.isArray(new_value)) throw new Error("Expected provider signers");
      await db.query("update providers set signers = $2 where provider_id = $1", [
        hash(e.key),
        new_value.map(hash),
      ]);
      return true;
    }
    case "prov_meta": {
      const { new_value } = record(e.data);
      if (typeof new_value !== "string") throw new Error("Expected provider metadata URI");
      await db.query("update providers set metadata_uri = $2 where provider_id = $1", [
        hash(e.key),
        new_value || null,
      ]);
      return true;
    }
    case "prov_ver":
    case "prov_unv":
      await db.query("update providers set verified = $2 where provider_id = $1", [
        hash(e.key),
        e.topic === "prov_ver",
      ]);
      return true;
    case "prov_sus":
    case "prov_rein":
      await db.query("update providers set status = $2 where provider_id = $1", [
        hash(e.key),
        providerStatus[e.topic],
      ]);
      return true;
    case "tmpl_prop":
    case "tmpl_act":
    case "tmpl_canc":
    case "tmpl_dep": {
      const d = record(e.data);
      const id = u32(e.key);
      const version = u32(d.version);
      const t = await views.template(id, version);
      const status = templateStatus[e.topic];
      await db.query(
        `insert into templates (template_id, version, body, status, activates_at)
         values ($1, $2, $3::jsonb, $4, $5)
         on conflict (template_id, version) do update
         set body = excluded.body, status = excluded.status, activates_at = excluded.activates_at`,
        [
          id,
          version,
          templateBody(t, status),
          status.toLowerCase(),
          timestamp(d.activates_at ?? t.activates_at),
        ],
      );
      return true;
    }
    case "obs_add":
      await db.query(
        `insert into observers (address, key, active, added_at) values ($1, $2, true, $3)
         on conflict (address) do update set key = excluded.key, active = true, added_at = excluded.added_at`,
        [text(e.key), hash(record(e.data).key), e.ledger_closed_at],
      );
      return true;
    case "obs_rm":
      await db.query(
        `insert into observers (address, active) values ($1, false)
         on conflict (address) do update set active = false`,
        [text(e.key)],
      );
      return true;
    default:
      return false;
  }
}

async function bond(db: PoolClient, e: ProjectionEvent, views: Views): Promise<boolean> {
  switch (e.topic) {
    case "commit": {
      const d = record(e.data);
      await db.query(
        `insert into commitments (commitment_id, provider_id, template_id, template_version, stake_asset,
          stake_total, status, effective_from, updated_ledger)
         values ($1, $2, $3, $4, $5, $6, 'active', $7, $8) on conflict (commitment_id) do nothing`,
        [
          integer(e.key),
          hash(d.provider_id),
          u32(d.template_id),
          u32(d.version),
          text(d.stake_asset),
          integer(d.amount),
          e.ledger_closed_at,
          e.ledger,
        ],
      );
      return true;
    }
    case "stake_chg":
      await db.query(
        "update commitments set stake_total = $2, updated_ledger = $3 where commitment_id = $1",
        [integer(e.key), integer(record(e.data).new_total), e.ledger],
      );
      return true;
    case "cmt_pause":
    case "cmt_resum":
    case "exit_req":
    case "exit_fin":
      await db.query(
        `update commitments set status = $2, updated_ledger = $3,
           exit_requested_at = coalesce($4, exit_requested_at),
           stake_total = case when $2 = 'exited' then 0 else stake_total end
         where commitment_id = $1`,
        [
          integer(e.key),
          commitmentStatus[e.topic],
          e.ledger,
          e.topic === "exit_req" ? timestamp(record(e.data).at) : null,
        ],
      );
      return true;
    case "claim_new": {
      const d = record(e.data);
      const id = integer(e.key);
      const commitment = integer(d.commitment_id);
      const payment = hash(d.payment_id);
      const claim = await views.claim(BigInt(id));
      const kind = variant(d.breach);
      if (kind !== "LateCompletion" && kind !== "NoCompletion")
        throw new Error("Unknown breach kind");
      const reserved = integer(d.reserved);
      const inserted = await db.query(
        `insert into claims (claim_id, commitment_id, payment_id, breach, claimant, beneficiary, penalty,
           reserved, shortfall, bond, status, filed_at, challenge_deadline, filed_tx)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'filed', $11, $12, $13)
         on conflict (claim_id) do nothing`,
        [
          id,
          commitment,
          payment,
          kind === "LateCompletion" ? "late_completion" : "no_completion",
          text(d.claimant),
          text(d.beneficiary),
          integer(d.penalty),
          reserved,
          integer(d.shortfall),
          integer(d.bond),
          e.ledger_closed_at,
          timestamp(claim.challenge_deadline),
          e.tx_hash,
        ],
      );
      if (inserted.rowCount) {
        const updated = await db.query(
          `update commitments set stake_reserved = stake_reserved + $2, updated_ledger = $3
           where commitment_id = $1 and stake_reserved + $2 <= stake_total`,
          [commitment, reserved, e.ledger],
        );
        if (!updated.rowCount) throw new Error("Claim reservation has no matching available stake");
        await db.query(
          "update payments set claim_id = $2, status = 'claimed', updated_at = $3 where payment_id = $1",
          [payment, id, e.ledger_closed_at],
        );
      }
      return true;
    }
    case "claim_chal": {
      const d = record(e.data);
      await db.query(
        `update claims set status = 'challenged', counter_evidence_hash = $2, attestation_deadline = $3
         where claim_id = $1 and status = 'filed'`,
        [
          integer(e.key),
          hash(d.counter_evidence_hash),
          d.attestation_deadline == null ? null : timestamp(d.attestation_deadline),
        ],
      );
      return true;
    }
    case "claim_att": {
      const d = record(e.data);
      if (typeof d.uphold !== "boolean") throw new Error("Expected observer vote");
      const id = integer(e.key);
      const inserted = await db.query(
        `insert into claim_votes (claim_id, observer, uphold, attestation_hash) values ($1, $2, $3, $4)
         on conflict (claim_id, observer) do nothing`,
        [id, text(d.observer), d.uphold, hash(d.attestation_hash)],
      );
      if (inserted.rowCount) {
        await db.query(
          `update claims set votes_for = votes_for + case when $2 then 1 else 0 end,
             votes_against = votes_against + case when $2 then 0 else 1 end where claim_id = $1`,
          [id, d.uphold],
        );
      }
      return true;
    }
    case "claim_res": {
      const d = record(e.data);
      const outcome = variant(d.outcome);
      if (!["Upheld", "Rejected", "Expired"].includes(outcome))
        throw new Error("Unknown claim outcome");
      const amount = integer(d.amount_paid);
      const { rows } = await db.query<{
        commitment_id: string;
        payment_id: string;
        reserved: string;
      }>(
        `update claims set status = $2, outcome = $3, amount_paid = $4, resolved_at = $5, resolved_tx = $6
         where claim_id = $1 and status in ('filed', 'challenged')
         returning commitment_id, payment_id, reserved`,
        [
          integer(e.key),
          outcome === "Upheld" ? "paid" : outcome.toLowerCase(),
          outcome.toLowerCase(),
          amount,
          e.ledger_closed_at,
          e.tx_hash,
        ],
      );
      const claim = rows[0];
      if (claim) {
        const updated = await db.query(
          `update commitments set stake_reserved = stake_reserved - $2, stake_total = stake_total - $3, updated_ledger = $4
           where commitment_id = $1 and stake_reserved >= $2 and stake_total >= $3`,
          [claim.commitment_id, claim.reserved, amount, e.ledger],
        );
        if (!updated.rowCount) throw new Error("Claim resolution has no matching reserved stake");
        await db.query(
          "update payments set status = 'resolved', updated_at = $2 where payment_id = $1",
          [claim.payment_id, e.ledger_closed_at],
        );
      }
      return true;
    }
    default:
      return false;
  }
}

export function createProjector(
  views: Views,
  onUnknown: (event: ProjectionEvent) => void,
): Project {
  return async (db, event) => {
    if (governance.has(`${event.contract}:${event.topic}`)) return;
    if (event.contract === "registry" && (await registry(db, event, views))) return;
    if (event.contract === "bond" && (await bond(db, event, views))) return;
    if (event.contract === "scoreboard" && event.topic === "batch") {
      const d = record(event.data);
      await db.query(
        `insert into batches (commitment_id, period, observer, merkle_root, stats, anchored_tx)
         values ($1, $2, $3, $4, $5::jsonb, $6) on conflict (commitment_id, period) do nothing`,
        [
          integer(event.key),
          integer(d.period),
          text(d.observer),
          hash(d.merkle_root),
          JSON.stringify(record(d.stats)),
          event.tx_hash,
        ],
      );
      return;
    }
    onUnknown(event);
  };
}
