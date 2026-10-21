import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  Networks,
  Operation,
  StrKey,
  scValToNative,
  TransactionBuilder,
  contract,
  rpc,
} from "@stellar/stellar-sdk";
import * as freighter from "@stellar/freighter-api";
import deployment from "../../../deployments/testnet.json";
import {
  bytes,
  hex,
  latestPeriods,
  message,
  type Batch,
  type Commitment,
  type Provider,
  type Template,
} from "./model";

export { deployment };
export const server = new rpc.Server(deployment.rpcUrl, { timeout: 20_000 });
export const PASSPHRASE = Networks.TESTNET;
const specs = new Map<string, Promise<contract.Spec>>();
async function specFor(contractId: string) {
  let result = specs.get(contractId);
  if (!result) {
    result = server
      .getContractWasmByContractId(contractId)
      .then(contract.Spec.fromWasm)
      .catch((error: unknown) => {
        specs.delete(contractId);
        throw error;
      });
    specs.set(contractId, result);
  }
  return result;
}
function unwrap<T>(result: unknown): T {
  if (
    result &&
    typeof result === "object" &&
    "unwrap" in result &&
    typeof result.unwrap === "function"
  )
    return result.unwrap() as T;
  return result as T;
}
function build(source: Account, operation: ReturnType<Contract["call"]>) {
  return new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(operation)
    .setTimeout(180)
    .build();
}
export async function read<T>(
  contractId: string,
  method: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const spec = await specFor(contractId);
  const tx = build(
    new Account(deployment.accounts.admin, "0"),
    new Contract(contractId).call(method, ...spec.funcArgsToScVals(method, args)),
  );
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result)
    throw new Error(
      `Could not read ${method}: ${"error" in simulation ? simulation.error : "no result"}`,
    );
  return unwrap<T>(spec.funcResToNative(method, simulation.result.retval));
}
export async function snapshot(commitmentId: bigint) {
  const c = await read<Commitment>(deployment.contracts.bond, "commitment", { id: commitmentId });
  const [provider, template, periods, ledger, available] = await Promise.all([
    read<Provider>(deployment.contracts.registry, "get_provider", { id: c.provider_id }),
    read<Template>(deployment.contracts.registry, "get_template_version", {
      id: c.template_id,
      version: c.template_version,
    }),
    read<bigint[]>(deployment.contracts.scoreboard, "periods", { commitment_id: commitmentId }),
    server.getLatestLedger(),
    read<bigint>(deployment.contracts.bond, "available_stake", { id: commitmentId }),
  ]);
  const batches = await Promise.all(
    latestPeriods(periods).map(async (period) => ({
      period,
      batch: await read<Batch>(deployment.contracts.scoreboard, "batch", {
        commitment_id: commitmentId,
        period,
      }),
    })),
  );
  return {
    commitment: c,
    provider,
    template,
    batches,
    ledger: ledger.sequence,
    available,
    fetchedAt: new Date().toLocaleTimeString(),
  };
}
export type Snapshot = Awaited<ReturnType<typeof snapshot>>;
export async function connect(): Promise<string> {
  let timer: ReturnType<typeof globalThis.setTimeout> | undefined;
  try {
    const connection = await Promise.race([
      freighter.isConnected(),
      new Promise<never>((_resolve, reject) => {
        timer = globalThis.setTimeout(
          () =>
            reject(
              new Error(
                "Freighter was not detected. Install or unlock the extension, then reconnect.",
              ),
            ),
          3000,
        );
      }),
    ]);
    if (!connection.isConnected)
      throw new Error(
        "Freighter was not detected. Install or unlock the extension, then reconnect.",
      );
  } finally {
    globalThis.clearTimeout(timer);
  }
  const access = await freighter.requestAccess();
  if (access.error) throw new Error(access.error.message);
  if (!access.address)
    throw new Error("Install and unlock Freighter, then allow this app to connect.");
  await assertWallet(access.address);
  return access.address;
}
export async function assertWallet(address: string) {
  const [network, current, rpcNetwork] = await Promise.all([
    freighter.getNetworkDetails(),
    freighter.getAddress(),
    server.getNetwork(),
  ]);
  if (network.error || current.error)
    throw new Error(network.error?.message ?? current.error?.message ?? "Wallet unavailable.");
  if (network.networkPassphrase !== PASSPHRASE || rpcNetwork.passphrase !== PASSPHRASE)
    throw new Error("Switch Freighter to Stellar Testnet, then reconnect.");
  if (current.address !== address)
    throw new Error("Your wallet account changed. Reconnect before continuing.");
}
export interface Call {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
}
export interface Preview {
  xdr: string;
  address: string;
  summary: string;
  fee: string;
  createdAt: number;
}
export async function prepare(address: string, call: Call, summary: string): Promise<Preview> {
  await assertWallet(address);
  const [source, spec] = await Promise.all([server.getAccount(address), specFor(call.contractId)]);
  const tx = build(
    source,
    new Contract(call.contractId).call(
      call.method,
      ...spec.funcArgsToScVals(call.method, call.args),
    ),
  );
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation))
    throw new Error(
      `Simulation rejected: ${"error" in simulation ? simulation.error : "restore the account or contract before retrying"}`,
    );
  const assembled = rpc.assembleTransaction(tx, simulation).build();
  return { xdr: assembled.toXDR(), address, summary, fee: assembled.fee, createdAt: Date.now() };
}
export async function prepareTrustline(address: string): Promise<Preview> {
  await assertWallet(address);
  const source = await server.getAccount(address);
  const asset = new Asset("USDC", deployment.accounts.usdcIssuer);
  const tx = new TransactionBuilder(source, { fee: BASE_FEE, networkPassphrase: PASSPHRASE })
    .addOperation(Operation.changeTrust({ asset }))
    .setTimeout(180)
    .build();
  return {
    xdr: tx.toXDR(),
    address,
    summary: "Add a trustline for this deployment’s test USDC. This does not fund your account.",
    fee: tx.fee,
    createdAt: Date.now(),
  };
}
export async function sign(preview: Preview) {
  if (Date.now() - preview.createdAt > 120_000)
    throw new Error("Preview expired. Prepare the transaction again.");
  await assertWallet(preview.address);
  const signed = await freighter.signTransaction(preview.xdr, {
    networkPassphrase: PASSPHRASE,
    address: preview.address,
  });
  if (signed.error || !signed.signedTxXdr)
    throw new Error(signed.error?.message ?? "Wallet did not return a signed transaction.");
  if (Date.now() - preview.createdAt > 120_000)
    throw new Error("Preview expired while waiting for wallet approval. Prepare it again.");
  const transaction = TransactionBuilder.fromXDR(signed.signedTxXdr, PASSPHRASE);
  const original = TransactionBuilder.fromXDR(preview.xdr, PASSPHRASE);
  if (hex(transaction.hash()) !== hex(original.hash()))
    throw new Error("Wallet returned a different transaction. Nothing was submitted.");
  await assertWallet(preview.address);
  return transaction;
}
export async function poll(hash: string): Promise<"SUCCESS" | "FAILED" | "PENDING"> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const tx = await server.getTransaction(hash);
    if (tx.status === "SUCCESS" || tx.status === "FAILED") return tx.status;
    await new Promise((resolve) => globalThis.setTimeout(resolve, 2000));
  }
  return "PENDING";
}
export async function ownProviders(address: string) {
  const ids = await read<Uint8Array[]>(deployment.contracts.registry, "providers_by_admin", {
    admin: address,
  });
  return Promise.all(
    ids.map(async (providerId) => ({
      provider: await read<Provider>(deployment.contracts.registry, "get_provider", {
        id: providerId,
      }),
      commitments: await read<bigint[]>(deployment.contracts.bond, "commitments_by_provider", {
        provider_id: providerId,
      }),
    })),
  );
}
export function registration(address: string, domain: string): Call {
  return {
    contractId: deployment.contracts.registry,
    method: "register_provider",
    args: {
      admin: address,
      home_domain: domain,
      signers: [StrKey.decodeEd25519PublicKey(address)],
      metadata_uri: "",
    },
  };
}
export function commitCall(providerId: string, stake: bigint): Call {
  return {
    contractId: deployment.contracts.bond,
    method: "commit",
    args: {
      provider_id: bytes(providerId),
      template_id: 901,
      stake_asset: deployment.contracts.usdc,
      amount: stake,
      max_volume_per_period: 0n,
      period_secs: 86400n,
    },
  };
}
export async function balance(address: string): Promise<bigint> {
  const tx = build(
    new Account(address, "0"),
    new Contract(deployment.contracts.usdc).call("balance", new Address(address).toScVal()),
  );
  const simulation = await server.simulateTransaction(tx);
  if (!rpc.Api.isSimulationSuccess(simulation) || !simulation.result)
    throw new Error("Could not read test USDC balance. Fund this account with test XLM first.");
  return scValToNative(simulation.result.retval) as bigint;
}
export async function apiCheck(origin: string) {
  const responses = await Promise.all(
    ["/healthz", "/v1/openapi.json"].map(async (path) => {
      try {
        const response = await globalThis.fetch(origin + path, {
          signal: AbortSignal.timeout(10_000),
          credentials: "omit",
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: unknown = await response.json();
        return { path, ok: true, data };
      } catch (error) {
        return { path, ok: false, data: message(error) };
      }
    }),
  );
  return responses;
}
