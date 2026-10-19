/** Apply guide §11.2 migrations in order, or reset the local development schema (VX-107). */
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import pg from "pg";

export const migrationsDir = fileURLToPath(new URL("../db/migrations/", import.meta.url));

export async function migrate(
  connectionString: string,
  command: "migrate" | "reset",
  directory = migrationsDir,
): Promise<string[]> {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL");
  }
  if (command === "reset" && !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) {
    throw new Error("db:reset is restricted to a local development database");
  }
  const files = (await readdir(directory)).filter((f) => /^\d{4}_[a-z0-9_]+\.sql$/.test(f)).sort();
  if (new Set(files.map((f) => f.slice(0, 4))).size !== files.length) {
    throw new Error("Migration sequence numbers must be unique");
  }
  if (files.length === 0) throw new Error("No SQL migrations found");
  const client = new pg.Client({ connectionString, connectionTimeoutMillis: 10_000 });
  const applied: string[] = [];
  await client.connect();
  try {
    // Session lock spans reset and every migration, preventing concurrent runners.
    await client.query("select pg_advisory_lock(107107)");
    if (command === "reset") {
      await client.query("begin");
      try {
        await client.query("drop schema public cascade; create schema public");
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    await client.query(`create table if not exists schema_migrations (
      name text primary key, checksum text not null,
      applied_at timestamptz not null default now()
    )`);
    const history = await client.query<{ name: string; checksum: string }>(
      "select name, checksum from schema_migrations order by name",
    );
    const known = new Map(history.rows.map((row) => [row.name, row.checksum]));
    for (const name of known.keys()) {
      if (!files.includes(name)) throw new Error(`Applied migration is missing: ${name}`);
    }
    for (const name of files) {
      const sql = await readFile(resolve(directory, name), "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      if (known.has(name)) {
        if (known.get(name) !== checksum)
          throw new Error(`Applied migration was modified: ${name}`);
        continue;
      }
      if (history.rows.some((row) => row.name > name)) {
        throw new Error(`Migration inserted before applied history: ${name}`);
      }
      await client.query("begin");
      try {
        await client.query(sql);
        await client.query("insert into schema_migrations (name, checksum) values ($1, $2)", [
          name,
          checksum,
        ]);
        await client.query("commit");
        applied.push(name);
      } catch (error) {
        await client.query("rollback");
        throw error;
      }
    }
    return applied;
  } finally {
    // Closing the connection also releases the advisory lock on failures.
    await client.end();
  }
}

async function main(): Promise<void> {
  if (existsSync(".env")) loadEnvFile(".env");
  const command = process.argv[2];
  if (command !== "migrate" && command !== "reset")
    throw new Error("Usage: tsx scripts/db.ts migrate|reset");
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const applied = await migrate(databaseUrl, command);
  console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Database is up to date");
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(() => {
    // Do not print connection errors that might include credentials or server data.
    console.error(
      "Database command failed. Check DATABASE_URL, database availability and migration history.",
    );
    process.exitCode = 1;
  });
}
