import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { registerWeekendRoutes } from "../src/routes.js";

const url = process.env.DATABASE_TEST_URL;
it.skipIf(!url)(
  "serves the required API routes from PostgreSQL and reports indexer lag",
  async () => {
    if (!url || !new URL(url).pathname.endsWith("_test"))
      throw new Error("Disposable database required");
    const schema = `routes_test_${randomBytes(8).toString("hex")}`;
    const admin = new pg.Pool({ connectionString: url });
    const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    const app = buildApp();
    const provider = "1".repeat(64);
    const payment = "2".repeat(64);
    const evidence = "3".repeat(64);
    const hash = "4".repeat(64);
    try {
      await admin.query(`create schema ${schema}`);
      for (const name of ["0001_core.sql", "0003_indexer_projections.sql"]) {
        await pool.query(
          await readFile(new URL(`../../../db/migrations/${name}`, import.meta.url), "utf8"),
        );
      }
      await pool.query(
        "insert into providers (provider_id,admin,home_domain,signers,verified,status,registered_at) values ($1,'admin','example.org','{}',true,'active',now())",
        [provider],
      );
      const body = {
        id: 901,
        version: 1,
        target_ms: "120000",
        grace_ms: "10000",
        claim_window_secs: "600",
        scope: { max_amount: "1000000000" },
        penalty: { PerBreachBps: { bps: 500, cap: "100000000" } },
      };
      await pool.query(
        "insert into templates (template_id,version,body,status) values (901,1,$1,'active')",
        [body],
      );
      await pool.query(
        `insert into commitments (commitment_id,provider_id,template_id,template_version,stake_asset,stake_total,stake_reserved,status,effective_from,updated_ledger)
       values (1,$1,901,1,'asset',10000000000,0,'active',now(),90)`,
        [provider],
      );
      await pool.query(
        `insert into payments (payment_id,sep31_tx_id,provider_id,commitment_id,amount,asset,status,evidence_hash,claim_id)
       values ($1,'payment',$2,1,1000000000,'asset','resolved',$3,12)`,
        [payment, provider, evidence],
      );
      await pool.query(
        `insert into claims (claim_id,commitment_id,payment_id,breach,claimant,beneficiary,penalty,reserved,shortfall,bond,status,outcome,filed_at,challenge_deadline,amount_paid,resolved_at,filed_tx,resolved_tx)
       values (12,1,$1,'late_completion','observer','client',50000000,50000000,0,10000000,'paid','upheld',
        '2026-10-17T14:05:40Z','2026-10-17T14:08:40Z',50000000,'2026-10-17T14:08:55Z',$2,$2)`,
        [payment, hash],
      );
      await pool.query("insert into cursors (name,ledger) values ('indexer:events',90)");
      registerWeekendRoutes(app, pool, {
        contracts: { registry: "registry", bond: "bond", scoreboard: "scoreboard" },
        lifetime: async () => ({ payments: "1" }),
        claimEvidence: async () => {
          throw new Error("Expected indexed evidence");
        },
        head: async () => ({ ledger: 100, closeTime: 1500n }),
        ledgerClose: async () => 1450n,
        evidence: async (id) => (id === evidence ? { hash: id } : null),
      });
      const get = async (path: string): Promise<unknown> => {
        const response = await app.inject({ url: path });
        expect(response.statusCode, response.body).toBe(200);
        return response.json() as unknown;
      };
      expect(await get("/v1/providers")).toMatchObject({
        items: [{ provider_id: provider, stake_total_display: "1000.0000000", score: null }],
        next_cursor: null,
      });
      const nextProvider = "f".repeat(64);
      await pool.query(
        "insert into providers (provider_id,admin,home_domain,signers,status,registered_at) values ($1,'admin','second.example','{}','active',now())",
        [nextProvider],
      );
      const firstPage = (await get("/v1/providers?limit=1")) as { next_cursor: string };
      expect(firstPage.next_cursor).toBeTruthy();
      expect(await get(`/v1/providers?limit=1&cursor=${firstPage.next_cursor}`)).toMatchObject({
        items: [{ provider_id: nextProvider }],
        next_cursor: null,
      });
      expect(await get(`/v1/providers/${provider}`)).toMatchObject({
        lifetime: { payments: "1" },
        claim_counts: { paid: 1 },
      });
      expect(await get("/v1/commitments/1")).toMatchObject({
        available_stake: "10000000000",
        max_penalty: "50000000",
        coverage_ratio: 1.5,
      });
      expect(await get("/v1/templates")).toEqual({ items: [body], next_cursor: null });
      expect(await get("/v1/templates/901")).toEqual(body);
      expect(await get(`/v1/claims?status=paid&provider=${provider}&commitment=1`)).toMatchObject({
        items: [{ claim_id: 12 }],
      });
      expect(await get("/v1/claims/12")).toEqual({
        claim_id: 12,
        status: "paid",
        outcome: "upheld",
        breach: "late_completion",
        commitment_id: 1,
        provider_id: provider,
        payment_id: payment,
        penalty: "50000000",
        penalty_display: "5.0000000",
        reserved: "50000000",
        shortfall: "0",
        amount_paid: "50000000",
        bond: "10000000",
        claimant: "observer",
        beneficiary: "client",
        filed_at: "2026-10-17T14:05:40Z",
        challenge_deadline: "2026-10-17T14:08:40Z",
        resolved_at: "2026-10-17T14:08:55Z",
        evidence_hash: evidence,
        votes: [],
        transactions: { filed: hash, resolved: hash },
        explorer_links: { filed: `https://stellar.expert/explorer/testnet/tx/${hash}` },
      });
      expect(await get(`/v1/payments/${payment}`)).toMatchObject({
        payment_id: payment,
        claim_id: 12,
        carve_outs: [],
      });
      expect(await get(`/v1/evidence/${evidence}`)).toEqual({ hash: evidence });
      expect(await get("/v1/network")).toMatchObject({
        network: "testnet",
        latest_ledger: 100,
        latest_indexed_ledger: 90,
        lag_seconds: 50,
      });
      const lowSample = "a".repeat(64);
      await pool.query(
        "insert into providers (provider_id,admin,home_domain,signers,status,registered_at) values ($1,'admin','sample.example','{}','active',now())",
        [lowSample],
      );
      await pool.query(
        `insert into commitments (commitment_id,provider_id,template_id,template_version,stake_asset,stake_total,stake_reserved,status,effective_from,updated_ledger)
       values (2,$1,901,1,'asset',10000000000,0,'active',now(),90),
              (3,$2,901,1,'asset',10000000000,0,'active',now(),90)`,
        [nextProvider, lowSample],
      );
      for (const [id, commitment, count, onTime] of [
        [provider, 1, 100, 80],
        [nextProvider, 2, 100, 100],
        [lowSample, 3, 1, 1],
      ] as const) {
        await pool.query(
          `insert into payments (payment_id,sep31_tx_id,provider_id,commitment_id,amount,asset,status,verdict,sender_country,receiver_country)
         select repeat(md5($1::text||n::text),2), n::text, $1,$2,100,'asset','resolved',
                case when n<=$4 then 'on_time' else 'late' end,'US','NG'
         from generate_series(1,$3::integer) n`,
          [id, commitment, count, onTime],
        );
      }
      await pool.query(
        `insert into batches (commitment_id,period,observer,merkle_root,stats)
       values (1,floor(extract(epoch from now())/86400)-1,'observer',$1,$2)`,
        [hash, { payments: 100, on_time: 90, carved_out: 0 }],
      );
      expect(await get("/v1/providers?limit=100")).toMatchObject({
        items: [
          { provider_id: provider, score: 90, source: "batches" },
          { provider_id: lowSample, score: null },
          { provider_id: nextProvider, score: 100, source: "observer_live" },
        ],
      });
      expect(await get("/v1/corridors/US-NG/rankings?template=901")).toMatchObject({
        items: [
          { provider_id: nextProvider, score: 100, source: "observer_live" },
          { provider_id: provider, score: 80, score_version: "0.1" },
          { provider_id: lowSample, score: null, score_status: "insufficient_data" },
        ],
        next_cursor: null,
      });
      expect((await app.inject({ url: "/v1/claims/999" })).statusCode).toBe(404);
      expect((await app.inject({ url: "/v1/claims?limit=201" })).statusCode).toBe(400);
    } finally {
      await app.close();
      await pool.end();
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  },
);
