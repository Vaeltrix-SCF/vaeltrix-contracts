import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Account,
  Networks,
  TransactionBuilder,
  Operation,
  contract,
  rpc,
} from "@stellar/stellar-sdk";
import * as freighter from "@stellar/freighter-api";
import {
  assertWallet,
  connect,
  deployment,
  PASSPHRASE,
  poll,
  prepare,
  prepareTrustline,
  server,
  sign,
} from "../src/chain";

vi.mock("@stellar/freighter-api", () => ({
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  signTransaction: vi.fn(),
}));
const address = deployment.accounts.providerAdmin;
beforeEach(() => {
  vi.mocked(freighter.getAddress).mockResolvedValue({ address });
  vi.mocked(freighter.getNetworkDetails).mockResolvedValue({
    network: "TESTNET",
    networkUrl: "https://horizon-testnet.stellar.org",
    networkPassphrase: PASSPHRASE,
  });
  vi.spyOn(server, "getNetwork").mockResolvedValue({
    passphrase: PASSPHRASE,
    protocolVersion: "29",
    friendbotUrl: "https://friendbot.stellar.org",
  });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("wallet transaction boundaries", () => {
  it("rejects absent Freighter before requesting access", async () => {
    vi.mocked(freighter.isConnected).mockResolvedValue({ isConnected: false });
    await expect(connect()).rejects.toThrow("not detected");
    expect(freighter.requestAccess).not.toHaveBeenCalled();
  });
  it("bounds an unresponsive extension probe", async () => {
    vi.useFakeTimers();
    vi.mocked(freighter.isConnected).mockImplementation(() => new Promise(() => {}));
    const request = expect(connect()).rejects.toThrow("not detected");
    await vi.advanceTimersByTimeAsync(3000);
    await request;
  });
  it("rejects a wallet on the wrong network before preparing a transaction", async () => {
    vi.mocked(freighter.getNetworkDetails).mockResolvedValue({
      network: "CUSTOM",
      networkUrl: "",
      networkPassphrase: "wrong test network",
    });
    const account = vi.spyOn(server, "getAccount");
    await expect(prepareTrustline(address)).rejects.toThrow("Switch Freighter");
    expect(account).not.toHaveBeenCalled();
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });
  it("rejects an RPC passphrase mismatch and changed wallet accounts", async () => {
    vi.mocked(server.getNetwork).mockResolvedValueOnce({
      passphrase: "wrong test network",
      protocolVersion: "29",
    });
    await expect(assertWallet(address)).rejects.toThrow("Switch Freighter");
    vi.mocked(freighter.getAddress).mockResolvedValueOnce({ address: deployment.accounts.client });
    await expect(assertWallet(address)).rejects.toThrow("account changed");
  });
  it("prepares an exact deployment trustline without signing or sending", async () => {
    vi.spyOn(server, "getAccount").mockResolvedValue(new Account(address, "123"));
    const send = vi.spyOn(server, "sendTransaction");
    const preview = await prepareTrustline(address);
    const tx = TransactionBuilder.fromXDR(preview.xdr, Networks.TESTNET);
    expect(tx.networkPassphrase).toBe(PASSPHRASE);
    expect("source" in tx && tx.source).toBe(address);
    if (!("operations" in tx)) throw new Error("Expected ordinary transaction");
    expect(tx.operations[0]).toMatchObject({
      type: "changeTrust",
      line: { code: "USDC", issuer: deployment.accounts.usdcIssuer },
    });
    expect(freighter.signTransaction).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
  it("does not ask for a signature after a rejected simulation", async () => {
    vi.spyOn(server, "getAccount").mockResolvedValue(new Account(address, "123"));
    vi.spyOn(server, "getContractWasmByContractId").mockResolvedValue(new Uint8Array());
    vi.spyOn(contract.Spec, "fromWasm").mockReturnValue({
      funcArgsToScVals: () => [],
    } as unknown as contract.Spec);
    vi.spyOn(server, "simulateTransaction").mockResolvedValue({
      error: "contract rejected",
      latestLedger: 1,
      events: [],
      id: "simulation",
      _parsed: true,
    });
    await expect(
      prepare(
        address,
        { contractId: deployment.contracts.bond, method: "pause", args: { id: 1n } },
        "pause #1",
      ),
    ).rejects.toThrow("Simulation rejected");
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });
  it("rejects an expired preview before invoking the wallet", async () => {
    await expect(
      sign({ xdr: "", address, summary: "", fee: "100", createdAt: Date.now() - 121000 }),
    ).rejects.toThrow("expired");
    expect(freighter.signTransaction).not.toHaveBeenCalled();
  });
  it("rejects a wallet returning a different transaction", async () => {
    vi.spyOn(server, "getAccount").mockResolvedValue(new Account(address, "123"));
    const original = await prepareTrustline(address);
    const other = new TransactionBuilder(new Account(address, "125"), {
      fee: "100",
      networkPassphrase: PASSPHRASE,
    })
      .addOperation(Operation.manageData({ name: "changed", value: "1" }))
      .setTimeout(180)
      .build();
    vi.mocked(freighter.signTransaction).mockResolvedValue({
      signedTxXdr: other.toXDR(),
      signerAddress: address,
    });
    await expect(sign(original)).rejects.toThrow("different transaction");
  });
  it("polls unknown status without resubmitting", async () => {
    vi.useFakeTimers();
    const get = vi.spyOn(server, "getTransaction").mockResolvedValue({
      status: rpc.Api.GetTransactionStatus.NOT_FOUND,
      txHash: "ab".repeat(32),
      latestLedger: 1,
      latestLedgerCloseTime: 1,
      oldestLedger: 1,
      oldestLedgerCloseTime: 1,
    });
    const send = vi.spyOn(server, "sendTransaction");
    const request = poll("ab".repeat(32));
    await vi.runAllTimersAsync();
    expect(await request).toBe("PENDING");
    expect(get).toHaveBeenCalledTimes(12);
    expect(send).not.toHaveBeenCalled();
  });
});
