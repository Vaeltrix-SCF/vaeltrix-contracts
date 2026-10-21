/** Testnet manifest and invocation helpers (VX-502, guide §10.3). */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Address, scValToNative, xdr } from "@stellar/stellar-sdk";
import { alias, cli, horizon, rpcUrl, server, type Role } from "./usdc.js";
export const names = ["registry", "scoreboard", "bond"] as const;
export type ContractName = (typeof names)[number];
export interface Deployment {
  network: "testnet";
  rpcUrl: string;
  deployedAt: string;
  gitSha: string;
  contracts: Record<ContractName | "usdc", string>;
  wasmHashes: Record<ContractName, string>;
  accounts: {
    admin: string;
    observer: string;
    usdcIssuer: string;
    providerAdmin: string;
    client: string;
    verifier: string;
  };
  startLedger: number;
  transactions: Array<{ contract: ContractName; hash: string; ledger: number }>;
  seed?: { providerId: string; commitmentId: string; observerActionId?: number };
}
export const manifestPath = () =>
  resolve(process.env.DEPLOYMENTS_FILE ?? "deployments/testnet.json");
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}
export function readDeployment(): Deployment {
  const d = JSON.parse(readFileSync(manifestPath(), "utf8")) as Deployment;
  if (
    d.network !== "testnet" ||
    d.rpcUrl !== rpcUrl ||
    !d.gitSha ||
    !Number.isInteger(d.startLedger)
  )
    throw new Error("Invalid testnet deployment manifest");
  for (const id of Object.values(d.contracts))
    if (!/^C[A-Z2-7]{55}$/.test(id)) throw new Error("Invalid contract ID");
  return d;
}
export function assertFresh(path: string, fresh: boolean): void {
  if (existsSync(path) && !fresh) throw new Error("Deployment exists; use --fresh explicitly");
}
export function invoke<T>(
  id: string,
  method: string,
  args: Record<string, unknown> = {},
  role: Role = "deployer",
  send = false,
): T {
  const flags = Object.entries(args).flatMap(([key, value]) => [
    `--${key.replaceAll("_", "-")}`,
    typeof value === "string" ? value : JSON.stringify(value),
  ]);
  const result = cli([
    "contract",
    "invoke",
    "--id",
    id,
    "--source",
    alias(role),
    "--network",
    "testnet",
    "--send",
    send ? "yes" : "no",
    "--",
    method,
    ...flags,
  ]);
  return JSON.parse(result) as T;
}
export const instanceKey = (id: string) =>
  xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(id).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
export async function deployedHash(id: string): Promise<string> {
  const value = (await server.getLedgerEntries(instanceKey(id))).entries[0]?.val;
  if (
    value?.type !== "contractData" ||
    value.contractData.val.type !== "scvContractInstance" ||
    value.contractData.val.instance.executable.type !== "contractExecutableWasm"
  )
    throw new Error("Contract instance absent or not WASM");
  return Buffer.from(value.contractData.val.instance.executable.wasmHash.toXdrObject()).toString(
    "hex",
  );
}
export async function maximumTtl(): Promise<number> {
  const key = xdr.LedgerKey.configSetting(
    new xdr.LedgerKeyConfigSetting({
      configSettingId: xdr.ConfigSettingId.configSettingStateArchival,
    }),
  );
  const value = (await server.getLedgerEntries(key)).entries[0]?.val;
  if (value?.type !== "configSetting" || value.configSetting.type !== "configSettingStateArchival")
    throw new Error("Missing network TTL configuration");
  return value.configSetting.stateArchivalSettings.maxEntryTtl;
}

/** Horizon can lag RPC: only accept a successful deploy returning this contract ID. */
export async function confirmDeployment(
  id: string,
  account: string,
): Promise<{ hash: string; ledger: number }> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const history = await horizon.transactions().forAccount(account).order("desc").limit(20).call();
    for (const candidate of history.records) {
      const tx = await server.getTransaction(candidate.hash);
      if (tx.status === "SUCCESS" && tx.returnValue && scValToNative(tx.returnValue) === id)
        return { hash: candidate.hash, ledger: tx.ledger };
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error(
    "Deployment transaction not confirmed; reconcile pending manifest before retrying",
  );
}
