import { createHash, createPrivateKey, createPublicKey, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Ajv } from "ajv";
import { describe, expect, it } from "vitest";

// VX-105 owns fixtures and their integrity. VX-103/VX-104/VX-106 add
// assertions against the production implementations, using these same files.
const vectorsDir = fileURLToPath(new URL("../../../test-vectors/", import.meta.url));
const load = (file: string): unknown => JSON.parse(readFileSync(vectorsDir + file, "utf8"));
const hash = (bytes: string | Buffer): Buffer => createHash("sha256").update(bytes).digest();
const ajv = new Ajv({ allErrors: true });

interface IdCase {
  name: string;
  input: { home_domain: string; admin_scaddress_xdr: string; sep31_tx_id: string };
  expect: { provider_id: string; payment_id: string };
}
interface ReceiptCase {
  name: string;
  input: {
    network_passphrase: string;
    network_id: string;
    payment_id: string;
    commitment_id: string;
    amount: string;
    t0_ms: string;
    t1_ms: string;
    pause_ms: string;
    test_seed_hex: string;
  };
  expect: { message_hex: string; signer_hex: string; signature_hex: string };
}

describe("shared test vectors", () => {
  for (const file of ["verdict", "ids", "receipts"]) {
    const schema = load(`${file}.schema.json`) as object;
    const validate = ajv.compile(schema);
    it(`${file}.json matches its schema with unique case names`, () => {
      const cases = load(`${file}.json`) as { name: string }[];
      expect(validate(cases), JSON.stringify(validate.errors)).toBe(true);
      expect(new Set(cases.map((c) => c.name)).size).toBe(cases.length);
    });
    it(`${file} schema rejects empty files and malformed cases`, () => {
      expect(validate([])).toBe(false);
      const cases = structuredClone(load(`${file}.json`)) as Record<string, unknown>[];
      for (const c of cases) delete c.expect;
      expect(validate(cases)).toBe(false);
    });
  }

  for (const c of load("ids.json") as IdCase[]) {
    it(`${c.name}: SHA-256 domain separation and XDR bytes`, () => {
      const provider = hash(
        Buffer.concat([
          Buffer.from("VAELTRIX:PROVIDER:v1", "ascii"),
          Buffer.from(c.input.home_domain.toLowerCase(), "utf8"),
          Buffer.from(c.input.admin_scaddress_xdr, "hex"),
        ]),
      );
      expect(provider.toString("hex")).toBe(c.expect.provider_id);
      const payment = hash(
        Buffer.concat([
          Buffer.from("VAELTRIX:PAYMENT:v1", "ascii"),
          Buffer.from(c.input.sep31_tx_id, "utf8"),
          provider,
        ]),
      );
      expect(payment.toString("hex")).toBe(c.expect.payment_id);
    });
  }

  for (const c of load("receipts.json") as ReceiptCase[]) {
    it(`${c.name}: fixed 131-byte layout and direct Ed25519 signature`, () => {
      const input = c.input;
      const bytes = Buffer.alloc(131);
      bytes.write("VAELTRIX:RECEIPT:v1", 0, "ascii");
      const network = hash(input.network_passphrase);
      expect(network.toString("hex")).toBe(input.network_id);
      network.copy(bytes, 19);
      Buffer.from(input.payment_id, "hex").copy(bytes, 51);
      bytes.writeBigUInt64BE(BigInt(input.commitment_id), 83);
      const amount = BigInt(input.amount);
      bytes.writeBigUInt64BE(amount >> 64n, 91);
      bytes.writeBigUInt64BE(amount & ((1n << 64n) - 1n), 99);
      bytes.writeBigUInt64BE(BigInt(input.t0_ms), 107);
      bytes.writeBigUInt64BE(BigInt(input.t1_ms), 115);
      bytes.writeBigUInt64BE(BigInt(input.pause_ms), 123);
      expect(bytes.toString("hex")).toBe(c.expect.message_hex);
      // PKCS#8/SPKI wrappers around the deliberately public, unfunded test key.
      const privateKey = createPrivateKey({
        key: Buffer.concat([
          Buffer.from("302e020100300506032b657004220420", "hex"),
          Buffer.from(input.test_seed_hex, "hex"),
        ]),
        format: "der",
        type: "pkcs8",
      });
      const publicKey = createPublicKey(privateKey);
      const publicDer = publicKey.export({ format: "der", type: "spki" });
      expect(publicDer.subarray(-32).toString("hex")).toBe(c.expect.signer_hex);
      const signature = Buffer.from(c.expect.signature_hex, "hex");
      expect(sign(null, bytes, privateKey).equals(signature)).toBe(true);
      expect(verify(null, bytes, publicKey, signature)).toBe(true);
      const tampered = Buffer.from(bytes);
      tampered[130] = (tampered[130] ?? 0) ^ 1;
      expect(verify(null, tampered, publicKey, signature)).toBe(false);
    });
  }
});
