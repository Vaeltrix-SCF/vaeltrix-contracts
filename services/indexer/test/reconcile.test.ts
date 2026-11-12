import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { expect, it, vi } from "vitest";
import type { Commitment } from "@vaeltrix/bindings-bond";
import { pollOnce, snapshotName } from "../src/ingest.js";
import { reconcile } from "../src/reconcile.js";

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
      commitments: async () => [],
      commitment: async (): Promise<Commitment> => {
        throw new Error("unexpected commitment");
      },
      template: async () => {
        throw new Error("unexpected template");
      },
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
      commitments: 0,
      templates: 0,
      claims: 0,
    });
    expect((await pool.query("select provider_id,verified from providers")).rows).toEqual([
      { provider_id: seed, verified: true },
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
