import { createHash, sign } from "node:crypto";
import type { KeyObject } from "node:crypto";

export interface CommitmentCoverage {
  commitmentId: bigint;
  templateId: number;
  isActive: boolean;
  isPaused: boolean;
  effectiveFrom: bigint;
  effectiveTo: bigint | null;
}

// START derive-provider-id
export function deriveProviderId(homeDomain: string, adminXdrHex: string): string {
  const domainTag = Buffer.from("VAELTRIX:PROVIDER:v1", "ascii");
  const domainBytes = Buffer.from(homeDomain.toLowerCase(), "utf8");
  const adminBytes = Buffer.from(adminXdrHex, "hex");
  return createHash("sha256")
    .update(Buffer.concat([domainTag, domainBytes, adminBytes]))
    .digest("hex");
}
// END derive-provider-id

// START check-commitment-coverage
export function checkCommitmentCoverage(
  commitment: CommitmentCoverage,
  paymentTimestampMs: bigint,
): boolean {
  if (!commitment.isActive || commitment.isPaused) {
    return false;
  }
  const t0Sec = paymentTimestampMs / 1000n;
  if (t0Sec < commitment.effectiveFrom) {
    return false;
  }
  if (commitment.effectiveTo !== null && t0Sec >= commitment.effectiveTo) {
    return false;
  }
  return true;
}
// END check-commitment-coverage

// START build-completion-receipt
export function buildCompletionReceipt(params: {
  networkPassphrase: string;
  paymentIdHex: string;
  commitmentId: bigint;
  amount: bigint;
  t0Ms: bigint;
  t1Ms: bigint;
  pauseMs: bigint;
  privateKey: KeyObject;
}): { messageHex: string; signatureHex: string } {
  const bytes = Buffer.alloc(131);
  bytes.write("VAELTRIX:RECEIPT:v1", 0, "ascii");
  const networkId = createHash("sha256").update(params.networkPassphrase).digest();
  networkId.copy(bytes, 19);
  Buffer.from(params.paymentIdHex, "hex").copy(bytes, 51);
  bytes.writeBigUInt64BE(params.commitmentId, 83);
  bytes.writeBigUInt64BE(params.amount >> 64n, 91);
  bytes.writeBigUInt64BE(params.amount & ((1n << 64n) - 1n), 99);
  bytes.writeBigUInt64BE(params.t0Ms, 107);
  bytes.writeBigUInt64BE(params.t1Ms, 115);
  bytes.writeBigUInt64BE(params.pauseMs, 123);

  const signature = sign(null, bytes, params.privateKey);
  return {
    messageHex: bytes.toString("hex"),
    signatureHex: signature.toString("hex"),
  };
}
// END build-completion-receipt

// START evaluate-verdict
export function evaluateVerdict(params: {
  t0Ms: bigint;
  t1Ms: bigint | null;
  nowMs: bigint;
  targetMs: bigint;
  graceMs: bigint;
  pauseMs: bigint;
}): "Pending" | "OnTime" | "LateCompletion" | "NoCompletion" {
  if (
    [params.t0Ms, params.nowMs, params.targetMs, params.graceMs, params.pauseMs].some(
      (value) => value < 0n || value > (1n << 64n) - 1n,
    )
  ) {
    throw new RangeError("Timestamp or duration outside u64");
  }
  const deadline = params.t0Ms + params.targetMs + params.graceMs + params.pauseMs;
  if (deadline > (1n << 64n) - 1n) throw new RangeError("Deadline overflow");
  if (params.t1Ms === null) {
    return params.nowMs > deadline ? "NoCompletion" : "Pending";
  }
  if (params.t1Ms > (1n << 64n) - 1n || params.t1Ms < params.t0Ms + params.pauseMs) {
    throw new RangeError("Invalid completion timeline");
  }
  const gross = params.t1Ms - params.t0Ms;
  const net = gross > params.pauseMs ? gross - params.pauseMs : 0n;
  if (net <= params.targetMs + params.graceMs) {
    return "OnTime";
  }
  return "LateCompletion";
}
// END evaluate-verdict

// START calculate-penalty
export function calculatePenalty(amount: bigint, bps: number, cap: bigint): bigint {
  const penalty = (amount * BigInt(bps)) / 10000n;
  return penalty > cap ? cap : penalty;
}
// END calculate-penalty
