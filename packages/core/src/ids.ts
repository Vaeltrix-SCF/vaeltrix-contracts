import { Address } from "@stellar/stellar-sdk";
import { createHash } from "node:crypto";
export function providerId(homeDomain: string, adminG: string): string {
  return createHash("sha256")
    .update("VAELTRIX:PROVIDER:v1")
    .update(homeDomain.toLowerCase())
    .update(new Address(adminG).toScAddress().toXDR())
    .digest("hex");
}
export function paymentId(sep31TxId: string, providerIdHex: string): string {
  if (!/^[a-fA-F0-9]{64}$/.test(providerIdHex)) throw new TypeError("Invalid provider ID");
  return createHash("sha256")
    .update("VAELTRIX:PAYMENT:v1")
    .update(sep31TxId)
    .update(Buffer.from(providerIdHex, "hex"))
    .digest("hex");
}
