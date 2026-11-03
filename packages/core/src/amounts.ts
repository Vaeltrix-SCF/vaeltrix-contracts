const MIN = -(1n << 127n),
  MAX = (1n << 127n) - 1n;
export function toStroops(value: string): bigint {
  if (!/^-?\d+(?:\.\d{1,7})?$/.test(value))
    throw new TypeError("Expected a decimal with at most seven places");
  const negative = value.startsWith("-");
  const [whole = "0", fraction = ""] = (negative ? value.slice(1) : value).split(".");
  const result =
    (BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"))) * (negative ? -1n : 1n);
  if (result < MIN || result > MAX) throw new RangeError("Amount exceeds i128");
  return result;
}
export function fromStroops(value: bigint): string {
  if (value < MIN || value > MAX) throw new RangeError("Amount exceeds i128");
  const absolute = value < 0n ? -value : value;
  return `${value < 0n ? "-" : ""}${absolute / 10_000_000n}.${(absolute % 10_000_000n).toString().padStart(7, "0")}`;
}
