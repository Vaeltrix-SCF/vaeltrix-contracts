import { readFileSync } from "node:fs";
import { z } from "zod";
import { StrKey } from "@stellar/stellar-sdk";
const contract = z.string().refine(StrKey.isValidContract, "Invalid contract address");
export const deploymentSchema = z
  .object({
    network: z.literal("testnet"),
    rpcUrl: z.literal("https://soroban-testnet.stellar.org"),
    contracts: z.object({
      registry: contract,
      bond: contract,
      scoreboard: contract,
      usdc: contract,
    }),
  })
  .passthrough();
export const environmentSchema = z.object({
  STELLAR_NETWORK: z.literal("testnet").default("testnet"),
  STELLAR_RPC_URL: z
    .literal("https://soroban-testnet.stellar.org")
    .default("https://soroban-testnet.stellar.org"),
  HORIZON_URL: z
    .literal("https://horizon-testnet.stellar.org")
    .default("https://horizon-testnet.stellar.org"),
  NETWORK_PASSPHRASE: z
    .literal("Test SDF Network ; September 2015")
    .default("Test SDF Network ; September 2015"),
  DEPLOYMENTS_FILE: z.string().default("deployments/testnet.json"),
  DATABASE_URL: z.url().optional(),
});
/** Public configuration only; credentials remain with the consuming service. */
export function loadConfig(env: Record<string, string | undefined> = process.env) {
  const environment = environmentSchema.parse(env);
  const deployment = deploymentSchema.parse(
    JSON.parse(readFileSync(environment.DEPLOYMENTS_FILE, "utf8")),
  );
  return { environment, deployment };
}
