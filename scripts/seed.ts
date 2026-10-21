/** Idempotent demo setup (VX-503, guide §10.4 and §6.10). */
import { Keypair } from "@stellar/stellar-sdk";
import { pathToFileURL } from "node:url";
import { invoke, manifestPath, readDeployment, writeJson } from "./lib/deployment.js";
import { server, verifyNetwork } from "./lib/usdc.js";
export function demoTemplate(asset: string) {
  return {
    id: 901,
    version: 1,
    metric: "TimeToCompletion",
    start_event: "OnChainSettled",
    end_event: "ReceiverCreditConfirmed",
    target_ms: 120000,
    grace_ms: 10000,
    penalty: { PerBreachBps: { bps: 500, cap: "1000000000" } },
    scope: {
      asset,
      direction: "Inbound",
      sender_country: null,
      receiver_country: null,
      min_amount: "10000000",
      max_amount: "100000000000",
      payout_rail: null,
    },
    carve_outs: ["ComplianceHoldDeclared"],
    max_hold_ms: 60000,
    claim_window_secs: 600,
    evidence_mode: "ObserverOnly",
    status: "Proposed",
    activates_at: 0,
  };
}
/** Accept only the specified demo terms, including version, before funding. */
export function assertDemoTemplate(value: unknown, asset: string, status: string): void {
  const same = (actual: unknown, expected: unknown): boolean => {
    if (typeof expected === "number")
      return (
        ((typeof actual === "number" && Number.isSafeInteger(actual)) ||
          (typeof actual === "string" && /^\d+$/.test(actual))) &&
        BigInt(actual as number | string) === BigInt(expected)
      );
    if (Array.isArray(expected))
      return (
        Array.isArray(actual) &&
        actual.length === expected.length &&
        expected.every((item, i) => same(actual[i], item))
      );
    if (expected !== null && typeof expected === "object")
      return (
        actual !== null &&
        typeof actual === "object" &&
        Object.entries(expected).every(([key, item]) =>
          same((actual as Record<string, unknown>)[key], item),
        )
      );
    return actual === expected;
  };
  const terms: Record<string, unknown> = { ...demoTemplate(asset), status };
  delete terms.activates_at;
  if (!same(value, terms))
    throw new Error("Existing template 901 differs from the required demo terms");
}
export async function waitUntil(eta: bigint): Promise<void> {
  for (;;) {
    const now = BigInt((await server.getLatestLedger()).closeTime);
    if (now >= eta) return;
    console.log(`Waiting for governance timelock: ${eta - now} seconds remain`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}
export function parseArgs(args: string[]): void {
  if (args.length && (args.length !== 2 || args[0] !== "--network" || args[1] !== "testnet"))
    throw new Error("Usage: seed.ts [--network testnet]");
}
interface Template {
  status: string;
  activates_at: number | string;
  scope: { asset: string };
}
interface Provider {
  home_domain: string;
  verified: boolean;
  status: string;
}
interface Commitment {
  provider_id: string;
  template_id: number;
  template_version: number;
  stake_asset: string;
  stake_total: string;
  status: string;
}
export async function main(args = process.argv.slice(2)): Promise<void> {
  parseArgs(args);
  await verifyNetwork();
  const d = readDeployment();
  const reg = d.contracts.registry;
  const bond = d.contracts.bond;
  d.seed ??= { providerId: "", commitmentId: "" };
  const save = () => writeJson(manifestPath(), d);
  if (!invoke<boolean>(reg, "is_active_observer", { observer: d.accounts.observer })) {
    if (d.seed.observerActionId === undefined) {
      const key = Buffer.from(Keypair.fromPublicKey(d.accounts.observer).rawPublicKey()).toString(
        "hex",
      );
      d.seed.observerActionId = invoke<number>(
        reg,
        "propose",
        { kind: { AddObserver: [d.accounts.observer, key] } },
        "deployer",
        true,
      );
      save();
    }
    const action = invoke<{ eta: number | string; cancelled: boolean; executed: boolean }>(
      reg,
      "action",
      { id: d.seed.observerActionId },
    );
    if (action.cancelled || action.executed)
      throw new Error("Observer proposal cannot be executed; reconcile registry state");
    await waitUntil(BigInt(action.eta) + 5n);
    invoke(reg, "execute", { action_id: d.seed.observerActionId }, "deployer", true);
    if (!invoke<boolean>(reg, "is_active_observer", { observer: d.accounts.observer }))
      throw new Error("Observer activation failed");
  }
  const ids = invoke<number[]>(reg, "template_ids");
  if (!ids.includes(901))
    invoke(reg, "propose_template", { template: demoTemplate(d.contracts.usdc) }, "deployer", true);
  let template = invoke<Template>(reg, "get_template_version", { id: 901, version: 1 });
  assertDemoTemplate(template, d.contracts.usdc, template.status);
  if (template.status === "Proposed") {
    await waitUntil(BigInt(template.activates_at) + 5n);
    invoke(reg, "activate_template", { id: 901, version: 1 }, "deployer", true);
  }
  template = invoke<Template>(reg, "get_template", { id: 901 });
  assertDemoTemplate(template, d.contracts.usdc, "Active");
  const home = "anchor.mock.vaeltrix.xyz";
  const providers = invoke<string[]>(reg, "providers_by_admin", {
    admin: d.accounts.providerAdmin,
  });
  let providerId = "";
  for (const id of providers)
    if (invoke<Provider>(reg, "get_provider", { id }).home_domain === home) {
      providerId = id;
      break;
    }
  if (!providerId) {
    const signer = Buffer.from(
      Keypair.fromPublicKey(d.accounts.providerAdmin).rawPublicKey(),
    ).toString("hex");
    providerId = invoke<string>(
      reg,
      "register_provider",
      {
        admin: d.accounts.providerAdmin,
        home_domain: home,
        signers: [signer],
        metadata_uri: `https://${home}/vaeltrix.json`,
      },
      "provider-admin",
      true,
    );
  }
  d.seed.providerId = providerId;
  save();
  let provider = invoke<Provider>(reg, "get_provider", { id: providerId });
  if (!provider.verified) {
    console.log("Manual testnet domain verification by the deployment admin (guide §10.1)");
    invoke(reg, "verify_domain", { provider_id: providerId }, "deployer", true);
  }
  provider = invoke<Provider>(reg, "get_provider", { id: providerId });
  if (!provider.verified || provider.status !== "Active")
    throw new Error("Provider not active and verified");
  let commitmentId = "";
  for (const id of invoke<Array<number | string>>(bond, "commitments_by_provider", {
    provider_id: providerId,
  })) {
    const c = invoke<Commitment>(bond, "commitment", { id: String(id) });
    if (
      c.template_id === 901 &&
      c.template_version === 1 &&
      c.stake_asset === d.contracts.usdc &&
      c.status === "Active" &&
      BigInt(c.stake_total) >= 10_000_000_000n
    ) {
      commitmentId = String(id);
      break;
    }
  }
  if (!commitmentId)
    commitmentId = String(
      invoke<number | string>(
        bond,
        "commit",
        {
          provider_id: providerId,
          template_id: 901,
          stake_asset: d.contracts.usdc,
          amount: "10000000000",
          max_volume_per_period: "0",
          period_secs: 0,
        },
        "provider-admin",
        true,
      ),
    );
  d.seed.commitmentId = commitmentId;
  save();
  if (BigInt(invoke<string>(bond, "available_stake", { id: commitmentId })) < 10_000_000_000n)
    throw new Error("Commitment is not funded");
  console.log(`Seed verified: provider ${providerId}, commitment ${commitmentId}, 1,000 test USDC`);
  console.log(
    "Delegation endpoint is not running yet (VX-609 #45). Sign this request per guide §12.3 before running it:",
  );
  console.log(
    `curl -X POST http://localhost:4001/v1/claims/delegate -H 'Content-Type: application/json' -H 'X-Vaeltrix-Key: <client-public-key-hex>' -H 'X-Vaeltrix-Timestamp: <unix-ms>' -H 'X-Vaeltrix-Signature: <signed-request-base64>' --data '${JSON.stringify({ client_account: d.accounts.client, beneficiary: d.accounts.client, provider_id: providerId })}'`,
  );
  console.log("No delegation was submitted.");
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Seed failed");
    process.exitCode = 1;
  });
