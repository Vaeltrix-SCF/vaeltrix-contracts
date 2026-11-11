/** VX-701: run the Testnet contract event indexer (guide §13.1). */
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";
import { Networks, rpc, StrKey } from "@stellar/stellar-sdk";
import Fastify from "fastify";
import pg from "pg";
import { z } from "zod";
import { pollOnce, RetentionGap } from "./ingest.js";

const testnetRpc = "https://soroban-testnet.stellar.org";
const contractId = z.string().refine((value) => StrKey.isValidContract(value));
const deployment = z.object({
  network: z.literal("testnet"),
  rpcUrl: z.literal(testnetRpc),
  startLedger: z.int().min(1).max(0xffff_ffff),
  contracts: z.object({ registry: contractId, bond: contractId, scoreboard: contractId }),
});
const environment = z.object({
  DATABASE_URL: z.url().refine((url) => /^postgres(?:ql)?:\/\//.test(url)),
  DEPLOYMENTS_FILE: z.string().min(1).optional(),
  STELLAR_NETWORK: z.literal("testnet").optional(),
  STELLAR_RPC_URL: z.literal(testnetRpc).optional(),
  NETWORK_PASSPHRASE: z.literal(Networks.TESTNET).optional(),
  INDEXER_PORT: z.coerce.number().int().min(1).max(65535).default(4002),
});

export async function main(): Promise<void> {
  const env = environment.safeParse(process.env);
  if (!env.success) {
    throw new Error(
      `Invalid indexer configuration: ${env.error.issues.map((i) => i.path.join(".")).join(", ")}`,
    );
  }
  // Package scripts start from services/indexer; an explicit path is relative to the caller.
  const path =
    env.data.DEPLOYMENTS_FILE ?? new URL("../../../deployments/testnet.json", import.meta.url);
  const config = deployment.parse(JSON.parse(await readFile(path, "utf8")));
  const pool = new pg.Pool({
    connectionString: env.data.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  });
  const server = new rpc.Server(config.rpcUrl, { timeout: 10_000 });
  const app = Fastify({ logger: true });
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
    await app.listen({ host: "0.0.0.0", port: env.data.INDEXER_PORT });
    while (!stop.signal.aborted) {
      try {
        const count = await pollOnce(pool, server, config.contracts, config.startLedger);
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
