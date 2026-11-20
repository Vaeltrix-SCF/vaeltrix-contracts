/** Checked bigint port of vaeltrix-verdict (§4.5). Invalid inputs return null. */
const U64 = (1n << 64n) - 1n,
  I128 = (1n << 127n) - 1n,
  U32 = (1n << 32n) - 1n;
const valid = (value: bigint, max: bigint) => value >= 0n && value <= max;
const checked = (value: bigint, max: bigint): bigint | null => (valid(value, max) ? value : null);
export type Verdict =
  { verdict: "Pending" | "NoCompletion" } | { verdict: "OnTime" | "Late"; latency_ms: bigint };
export function deadline_ms(
  t0: bigint,
  target: bigint,
  grace: bigint,
  pause: bigint,
): bigint | null {
  return [t0, target, grace, pause].every((x) => valid(x, U64))
    ? checked(t0 + target + grace + pause, U64)
    : null;
}
export function evaluate(
  t0: bigint,
  t1: bigint | null,
  now: bigint,
  target: bigint,
  grace: bigint,
  pause: bigint,
): Verdict | null {
  const deadline = deadline_ms(t0, target, grace, pause);
  if (deadline === null || !valid(now, U64)) return null;
  if (t1 === null) return { verdict: now > deadline ? "NoCompletion" : "Pending" };
  if (!valid(t1, U64)) return null;
  const latency_ms = checked(t1 - t0 - pause, U64);
  return latency_ms === null
    ? null
    : { verdict: latency_ms > target + grace ? "Late" : "OnTime", latency_ms };
}
function fraction(amount: bigint, bps: bigint): bigint | null {
  if (!valid(amount, I128) || !valid(bps, 10_000n)) return null;
  const product = checked(amount * bps, I128);
  return product === null ? null : product / 10_000n;
}
export function penalty(amount: bigint, bps: bigint, cap: bigint): bigint | null {
  const value = fraction(amount, bps);
  return value === null || !valid(cap, I128) ? null : value < cap ? value : cap;
}
export const max_penalty = penalty;
export function claim_bond(amount: bigint, floor: bigint, bps: bigint): bigint | null {
  const value = fraction(amount, bps);
  return value === null || !valid(floor, I128) ? null : value > floor ? value : floor;
}
export function min_stake(floor: bigint, k: bigint, daily: bigint, bps: bigint): bigint | null {
  if (!valid(k, U32) || !valid(daily, I128) || !valid(floor, I128)) return null;
  const product = checked(k * daily, I128);
  const value = product === null ? null : fraction(product, bps);
  return value === null ? null : value > floor ? value : floor;
}
export function exit_cooldown_secs(
  claim: bigint,
  challenge: bigint,
  attestation: bigint,
  extra: bigint,
): bigint | null {
  return [claim, challenge, attestation, extra].every((x) => valid(x, U64))
    ? checked(claim + challenge + attestation + extra, U64)
    : null;
}
export function claim_deadline_ms(deadline: bigint, window: bigint): bigint | null {
  return valid(deadline, U64) && valid(window, U64)
    ? checked(deadline + window * 1000n, U64)
    : null;
}
export function split_rejected_bond(
  bond: bigint,
  bps: bigint,
  observers: bigint,
): { to_provider: bigint; per_observer: bigint; dust_to_provider: bigint } | null {
  const provider = fraction(bond, bps);
  if (provider === null || observers === 0n || !valid(observers, U32)) return null;
  const remainder = bond - provider;
  return {
    to_provider: provider,
    per_observer: remainder / observers,
    dust_to_provider: remainder % observers,
  };
}
export interface CarveOutSpan {
  kind:
    | "ReceiverBankHoliday"
    | "ComplianceHoldDeclared"
    | "InvalidBeneficiary"
    | "SenderInfoIncomplete";
  from_ms: bigint;
  to_ms: bigint;
}
export function apply_carve_outs(
  events: readonly CarveOutSpan[],
  max_hold_ms: bigint,
): { pause_ms: bigint; out_of_scope: boolean } {
  if (
    !valid(max_hold_ms, U64) ||
    events.some((e) => !valid(e.from_ms, U64) || !valid(e.to_ms, U64))
  )
    throw new RangeError("Time exceeds u64");
  const spans = events
    .filter((e) => e.kind !== "InvalidBeneficiary" && e.to_ms > e.from_ms)
    .map((e) => {
      const duration = e.to_ms - e.from_ms;
      return {
        from: e.from_ms,
        to:
          e.from_ms +
          (e.kind === "ComplianceHoldDeclared" && duration > max_hold_ms ? max_hold_ms : duration),
      };
    })
    .sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0));
  let pause_ms = 0n,
    end = 0n;
  for (const span of spans) {
    const start = span.from > end ? span.from : end;
    if (span.to > start) pause_ms += span.to - start;
    if (span.to > end) end = span.to;
  }
  return { pause_ms, out_of_scope: events.some((e) => e.kind === "InvalidBeneficiary") };
}
