import { readFile } from "node:fs/promises";
import { Client as BondClient } from "@vaeltrix/bindings-bond";
import { Client as ScoreboardClient } from "@vaeltrix/bindings-scoreboard";
import { Networks, rpc, StrKey } from "@stellar/stellar-sdk";
import { z } from "zod";
import type { NetworkReads } from "./routes.js";

const rpcUrl = "https://soroban-testnet.stellar.org";
const contract = z.string().refine((id) => StrKey.isValidContract(id));
const manifest = z.object({
  network: z.literal("testnet"),
  rpcUrl: z.literal(rpcUrl),
  contracts: z.object({ registry: contract, bond: contract, scoreboard: contract }),
});

export async function networkReads(): Promise<NetworkReads> {
  const path =
    process.env.DEPLOYMENTS_FILE ?? new URL("../../../deployments/testnet.json", import.meta.url);
  const { contracts } = manifest.parse(JSON.parse(await readFile(path, "utf8")));
  const observer = new URL(process.env.OBSERVER_API_URL ?? "http://127.0.0.1:4001");
  if (!["http:", "https:"].includes(observer.protocol) || observer.username || observer.password)
    throw new Error("Invalid observer URL");
  const server = new rpc.Server(rpcUrl, { timeout: 10_000 });
  const options = { rpcUrl, networkPassphrase: Networks.TESTNET, server };
  const bond = new BondClient({ ...options, contractId: contracts.bond });
  const scoreboard = new ScoreboardClient({ ...options, contractId: contracts.scoreboard });
  return {
    contracts,
    lifetime: async (id) => {
      const value = (await scoreboard.lifetime({ provider_id: Buffer.from(id, "hex") })).result;
      return Object.fromEntries(
        Object.entries(value).map(([key, v]) => [key, typeof v === "bigint" ? v.toString() : v]),
      );
    },
    claimEvidence: async (id) => {
      const result = (await bond.claim({ id: BigInt(id) })).result;
      return result.isOk()
        ? Buffer.from(result.unwrap().payment.evidence_hash).toString("hex")
        : null;
    },
    head: async () => {
      const latest = await server.getLatestLedger();
      return { ledger: latest.sequence, closeTime: BigInt(latest.closeTime) };
    },
    ledgerClose: async (ledger) => {
      const health = await server.getHealth();
      if (ledger < health.oldestLedger) return null;
      const entry = (await server.getLedgers({ startLedger: ledger, pagination: { limit: 1 } }))
        .ledgers[0];
      return entry?.sequence === ledger ? BigInt(entry.ledgerCloseTime) : null;
    },
    evidence: async (hash) => {
      const response = await fetch(new URL(`/v1/evidence/${hash}`, observer), {
        signal: AbortSignal.timeout(5000),
        redirect: "error",
      });
      if (response.status === 404) return null;
      if (!response.ok || !response.body) throw new Error("Observer evidence unavailable");
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > 1024 * 1024) throw new Error("Observer evidence response too large");
        chunks.push(chunk);
      }
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    },
  };
}
