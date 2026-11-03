import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { Address, Keypair, xdr } from "@stellar/stellar-sdk";
import { describe, it, expect } from "vitest";
import * as core from "../src/index.js";
const required = (values: Record<string, string>, key: string): string => {
  const value = values[key];
  if (value === undefined) throw new Error(`Missing fixture ${key}`);
  return value;
};
const load = (file: string) =>
  JSON.parse(
    readFileSync(new URL(`../../../test-vectors/${file}.json`, import.meta.url), "utf8"),
  ) as Array<Record<string, unknown>>;
const integerize = (value: unknown): unknown => {
  if (typeof value === "number" || (typeof value === "string" && /^-?\d+$/.test(value)))
    return BigInt(value);
  if (Array.isArray(value)) return value.map(integerize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, integerize(v)]));
  return value;
};
describe("production shared vectors", () => {
  for (const c of load("verdict"))
    it(String(c.name), () => {
      const x = integerize(c.input) as Record<string, bigint>;
      const fields: Record<string, string[]> = {
        deadline_ms: ["t0_ms", "target_ms", "grace_ms", "pause_ms"],
        evaluate: ["t0_ms", "t1_ms", "now_ms", "target_ms", "grace_ms", "pause_ms"],
        penalty: ["amount", "bps", "cap"],
        max_penalty: ["max_amount", "bps", "cap"],
        claim_bond: ["penalty", "min_bond", "bond_bps"],
        min_stake: ["floor", "k", "daily_cap", "bps"],
        exit_cooldown_secs: ["claim_window", "challenge", "attestation", "extra"],
        claim_deadline_ms: ["deadline_ms", "claim_window_secs"],
        split_rejected_bond: ["bond", "provider_bps", "observers"],
        apply_carve_outs: ["events", "max_hold_ms"],
      };
      const name = String(c.fn);
      const functions = core as unknown as Record<string, (...args: unknown[]) => unknown>;
      expect(functions[name]?.(...(fields[name] ?? []).map((key) => x[key]))).toEqual(
        integerize(c.expect),
      );
    });
  for (const c of load("ids"))
    it(String(c.name), () => {
      const input = c.input as Record<string, string>,
        expected = c.expect as Record<string, string>;
      const admin = Address.fromScAddress(
        xdr.ScAddress.fromXDR(required(input, "admin_scaddress_xdr"), "hex"),
      ).toString();
      const provider = core.providerId(required(input, "home_domain"), admin);
      expect(provider).toBe(expected.provider_id);
      expect(core.paymentId(required(input, "sep31_tx_id"), provider)).toBe(expected.payment_id);
    });
  for (const c of load("receipts"))
    it(String(c.name), () => {
      const input = c.input as Record<string, string>,
        expected = c.expect as Record<string, string>;
      const fields = {
        payment_id: required(input, "payment_id"),
        commitment_id: BigInt(required(input, "commitment_id")),
        amount: BigInt(required(input, "amount")),
        t0_ms: BigInt(required(input, "t0_ms")),
        t1_ms: BigInt(required(input, "t1_ms")),
        pause_ms: BigInt(required(input, "pause_ms")),
      };
      const key = Keypair.fromRawEd25519Seed(Buffer.from(required(input, "test_seed_hex"), "hex"));
      expect(core.receiptBytes(fields, required(input, "network_passphrase")).toString("hex")).toBe(
        expected.message_hex,
      );
      expect(
        core.signReceipt(fields, required(input, "network_passphrase"), key).toString("hex"),
      ).toBe(expected.signature_hex);
      expect(
        core.verifyReceipt(
          fields,
          required(input, "network_passphrase"),
          Buffer.from(required(expected, "signature_hex"), "hex"),
          required(expected, "signer_hex"),
        ),
      ).toBe(true);
      expect(
        core.verifyReceipt(
          { ...fields, pause_ms: fields.pause_ms ^ 1n },
          required(input, "network_passphrase"),
          Buffer.from(required(expected, "signature_hex"), "hex"),
          required(expected, "signer_hex"),
        ),
      ).toBe(false);
    });
});
it("round trips signed i128 amounts and rejects precision loss", () => {
  for (const value of [0n, 1n, -1n, (1n << 127n) - 1n, -(1n << 127n)])
    expect(core.toStroops(core.fromStroops(value))).toBe(value);
  for (const value of ["1e7", "1.00000001", "NaN", " 1", ".1"])
    expect(() => core.toStroops(value)).toThrow();
  expect(() => core.fromStroops(1n << 127n)).toThrow();
});
it("signs canonical events, binds signer and rejects tampering", () => {
  const key = Keypair.fromRawEd25519Seed(Buffer.alloc(32, 1));
  const event = core.signEvent(
    {
      v: 1,
      network: "testnet",
      event: "receiver_credit_confirmed",
      ts: "2026-10-17T14:03:22.418Z",
    },
    key,
  );
  const keys = [Buffer.from(key.rawPublicKey()).toString("hex")];
  expect(core.verifyEvent(event, keys)).toBe(true);
  expect(core.verifyEvent(event, [])).toBe(false);
  expect(core.verifyEvent({ ...event, network: "other" }, keys)).toBe(false);
  expect(core.jcsHash({ b: 2, a: 1 })).toBe(core.jcsHash({ a: 1, b: 2 }));
  expect(() => core.canonicalize({ bad: Infinity })).toThrow();
});
it("promotes odd Merkle nodes and reconstructs every proof", () => {
  const records = [3, 1, 2, 5, 4].map((id) => ({
    payment_id: id.toString(16).padStart(64, "0"),
    amount: "100",
    t0_ms: 1_760_000_000_000n,
    t1_ms: null,
    pause_ms: 0n,
    carve_out: null,
    breach: true,
  }));
  const hash = (...parts: Buffer[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
  const root = core.merkleRoot(records);
  expect(core.merkleRoot([...records].reverse())).toBe(root);
  expect(core.merkleRoot([])).toBe("00".repeat(32));
  for (const record of records) {
    const json = `{"amount":"100","breach":true,"carve_out":null,"pause_ms":0,"payment_id":"${record.payment_id}","t0_ms":1760000000000,"t1_ms":null}`;
    let node = hash(Buffer.from([0]), Buffer.from(json));
    for (const step of core.merkleProof(records, record.payment_id)) {
      const sibling = Buffer.from(step.hash, "hex");
      node =
        step.side === "left"
          ? hash(Buffer.from([1]), sibling, node)
          : hash(Buffer.from([1]), node, sibling);
    }
    expect(node.toString("hex")).toBe(root);
  }
  const first = records[0];
  if (!first) throw new Error("Missing fixture");
  expect(() => core.merkleRoot([first, first])).toThrow();
  expect(() => core.merkleRoot([{ ...first, t0_ms: 1n << 60n }])).toThrow();
});
it("validates deployment and rejects other networks", () => {
  expect(core.loadConfig({}).deployment.network).toBe("testnet");
  expect(() => core.loadConfig({ STELLAR_NETWORK: "other" })).toThrow();
  expect(() =>
    core.deploymentSchema.parse({ network: "testnet", rpcUrl: "https://example.org" }),
  ).toThrow();
});
