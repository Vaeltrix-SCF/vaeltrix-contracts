import { expect, it, vi } from "vitest";
vi.mock("./lib/deployment.js", async (original) => ({
  ...(await original<typeof import("./lib/deployment.js")>()),
  invoke: vi.fn(),
  readDeployment: vi.fn(),
  writeJson: vi.fn(),
}));
import { invoke, readDeployment } from "./lib/deployment.js";
import { server } from "./lib/usdc.js";
import { demoTemplate, main } from "./seed.js";
it("executes the observer proposal using the frozen action_id argument and reuses existing stake", async () => {
  const account = "GBMQHKORPRE7RJR2FUSQZGJLFSSEBSOX4EZHO3N2R4ZRXCQZJ7ZUV35R";
  vi.mocked(readDeployment).mockReturnValue({
    network: "testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    deployedAt: "",
    gitSha: "revision",
    contracts: { registry: "registry", bond: "bond", scoreboard: "scoreboard", usdc: "asset" },
    wasmHashes: { registry: "", bond: "", scoreboard: "" },
    accounts: {
      admin: account,
      observer: account,
      usdcIssuer: account,
      providerAdmin: account,
      client: account,
      verifier: account,
    },
    startLedger: 1,
    transactions: [],
  });
  const network = vi
    .spyOn(server, "getNetwork")
    .mockResolvedValue({ passphrase: "Test SDF Network ; September 2015", protocolVersion: "29" });
  const ledger = vi
    .spyOn(server, "getLatestLedger")
    .mockResolvedValue({ closeTime: "100" } as Awaited<ReturnType<typeof server.getLatestLedger>>);
  let active = false;
  const calls: string[] = [];
  vi.mocked(invoke).mockImplementation(
    <T>(_id: string, method: string, args: Record<string, unknown> = {}): T => {
      calls.push(method);
      let result: unknown;
      switch (method) {
        case "is_active_observer":
          result = active;
          break;
        case "propose":
          result = 1;
          break;
        case "action":
          result = { eta: 0, cancelled: false, executed: false };
          break;
        case "execute":
          expect(args).toEqual({ action_id: 1 });
          active = true;
          result = null;
          break;
        case "template_ids":
          result = [901];
          break;
        case "get_template_version":
        case "get_template":
          result = { ...demoTemplate("asset"), status: "Active" };
          break;
        case "providers_by_admin":
          result = ["provider"];
          break;
        case "get_provider":
          result = { home_domain: "anchor.mock.vaeltrix.xyz", verified: true, status: "Active" };
          break;
        case "commitments_by_provider":
          result = ["1"];
          break;
        case "commitment":
          result = {
            template_id: 901,
            template_version: 1,
            stake_asset: "asset",
            stake_total: "10000000000",
            status: "Active",
          };
          break;
        case "available_stake":
          result = "10000000000";
          break;
        default:
          throw new Error(`Unexpected mutation: ${method}`);
      }
      return result as T;
    },
  );
  try {
    await main([]);
    await main([]);
    expect(calls.filter((x) => x === "propose")).toHaveLength(1);
    expect(calls).not.toContain("commit");
  } finally {
    network.mockRestore();
    ledger.mockRestore();
  }
});
