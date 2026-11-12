/** VX-701: run the Testnet contract event indexer (guide §13.1). */
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { Client as BondClient } from "@vaeltrix/bindings-bond";
import { Client as RegistryClient } from "@vaeltrix/bindings-registry";
import { Networks, rpc } from "@stellar/stellar-sdk";
import Fastify from "fastify";
import pg from "pg";
import { readConfig } from "./config.js";
import { pollOnce, RetentionGap } from "./ingest.js";
import { createProjector } from "./projections.js";

export async function main(): Promise<void> {
  const { config, env } = await readConfig();
  const pool = new pg.Pool({
    connectionString: env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  const server = new rpc.Server(config.rpcUrl, { timeout: 10_000 });
  const app = Fastify({ logger: true });
  const options = { rpcUrl: config.rpcUrl, networkPassphrase: Networks.TESTNET, server };
  const registry = new RegistryClient({ ...options, contractId: config.contracts.registry });
  const bond = new BondClient({ ...options, contractId: config.contracts.bond });
  const project = createProjector(
    {
      provider: async (id) => (await registry.get_provider({ id })).result.unwrap(),
      template: async (id, version) =>
        (await registry.get_template_version({ id, version })).result.unwrap(),
      claim: async (id) => (await bond.claim({ id })).result.unwrap(),
    },
    ({ contract, topic }) => app.log.warn({ contract, topic }, "Stored unknown contract event"),
  );
  const stop = new AbortController();
  const shutdown = () => stop.abort();
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
  let status: "starting" | "ok" | "retrying" | "reconcile_required" = "starting";
  pool.on("error", () => {
    status = "retrying";
    app.log.error("Indexer lost a PostgreSQL connection");
  });
  app.get("/healthz", async (_req, reply) =>
    reply.code(status === "ok" ? 200 : 503).send({ status }),
  );

  try {
    await pool.query("select 1");
    if ((await server.getNetwork()).passphrase !== Networks.TESTNET) {
      throw new Error("Indexer RPC network mismatch");
    }
    await app.listen({ host: "0.0.0.0", port: env.INDEXER_PORT });
    while (!stop.signal.aborted) {
      try {
        const count = await pollOnce(pool, server, config.contracts, config.startLedger, project);
        status = "ok";
        if (count > 0) continue;
      } catch (error) {
        if (error instanceof RetentionGap) {
          if (status !== "reconcile_required") app.log.error(error.message);
          status = "reconcile_required";
        } else {
          if (status !== "retrying")
            app.log.error("Indexer event polling failed; checkpoint unchanged");
          status = "retrying";
        }
      }
      await delay(2_000, undefined, { signal: stop.signal }).catch(() => undefined);
    }
  } finally {
    process.removeListener("SIGINT", shutdown);
    process.removeListener("SIGTERM", shutdown);
    await app.close();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Indexer failed to start");
    process.exitCode = 1;
  });
}
