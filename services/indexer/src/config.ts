import { readFile } from "node:fs/promises";
import { Networks, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";

const testnetRpc = "https://soroban-testnet.stellar.org";
const contractId = z.string().refine((value) => StrKey.isValidContract(value));
const deployment = z.object({
  network: z.literal("testnet"),
  rpcUrl: z.literal(testnetRpc),
  startLedger: z.int().min(1).max(0xffff_ffff),
  seed: z
    .object({
      providerId: z.string().regex(/^(?:[a-f0-9]{64})?$/),
    })
    .optional(),
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

export async function readConfig() {
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
  return { config, env: env.data };
}
