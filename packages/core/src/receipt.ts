import { createHash } from "node:crypto";
import { Keypair, StrKey } from "@stellar/stellar-sdk";
export interface ReceiptFields {
  payment_id: string;
  commitment_id: bigint;
  amount: bigint;
  t0_ms: bigint;
  t1_ms: bigint;
  pause_ms: bigint;
}
export function receiptBytes(fields: ReceiptFields, networkPassphrase: string): Buffer {
  if (!/^[a-fA-F0-9]{64}$/.test(fields.payment_id)) throw new TypeError("Invalid payment ID");
  if (fields.amount < -(1n << 127n) || fields.amount >= 1n << 127n)
    throw new RangeError("Amount exceeds i128");
  const bytes = Buffer.alloc(131);
  bytes.write("VAELTRIX:RECEIPT:v1", 0, "ascii");
  createHash("sha256").update(networkPassphrase).digest().copy(bytes, 19);
  Buffer.from(fields.payment_id, "hex").copy(bytes, 51);
  bytes.writeBigUInt64BE(fields.commitment_id, 83);
  const unsigned = BigInt.asUintN(128, fields.amount);
  bytes.writeBigUInt64BE(unsigned >> 64n, 91);
  bytes.writeBigUInt64BE(unsigned & ((1n << 64n) - 1n), 99);
  bytes.writeBigUInt64BE(fields.t0_ms, 107);
  bytes.writeBigUInt64BE(fields.t1_ms, 115);
  bytes.writeBigUInt64BE(fields.pause_ms, 123);
  return bytes;
}
export function signReceipt(
  fields: ReceiptFields,
  networkPassphrase: string,
  keypair: Keypair,
): Buffer {
  return Buffer.from(keypair.sign(receiptBytes(fields, networkPassphrase)));
}
export function verifyReceipt(
  fields: ReceiptFields,
  networkPassphrase: string,
  signature: Uint8Array,
  signer: string,
): boolean {
  try {
    return Keypair.fromPublicKey(StrKey.encodeEd25519PublicKey(Buffer.from(signer, "hex"))).verify(
      receiptBytes(fields, networkPassphrase),
      Buffer.from(signature),
    );
  } catch {
    return false;
  }
}
