/** Idempotent testnet identities, SAC and classic balances (VX-501, guide §10.1–2). */
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  Address,
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
  xdr,
} from "@stellar/stellar-sdk";
export const rpcUrl = "https://soroban-testnet.stellar.org";
export const horizonUrl = "https://horizon-testnet.stellar.org";
export const roles = [
  "deployer",
  "usdc-issuer",
  "observer",
  "provider-admin",
  "client",
  "verifier",
] as const;
export type Role = (typeof roles)[number];
export const configDir = resolve(".stellar");
export function assertTestnet(): void {
  for (const [name, expected] of Object.entries({
    STELLAR_NETWORK: "testnet",
    STELLAR_RPC_URL: rpcUrl,
    HORIZON_URL: horizonUrl,
    NETWORK_PASSPHRASE: Networks.TESTNET,
    STELLAR_NETWORK_PASSPHRASE: Networks.TESTNET,
  }))
    if (process.env[name] && process.env[name] !== expected)
      throw new Error(`${name} must target the official testnet`);
}
export function cli(args: string[]): string {
  assertTestnet();
  mkdirSync(configDir, { recursive: true, mode: 0o700 });
  const result = spawnSync(
    process.env.STELLAR_BIN ?? "stellar",
    ["--config-dir", configDir, ...args],
    { encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error || result.status !== 0)
    throw new Error(
      `Stellar ${args.slice(0, 2).join(" ")} failed; inspect transaction state before retrying`,
    );
  return result.stdout.trim();
}
export const alias = (role: Role) => `vaeltrix-testnet-${role}`;
export const publicKey = (role: Role) => cli(["keys", "address", alias(role)]);
const signer = (role: Role) => Keypair.fromSecret(cli(["keys", "secret", alias(role)]));
export const horizon = new Horizon.Server(horizonUrl);
export const server = new rpc.Server(rpcUrl);
export function stroops(value: string): bigint {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) throw new Error("Invalid asset amount");
  const [whole = "0", fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}
export function decimal(value: bigint): string {
  if (value < 0n) throw new Error("Negative asset amount");
  return `${value / 10_000_000n}.${(value % 10_000_000n).toString().padStart(7, "0")}`;
}
export async function verifyNetwork(): Promise<void> {
  assertTestnet();
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET)
    throw new Error("RPC network mismatch");
}
async function classic(
  role: Role,
  operation: ReturnType<typeof Operation.changeTrust>,
): Promise<void> {
  const account = await horizon.loadAccount(publicKey(role));
  const tx = new TransactionBuilder(account, { fee: BASE_FEE, networkPassphrase: Networks.TESTNET })
    .addOperation(operation)
    .setTimeout(60)
    .build();
  tx.sign(signer(role));
  try {
    await horizon.submitTransaction(tx);
  } catch {
    throw new Error(
      `Classic transaction ${Buffer.from(tx.hash()).toString("hex")} failed or is uncertain; inspect before retrying`,
    );
  }
}
export async function provision(): Promise<{ accounts: Record<Role, string>; usdc: string }> {
  await verifyNetwork();
  if ((process.env.USDC_SOURCE ?? "self") !== "self")
    throw new Error("USDC_SOURCE=circle is not implemented; use self for freely minted test funds");
  const accounts = {} as Record<Role, string>;
  for (const role of roles) {
    try {
      accounts[role] = publicKey(role);
    } catch {
      cli(["keys", "generate", alias(role)]);
      accounts[role] = publicKey(role);
    }
    try {
      await horizon.loadAccount(accounts[role]);
    } catch (error) {
      if ((error as { response?: { status?: number } }).response?.status !== 404)
        throw new Error("Cannot read testnet account", { cause: error });
      const funded = await fetch(`https://friendbot.stellar.org?addr=${accounts[role]}`, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!funded.ok) throw new Error(`Friendbot funding failed for ${role}`, { cause: error });
      await horizon.loadAccount(accounts[role]);
    }
    console.log(`Testnet account ready: ${role} ${accounts[role]}`);
  }
  const asset = new Asset("USDC", accounts["usdc-issuer"]);
  const usdc = asset.contractId(Networks.TESTNET);
  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(usdc).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent,
    }),
  );
  if ((await server.getLedgerEntries(key)).entries.length === 0)
    cli([
      "contract",
      "asset",
      "deploy",
      "--asset",
      `USDC:${accounts["usdc-issuer"]}`,
      "--source",
      alias("deployer"),
      "--network",
      "testnet",
    ]);
  for (const [role, target] of [
    ["provider-admin", 100_000n],
    ["client", 10_000n],
    ["observer", 1_000n],
  ] as const) {
    let account = await horizon.loadAccount(accounts[role]);
    const find = () =>
      account.balances.find(
        (b) =>
          b.asset_type !== "native" &&
          "asset_code" in b &&
          b.asset_code === "USDC" &&
          b.asset_issuer === asset.issuer,
      );
    if (!find()) {
      await classic(role, Operation.changeTrust({ asset }));
      account = await horizon.loadAccount(accounts[role]);
    }
    const missing = target * 10_000_000n - stroops(find()?.balance ?? "0");
    if (missing > 0n)
      await classic(
        "usdc-issuer",
        Operation.payment({ destination: accounts[role], asset, amount: decimal(missing) }),
      );
  }
  console.log(`Test USDC ready: ${usdc}`);
  return { accounts, usdc };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  provision().catch(() => {
    console.error(
      "Testnet provisioning failed; no secrets logged. Check connectivity and account state.",
    );
    process.exitCode = 1;
  });
