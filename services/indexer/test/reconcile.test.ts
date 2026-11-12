import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { expect, it, vi } from "vitest";
import type { SlaTemplate } from "@vaeltrix/bindings-registry";
import { pollOnce, snapshotName } from "../src/ingest.js";
import { reconcile } from "../src/reconcile.js";

const template: SlaTemplate = {
  id: 901,
  version: 1,
  activates_at: 100n,
  carve_outs: [],
  claim_window_secs: 600n,
  end_event: { tag: "ReceiverCreditConfirmed", values: undefined },
  evidence_mode: { tag: "ObserverOnly", values: undefined },
  grace_ms: 10_000n,
  max_hold_ms: 60_000n,
  metric: { tag: "TimeToCompletion", values: undefined },
  penalty: { tag: "PerBreachBps", values: [{ bps: 500, cap: 1_000_000_000n }] },
  scope: {
    asset: "test-asset",
    direction: { tag: "Inbound", values: undefined },
    max_amount: 100_000_000_000n,
    min_amount: 10_000_000n,
    payout_rail: null,
    receiver_country: null,
    sender_country: null,
  },
  start_event: { tag: "OnChainSettled", values: undefined },
  status: { tag: "Active", values: undefined },
  target_ms: 120_000n,
};

const url = process.env.DATABASE_TEST_URL;
it.skipIf(!url)("refreshes known views without advancing or replaying the checkpoint", async () => {
  if (!url || !new URL(url).pathname.endsWith("_test"))
    throw new Error("Disposable database required");
  const schema = `reconcile_test_${randomBytes(8).toString("hex")}`;
  const admin = new pg.Pool({ connectionString: url });
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  try {
    await admin.query(`create schema ${schema}`);
    for (const name of ["0001_core.sql", "0003_indexer_projections.sql"]) {
      await pool.query(
        await readFile(new URL(`../../../db/migrations/${name}`, import.meta.url), "utf8"),
      );
    }
    await pool.query(
      "insert into cursors (name,ledger,paging_token) values ('indexer:events',100,'kept')",
    );
    const key = Buffer.alloc(32, 1);
    const seed = key.toString("hex");
    const views: Parameters<typeof reconcile>[1] = {
      provider: async (id) => ({
        id,
        admin: "admin",
        home_domain: "anchor.example",
        metadata_uri: "",
        signers: [key],
        verified: true,
        status: { tag: "Active", values: undefined },
        registered_at: 10n,
      }),
      commitments: async () => [1n],
      commitment: async (id) => ({
        id,
        provider_id: key,
        template_id: 901,
        template_version: 1,
        stake_asset: "test-asset",
        stake_total: 10_000_000_000n,
        stake_reserved: 0n,
        min_stake: 1n,
        effective_from: 100n,
        effective_to: null,
        exit_requested_at: null,
        paused_at: null,
        resumed_at: null,
        exit_cooldown_secs: 1000n,
        max_volume_per_period: 0n,
        period_secs: 0n,
        open_claims: 0,
        status: { tag: "Active", values: undefined },
      }),
      template: async () => template,
      claim: async () => {
        throw new Error("unexpected claim");
      },
    };
    const broken = {
      ...views,
      commitments: async () => {
        throw new Error("RPC unavailable");
      },
    };
    await expect(reconcile(pool, broken, 200, seed)).rejects.toThrow("RPC unavailable");
    expect((await pool.query("select * from providers")).rows).toEqual([]);
    await expect(reconcile(pool, views, 200, seed)).resolves.toEqual({
      providers: 1,
      commitments: 1,
      templates: 1,
      claims: 0,
    });
    expect((await pool.query("select provider_id,verified from providers")).rows).toEqual([
      { provider_id: seed, verified: true },
    ]);
    expect((await pool.query("select commitment_id,stake_total from commitments")).rows).toEqual([
      { commitment_id: "1", stake_total: "10000000000" },
    ]);
    expect((await pool.query("select template_id,status from templates")).rows).toEqual([
      { template_id: 901, status: "active" },
    ]);
    expect(
      (await pool.query("select name,ledger,paging_token from cursors order by name")).rows,
    ).toEqual([
      { name: "indexer:events", ledger: "100", paging_token: "kept" },
      { name: snapshotName, ledger: "200", paging_token: null },
    ]);
    const rpc = { getEvents: vi.fn(), getHealth: vi.fn() };
    await expect(
      pollOnce(pool, rpc, { registry: "", bond: "", scoreboard: "" }, 100),
    ).rejects.toThrow("Partial snapshot installed");
    expect(rpc.getEvents).not.toHaveBeenCalled();
  } finally {
    await pool.end();
    await admin.query(`drop schema if exists ${schema} cascade`);
    await admin.end();
  }
});
