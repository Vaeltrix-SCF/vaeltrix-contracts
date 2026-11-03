import {Address} from '@stellar/stellar-sdk';

    /**
 * Event: BondSet
 */
export interface BondSetEvent {
  name: "BondSet";
  data: {
    bond?: string;
  };
}

/**
 * Event: BatchAnchored
 */
export interface BatchAnchoredEvent {
  name: "BatchAnchored";
  data: {
    commitment_id: bigint;
    period?: bigint;
    merkle_root?: Uint8Array;
    observer?: string;
    stats?: PeriodStats;
  };
}

/**
 * Event: ClaimRecorded
 */
export interface ClaimRecordedEvent {
  name: "ClaimRecorded";
  data: {
    claim_id: bigint;
    provider_id?: Uint8Array;
    outcome?: ClaimOutcome;
  };
}

/**
 * Union: BreachKind
 */
 export type BreachKind =
  { tag: "LateCompletion"; values: void } |
  { tag: "NoCompletion"; values: void };

/**
 * Union: ClaimStatus
 */
 export type ClaimStatus =
  { tag: "Filed"; values: void } |
  { tag: "Challenged"; values: void } |
  { tag: "Paid"; values: void } |
  { tag: "Rejected"; values: void } |
  { tag: "Expired"; values: void };

/**
 * Union: ClaimOutcome
 */
 export type ClaimOutcome =
  { tag: "Upheld"; values: void } |
  { tag: "Rejected"; values: void } |
  { tag: "Expired"; values: void };

/**
 * Error Enum: Error
 */
export const Error = {
  1 : { message: "NotAuthorized" },
  2 : { message: "ProviderNotActive" },
  3 : { message: "TemplateNotActive" },
  4 : { message: "InsufficientStake" },
  5 : { message: "OutOfScope" },
  6 : { message: "ClaimWindowClosed" },
  7 : { message: "DuplicateClaim" },
  8 : { message: "InvalidEvidence" },
  9 : { message: "NotInBreach" },
  10 : { message: "ChallengeWindowOpen" },
  11 : { message: "OpenClaimsExist" },
  12 : { message: "CooldownActive" },
  13 : { message: "UnknownObserver" },
  14 : { message: "AlreadyAttested" },
  15 : { message: "AlreadyInitialized" },
  16 : { message: "NotInitialized" },
  17 : { message: "InvalidParams" },
  18 : { message: "UnknownProvider" },
  19 : { message: "UnknownTemplate" },
  20 : { message: "UnknownCommitment" },
  21 : { message: "UnknownClaim" },
  22 : { message: "ProviderNotVerified" },
  23 : { message: "ProviderExists" },
  24 : { message: "TemplateExists" },
  25 : { message: "TimelockActive" },
  26 : { message: "AssetNotAllowed" },
  27 : { message: "AssetMismatch" },
  28 : { message: "AmountOutOfRange" },
  29 : { message: "NotCovered" },
  30 : { message: "CommitmentNotActive" },
  31 : { message: "ClaimNotOpen" },
  32 : { message: "AttestationWindowClosed" },
  33 : { message: "QuorumNotReached" },
  34 : { message: "BelowMinStake" },
  35 : { message: "StakeCapExceeded" },
  36 : { message: "PaymentIdMismatch" },
  37 : { message: "UnknownSigner" },
  38 : { message: "TooManySigners" },
  39 : { message: "UnsupportedPenaltyModel" },
  40 : { message: "ArithmeticOverflow" },
  41 : { message: "BondAlreadySet" },
  42 : { message: "BatchExists" },
  43 : { message: "InvalidPeriod" },
  44 : { message: "NothingPending" }
}

/**
 * Struct: Claim
 */
export interface Claim {
  attestation_deadline: bigint;
  beneficiary: string;
  bond_payer: string;
  breach: BreachKind;
  challenge_deadline: bigint;
  claim_bond: bigint;
  claimant: string;
  commitment_id: bigint;
  counter_evidence_hash: Uint8Array | null;
  filed_at: bigint;
  filed_by_observer: string | null;
  id: bigint;
  payment: PaymentRef;
  penalty_amount: bigint;
  provider_id: Uint8Array;
  reserved_amount: bigint;
  shortfall: bigint;
  status: ClaimStatus;
  votes_against: number;
  votes_for: number;
}

/**
 * Struct: PaymentRef
 */
export interface PaymentRef {
  amount: bigint;
  commitment_id: bigint;
  evidence_hash: Uint8Array;
  pause_ms: bigint;
  payment_id: Uint8Array;
  sep31_tx_id: string;
  t0_ms: bigint;
  t1_ms: bigint | null;
}

/**
 * Struct: BatchRecord
 */
export interface BatchRecord {
  anchored_at: bigint;
  attestation_hash: Uint8Array;
  merkle_root: Uint8Array;
  observer: string;
  stats: PeriodStats;
}

/**
 * Struct: PeriodStats
 */
export interface PeriodStats {
  breaches: number;
  carved_out: number;
  on_time: number;
  p50_ms: bigint;
  p95_ms: bigint;
  p99_ms: bigint;
  payments: number;
  penalties_paid: bigint;
  volume: bigint;
}

/**
 * Struct: LifetimeStats
 */
export interface LifetimeStats {
  breaches: bigint;
  carved_out: bigint;
  claims_expired: number;
  claims_rejected: number;
  claims_upheld: number;
  on_time: bigint;
  payments: bigint;
  penalties_paid: bigint;
  shortfall_total: bigint;
  volume: bigint;
}
    export type ContractEvent = BondSetEvent | BatchAnchoredEvent | ClaimRecordedEvent;
    