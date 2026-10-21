import { mkdtemp, copyFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { readonlyPool, verifyReadonly } from "../services/api/src/database.js";
import { migrate, migrationsDir } from "./db.js";

it("refuses to reset a remote database before connecting", async () => {
  await expect(migrate("postgres://user:pass@example.com/production", "reset")).rejects.toThrow(
    "local development database",
  );
});

it.each([
  "postgres://user:pass@localhost/vaeltrix?host=db.remote.example",
  "postgres://user:pass@127.0.0.1/vaeltrix?%68ost=db.remote.example",
  "postgres://user:pass@[::1]/vaeltrix?host=localhost&host=db.remote.example",
])("rejects reset host overrides before connecting: %s", async (connectionString) => {
  const connect = vi.spyOn(pg.Client.prototype, "connect").mockImplementation(() => {
    throw new Error("Unexpected database connection");
  });
  try {
    await expect(migrate(connectionString, "reset")).rejects.toThrow("local development database");
    expect(connect).not.toHaveBeenCalled();
  } finally {
    connect.mockRestore();
  }
});

// Opt in with a disposable local database; never repurpose DATABASE_URL for tests.
const url = process.env.DATABASE_TEST_URL;
describe.skipIf(!url)("Postgres migrations", () => {
  let client: pg.Client;
  let directory: string;
  beforeAll(async () => {
    if (!url) throw new Error("DATABASE_TEST_URL required");
    directory = await mkdtemp(join(tmpdir(), "vaeltrix-migrations-"));
    await copyFile(join(migrationsDir, "0001_core.sql"), join(directory, "0001_core.sql"));
    await copyFile(
      join(migrationsDir, "0002_api_readonly.sql"),
      join(directory, "0002_api_readonly.sql"),
    );
    client = new pg.Client({ connectionString: url });
    await client.connect();
  });
  afterAll(async () => {
    await client?.end();
    if (directory) await rm(directory, { recursive: true, force: true });
  });

  it("runs db:reset and db:migrate twice without duplicates", async () => {
    for (const command of ["reset", "migrate", "reset", "migrate"]) {
      const result = spawnSync(process.execPath, ["--import", "tsx", "scripts/db.ts", command], {
        env: { ...process.env, DATABASE_URL: url },
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
    }
    expect((await client.query("select name from schema_migrations")).rows).toEqual([
      { name: "0001_core.sql" },
      { name: "0002_api_readonly.sql" },
    ]);
    const tables = await client.query(
      "select tablename from pg_tables where schemaname = 'public'",
    );
    expect(tables.rows.map((row: { tablename: string }) => row.tablename).sort()).toEqual([
      "attestations",
      "batches",
      "chain_events",
      "claim_votes",
      "claims",
      "commitments",
      "cursors",
      "delegations",
      "evidence_bundles",
      "observer_jobs",
      "payments",
      "providers",
      "schema_migrations",
      "signed_events",
      "templates",
    ]);
  });

  it("keeps full i128 precision and rejects duplicate jobs", async () => {
    await client.query(
      "insert into providers values ('provider', 'admin', 'anchor.example', null, '{}', false, 'active', now())",
    );
    const amount = "170141183460469231731687303715884105727";
    await client.query(
      "insert into payments (payment_id, sep31_tx_id, provider_id, amount, asset, status) values ('p', 'tx', 'provider', $1, 'asset', 'tagged')",
      [amount],
    );
    expect(
      (await client.query("select amount from payments where payment_id = 'p'")).rows[0].amount,
    ).toBe(amount);
    await client.query(
      "insert into observer_jobs (kind, ref, status) values ('file_claim', 'p', 'queued')",
    );
    await expect(
      client.query(
        "insert into observer_jobs (kind, ref, status) values ('file_claim', 'p', 'queued')",
      ),
    ).rejects.toMatchObject({ code: "23505" });
  });

  it("API connections use SELECT-only role and cannot write even in read-write mode", async () => {
    if (!url) throw new Error("DATABASE_TEST_URL required");
    const pool = readonlyPool(url);
    try {
      await verifyReadonly(pool);
      expect((await pool.query("select count(*) from providers")).rows[0].count).toBe("1");
      await expect(pool.query("delete from providers")).rejects.toMatchObject({ code: "25006" });
      const connection = await pool.connect();
      try {
        await connection.query("begin read write");
        await expect(connection.query("delete from providers")).rejects.toMatchObject({
          code: "42501",
        });
      } finally {
        await connection.query("rollback");
        connection.release();
      }
    } finally {
      await pool.end();
    }
  });

  it("rolls back failed migration SQL and its history", async () => {
    if (!url) throw new Error("DATABASE_TEST_URL required");
    await writeFile(
      join(directory, "0003_bad.sql"),
      "create table rollback_probe (id int); select nonexistent_column;",
    );
    await expect(migrate(url, "migrate", directory)).rejects.toThrow();
    expect(
      (await client.query("select to_regclass('rollback_probe') as probe")).rows[0].probe,
    ).toBeNull();
    expect((await client.query("select count(*) from schema_migrations")).rows[0].count).toBe("2");
    await rm(join(directory, "0003_bad.sql"));
  });

  it("rejects edits to already applied migrations", async () => {
    if (!url) throw new Error("DATABASE_TEST_URL required");
    await writeFile(join(directory, "0001_core.sql"), "-- changed after application");
    await expect(migrate(url, "migrate", directory)).rejects.toThrow("modified");
  });
});
