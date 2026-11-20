import { createHash } from "node:crypto";
import { canonicalize } from "./jcs.js";
export interface MerkleRecord {
  payment_id: string;
  amount: string;
  t0_ms: bigint;
  t1_ms: bigint | null;
  pause_ms: bigint;
  carve_out: string | null;
  breach: boolean;
}
const hash = (...parts: Uint8Array[]) => createHash("sha256").update(Buffer.concat(parts)).digest();
function leaves(records: readonly MerkleRecord[]) {
  const sorted = [...records].sort((a, b) =>
    a.payment_id < b.payment_id ? -1 : a.payment_id > b.payment_id ? 1 : 0,
  );
  if (new Set(sorted.map((r) => r.payment_id)).size !== sorted.length)
    throw new TypeError("Duplicate payment ID");
  return sorted.map((record) => {
    if (!/^[a-f0-9]{64}$/.test(record.payment_id)) throw new TypeError("Invalid payment ID");
    // RFC 8785 uses IEEE-754 JSON numbers. Reject unsafe times rather than rounding.
    if (!/^\d+$/.test(record.amount) || BigInt(record.amount) >= 1n << 127n)
      throw new RangeError("Invalid nonnegative i128 amount");
    const times = [record.t0_ms, record.t1_ms, record.pause_ms];
    if (times.some((t) => t !== null && (t < 0n || t > 9_007_199_254_740_991n)))
      throw new RangeError("Time cannot be represented exactly in canonical JSON");
    const fields: Record<string, unknown> = {
      payment_id: record.payment_id,
      amount: record.amount,
      t0_ms: record.t0_ms,
      t1_ms: record.t1_ms,
      pause_ms: record.pause_ms,
      carve_out: record.carve_out,
      breach: record.breach,
    };
    const json =
      "{" +
      Object.keys(fields)
        .sort()
        .map((key) => {
          const value = fields[key];
          return `${JSON.stringify(key)}:${typeof value === "bigint" ? value.toString() : canonicalize(value)}`;
        })
        .join(",") +
      "}";
    return { id: record.payment_id, hash: hash(Buffer.from([0]), Buffer.from(json)) };
  });
}
const next = (level: Buffer[]) =>
  level
    .filter((_, i) => i % 2 === 0)
    .map((left, i) => {
      const right = level[i * 2 + 1];
      return right ? hash(Buffer.from([1]), left, right) : left;
    });
export function merkleRoot(records: readonly MerkleRecord[]): string {
  let level: Buffer[] = leaves(records).map((l) => l.hash);
  while (level.length > 1) level = next(level);
  return (level[0] ?? Buffer.alloc(32)).toString("hex");
}
export function merkleProof(
  records: readonly MerkleRecord[],
  id: string,
): { side: "left" | "right"; hash: string }[] {
  const sorted = leaves(records);
  let index = sorted.findIndex((l) => l.id === id);
  if (index < 0) throw new RangeError("Unknown payment ID");
  let level: Buffer[] = sorted.map((l) => l.hash);
  const proof: { side: "left" | "right"; hash: string }[] = [];
  while (level.length > 1) {
    const sibling = level[index ^ 1];
    if (sibling) proof.push({ side: index % 2 ? "left" : "right", hash: sibling.toString("hex") });
    level = next(level);
    index = Math.floor(index / 2);
  }
  return proof;
}
