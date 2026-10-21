/** Deploy Registry → Scoreboard → Bond and wire set_bond (VX-502, guide §10.3). */
import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync, copyFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { alias, cli, provision, rpcUrl, verifyNetwork } from "./lib/usdc.js";
import {
  assertFresh,
  deployedHash,
  invoke,
  manifestPath,
  maximumTtl,
  confirmDeployment,
  names,
  writeJson,
  type Deployment,
} from "./lib/deployment.js";
export function parseArgs(args: string[]): boolean {
  let fresh = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--fresh") fresh = true;
    else if (args[i] === "--network" && args[++i] === "testnet") continue;
    else throw new Error("Usage: deploy.ts [--network testnet] [--fresh]");
  }
  return fresh;
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  const fresh = parseArgs(args);
  const path = manifestPath();
  assertFresh(path, fresh);
  const pending = `${path}.pending.json`;
  if (existsSync(pending))
    throw new Error(
      "Pending deployment exists; inspect it and reconcile on-chain state before starting another deployment",
    );
  const dirty = execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
    encoding: "utf8",
  }).trim();
  if (dirty) throw new Error("Commit tracked source changes before deployment");
  await verifyNetwork();
  const maxTtl = await maximumTtl();
  if (2_073_600 >= maxTtl || 518_400 >= maxTtl || 1_555_200 >= maxTtl)
    throw new Error("Contract TTL constants must be below network maximum");
  cli(["contract", "build"]);
  const { accounts, usdc } = await provision();
  const params = JSON.parse(readFileSync("config/params.testnet.json", "utf8")) as Record<
    string,
    unknown
  >;
  params.allowed_stake_assets = [usdc];
  const d: Deployment = {
    network: "testnet",
    rpcUrl,
    deployedAt: new Date().toISOString(),
    gitSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    contracts: { registry: "", scoreboard: "", bond: "", usdc },
    wasmHashes: { registry: "", scoreboard: "", bond: "" },
    accounts: {
      admin: accounts.deployer,
      observer: accounts.observer,
      usdcIssuer: accounts["usdc-issuer"],
      providerAdmin: accounts["provider-admin"],
      client: accounts.client,
      verifier: accounts.verifier,
    },
    startLedger: 0,
    transactions: [],
  };
  const salts = Object.fromEntries(names.map((name) => [name, randomBytes(32).toString("hex")]));
  writeJson(pending, { ...d, salts });
  for (const name of names) {
    const wasm = `target/wasm32v1-none/release/vaeltrix_${name}.wasm`;
    d.wasmHashes[name] = createHash("sha256").update(readFileSync(wasm)).digest("hex");
    const constructor = ["--admin", accounts.deployer];
    if (name === "registry") constructor.push("--params", JSON.stringify(params));
    else constructor.push("--registry", d.contracts.registry);
    if (name === "bond") constructor.push("--scoreboard", d.contracts.scoreboard);
    console.log(`Deploying ${name} on testnet`);
    d.contracts[name] = cli([
      "contract",
      "deploy",
      "--network",
      "testnet",
      "--source",
      alias("deployer"),
      "--wasm",
      wasm,
      "--salt",
      salts[name] ?? "",
      "--",
      ...constructor,
    ]);
    writeJson(pending, { ...d, salts });
    const tx = await confirmDeployment(d.contracts[name], accounts.deployer);
    if (name === "registry") d.startLedger = tx.ledger;
    d.transactions.push({ contract: name, hash: tx.hash, ledger: tx.ledger });
    if ((await deployedHash(d.contracts[name])) !== d.wasmHashes[name])
      throw new Error("Deployed WASM hash mismatch");
    writeJson(pending, { ...d, salts });
    console.log(`${name}: ${d.contracts[name]}`);
  }
  invoke(d.contracts.scoreboard, "set_bond", { bond: d.contracts.bond }, "deployer", true);
  if (invoke<string>(d.contracts.scoreboard, "bond") !== d.contracts.bond)
    throw new Error("Bond wiring mismatch");
  if (existsSync(path)) copyFileSync(path, `${path}.${Date.now()}.bak`);
  writeJson(path, d);
  const { unlinkSync } = await import("node:fs");
  unlinkSync(pending);
  console.log(`Deployment verified and recorded: ${path}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Deployment failed");
    process.exitCode = 1;
  });
