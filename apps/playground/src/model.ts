export const SCALE = 10_000_000n;
export function submissionRejected(
  status: "PENDING" | "DUPLICATE" | "TRY_AGAIN_LATER" | "ERROR",
): boolean {
  return status === "ERROR" || status === "TRY_AGAIN_LATER";
}
const MAX_I128 = (1n << 127n) - 1n;
export function latestPeriods(periods: bigint[]): bigint[] {
  return [...periods].sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)).slice(0, 7);
}
export function amount(input: string): bigint {
  if (!/^(0|[1-9]\d*)(\.\d{1,7})?$/.test(input))
    throw new Error("Enter a positive amount with at most 7 decimal places.");
  const [whole = "0", fraction = ""] = input.split(".");
  const value = BigInt(whole) * SCALE + BigInt(fraction.padEnd(7, "0"));
  if (value <= 0n || value > MAX_I128) throw new Error("Amount is outside the supported range.");
  return value;
}
export function id(input: string): bigint {
  if (!/^[1-9]\d*$/.test(input)) throw new Error("Enter a positive commitment ID.");
  const value = BigInt(input);
  if (value > (1n << 64n) - 1n) throw new Error("Commitment ID is too large.");
  return value;
}
export function units(value: bigint): string {
  const sign = value < 0n ? "−" : "";
  const absolute = value < 0n ? -value : value;
  const decimals = (absolute % SCALE).toString().padStart(7, "0").replace(/0+$/, "");
  return `${sign}${(absolute / SCALE).toLocaleString("en-US")}${decimals ? `.${decimals}` : ""}`;
}
export function hex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
export function bytes(value: string): Uint8Array {
  if (!/^[a-f0-9]{64}$/.test(value))
    throw new Error("Provider ID must be 64 lowercase hexadecimal characters.");
  return Uint8Array.from(value.match(/../g) ?? [], (byte) => parseInt(byte, 16));
}
export function homeDomain(value: string): string {
  if (!/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/.test(value))
    throw new Error(
      "Use a lowercase home domain without https:// or a trailing dot (max 253 characters).",
    );
  return value;
}
export function apiOrigin(value: string): string {
  const url = new URL(value);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw new Error("Enter an HTTP(S) origin without credentials, a path, query or fragment.");
  return url.origin;
}
export function json(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, entry: unknown) =>
      typeof entry === "bigint"
        ? entry.toString()
        : entry instanceof Uint8Array
          ? hex(entry)
          : entry,
    2,
  );
}
export function message(error: unknown): string {
  return error instanceof Error
    ? error.message
    : typeof error === "string"
      ? error
      : "The request failed. Please try again.";
}
export interface Tagged {
  tag: string;
}
export interface Provider {
  id: Uint8Array;
  admin: string;
  home_domain: string;
  verified: boolean;
  status: Tagged;
}
export interface Commitment {
  id: bigint;
  provider_id: Uint8Array;
  template_id: number;
  template_version: number;
  stake_asset: string;
  stake_total: bigint;
  stake_reserved: bigint;
  min_stake: bigint;
  open_claims: number;
  status: Tagged;
  exit_cooldown_secs: bigint;
  exit_requested_at?: bigint;
}
export interface Template {
  id: number;
  version: number;
  status: Tagged;
  target_ms: bigint;
  grace_ms: bigint;
  claim_window_secs: bigint;
  scope: { asset: string; min_amount: bigint; max_amount: bigint };
  penalty: { tag: string; values: [{ bps: number; cap: bigint }] };
}
export interface Stats {
  payments: number;
  on_time: number;
  breaches: number;
  carved_out: number;
  volume: bigint;
  penalties_paid: bigint;
  p95_ms: bigint;
}
export interface Batch {
  observer: string;
  anchored_at: bigint;
  merkle_root: Uint8Array;
  stats: Stats;
}
