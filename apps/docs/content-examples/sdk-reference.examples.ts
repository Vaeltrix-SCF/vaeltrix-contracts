import { createHash, verify } from "node:crypto";
import type { KeyObject } from "node:crypto";

export class VaeltrixError extends Error {
  readonly code: number;
  readonly errorName: string;

  constructor(code: number, errorName: string, message: string) {
    super(message);
    this.name = "VaeltrixError";
    this.code = code;
    this.errorName = errorName;
  }
}

// START amount-conversion
export function toStroops(amountDecimal: string): bigint {
  if (!/^-?\d+(\.\d{1,7})?$/.test(amountDecimal)) {
    throw new RangeError("Expected a decimal with at most seven fractional digits");
  }
  const negative = amountDecimal.startsWith("-");
  const [whole, frac = ""] = (negative ? amountDecimal.slice(1) : amountDecimal).split(".");
  const magnitude = BigInt(whole + frac.padEnd(7, "0"));
  const value = negative ? -magnitude : magnitude;
  if (value < -(1n << 127n) || value > (1n << 127n) - 1n) {
    throw new RangeError("Amount outside i128");
  }
  return value;
}

export function fromStroops(stroops: bigint): string {
  const sign = stroops < 0n ? "-" : "";
  const abs = stroops < 0n ? -stroops : stroops;
  const str = abs.toString().padStart(8, "0");
  const whole = str.slice(0, -7) || "0";
  const frac = str.slice(-7).replace(/0+$/, "");
  return frac ? `${sign}${whole}.${frac}` : `${sign}${whole}`;
}
// END amount-conversion

// START payment-id-derivation
export function derivePaymentId(sep31TxId: string, providerIdHex: string): string {
  const prefix = Buffer.from("VAELTRIX:PAYMENT:v1", "ascii");
  const txBytes = Buffer.from(sep31TxId, "utf8");
  const providerBytes = Buffer.from(providerIdHex, "hex");
  return createHash("sha256")
    .update(Buffer.concat([prefix, txBytes, providerBytes]))
    .digest("hex");
}
// END payment-id-derivation

// START verify-receipt
export function verifyReceiptSignature(params: {
  receiptBytes: Buffer;
  publicKey: KeyObject;
  signatureHex: string;
}): boolean {
  if (params.receiptBytes.length !== 131) {
    return false;
  }
  const signature = Buffer.from(params.signatureHex, "hex");
  return verify(null, params.receiptBytes, params.publicKey, signature);
}
// END verify-receipt

// START merkle-leaf-hash
export function computeMerkleLeaf(params: {
  paymentIdHex: string;
  verdict: "OnTime" | "LateCompletion" | "NoCompletion";
  latencyMs: bigint;
}): Buffer {
  const payload = Buffer.concat([
    Buffer.from(params.paymentIdHex, "hex"),
    Buffer.from(params.verdict, "ascii"),
    Buffer.from(params.latencyMs.toString(), "ascii"),
  ]);
  return createHash("sha256").update(payload).digest();
}
// END merkle-leaf-hash

// START error-handling
export function handleContractError(error: unknown): string {
  if (error instanceof VaeltrixError) {
    switch (error.errorName) {
      case "InsufficientStake":
        return "Provider does not have enough unreserved stake to cover this volume.";
      case "NotCovered":
        return "Payment initiation timestamp falls outside the active commitment coverage window.";
      case "OutOfScope":
        return "Payment parameters (asset, amount, or corridor) do not match the SLA template scope.";
      default:
        return `Contract error (${error.code}): ${error.message}`;
    }
  }
  return error instanceof Error ? error.message : "Unknown transaction error";
}
// END error-handling
