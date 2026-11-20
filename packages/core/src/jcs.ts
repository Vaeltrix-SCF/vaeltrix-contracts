import jcs from "canonicalize";
import { createHash } from "node:crypto";
/** RFC 8785 canonical JSON for off-chain hashes and signatures (§2 D3). */
export function canonicalize(value: unknown): string {
  const result = jcs(value);
  if (result === undefined) throw new TypeError("Value is not canonical JSON");
  return result;
}
export function jcsHash(value: unknown): string {
  return createHash("sha256").update(canonicalize(value)).digest("hex");
}
