import { Account, Address, Keypair, Networks, StrKey, contract, rpc } from "@stellar/stellar-sdk";
import { Client } from "@vaeltrix/bindings-scoreboard";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => vi.restoreAllMocks());

it("decodes deployment results as a generated client", async () => {
  const publicKey = Keypair.random().publicKey();
  const contractId = StrKey.encodeContract(Buffer.alloc(32, 1));
  const rpcUrl = "https://soroban-testnet.stellar.org";
  const server = new rpc.Server(rpcUrl);
  const options = { publicKey, rpcUrl, server, networkPassphrase: Networks.TESTNET };
  const spec = new Client({ ...options, contractId }).spec;
  vi.spyOn(server, "getContractWasmByHash").mockResolvedValue(new Uint8Array());
  vi.spyOn(server, "getAccount").mockResolvedValue(new Account(publicKey, "1"));
  vi.spyOn(contract.Spec, "fromWasm").mockReturnValue(spec);

  const deployment = await Client.deploy(
    { admin: publicKey, registry: contractId },
    { ...options, wasmHash: new Uint8Array(32), simulate: false },
  );
  const deployed = deployment.options.parseResultXdr(Address.fromString(contractId).toScVal());

  expect(deployed).toBeInstanceOf(Client);
  expect(deployed.options.contractId).toBe(contractId);
  expect(deployed.options.server).toBe(server);
  expect(deployed.fromJson.lifetime).toBeTypeOf("function");
});
