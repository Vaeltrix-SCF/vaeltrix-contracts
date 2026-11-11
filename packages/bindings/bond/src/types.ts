import {Address} from '@stellar/stellar-sdk';

    /**
 * Event: Paused
 */
export interface PausedEvent {
  name: "Paused";
  data: {
    commitment_id: bigint;
    at?: bigint;
  };
}

/**
 * Event: Resumed
 */
export interface ResumedEvent {
  name: "Resumed";
  data: {
    commitment_id: bigint;
    at?: bigint;
  };
}

/**
 * Event: Committed
 */
export interface CommittedEvent {
  name: "Committed";
  data: {
    commitment_id: bigint;
    provider_id?: Uint8Array;
    template_id?: number;
    version?: number;
    stake_asset?: string;
    amount?: bigint;
  };
}

/**
 * Event: ClaimFiled
 */
export interface ClaimFiledEvent {
  name: "ClaimFiled";
  data: {
    claim_id: bigint;
    commitment_id?: bigint;
    payment_id?: Uint8Array;
    breach?: BreachKind;
    penalty?: bigint;
    reserved?: bigint;
    shortfall?: bigint;
    bond?: bigint;
    claimant?: string;
    beneficiary?: string;
  };
}

/**
 * Event: StakeChanged
 */
export interface StakeChangedEvent {
  name: "StakeChanged";
  data: {
    commitment_id: bigint;
    delta?: bigint;
    new_total?: bigint;
  };
}

/**
 * Event: ClaimAttested
 */
export interface ClaimAttestedEvent {
  name: "ClaimAttested";
  data: {
    claim_id: bigint;
    observer?: string;
    uphold?: boolean;
    attestation_hash?: Uint8Array;
  };
}

/**
 * Event: ClaimResolved
 */
export interface ClaimResolvedEvent {
  name: "ClaimResolved";
  data: {
    claim_id: bigint;
    outcome?: ClaimOutcome;
    amount_paid?: bigint;
    bond_refunded?: boolean;
  };
}

/**
 * Event: ExitFinalized
 */
export interface ExitFinalizedEvent {
  name: "ExitFinalized";
  data: {
    commitment_id: bigint;
    at?: bigint;
    amount?: bigint;
  };
}

/**
 * Event: ExitRequested
 */
export interface ExitRequestedEvent {
  name: "ExitRequested";
  data: {
    commitment_id: bigint;
    at?: bigint;
  };
}

/**
 * Event: ClaimChallenged
 */
export interface ClaimChallengedEvent {
  name: "ClaimChallenged";
  data: {
    claim_id: bigint;
    counter_evidence_hash?: Uint8Array;
    attestation_deadline?: bigint;
  };
}

/**
 * Event: UpgradeExecuted
 */
export interface UpgradeExecutedEvent {
  name: "UpgradeExecuted";
  data: {
    wasm_hash?: Uint8Array;
  };
}

/**
 * Event: UpgradeProposed
 */
export interface UpgradeProposedEvent {
  name: "UpgradeProposed";
  data: {
    wasm_hash?: Uint8Array;
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
 * Union: CommitmentStatus
 */
 export type CommitmentStatus =
  { tag: "Active"; values: void } |
  { tag: "Paused"; values: void } |
  { tag: "Exiting"; values: void } |
  { tag: "Exited"; values: void };

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
 * Struct: Commitment
 */
export interface Commitment {
  effective_from: bigint;
  effective_to: bigint | null;
  exit_cooldown_secs: bigint;
  exit_requested_at: bigint | null;
  id: bigint;
  max_volume_per_period: bigint;
  min_stake: bigint;
  open_claims: number;
  paused_at: bigint | null;
  period_secs: bigint;
  provider_id: Uint8Array;
  resumed_at: bigint | null;
  stake_asset: string;
  stake_reserved: bigint;
  stake_total: bigint;
  status: CommitmentStatus;
  template_id: number;
  template_version: number;
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
 * Struct: CompletionReceipt
 */
export interface CompletionReceipt {
  signature: Uint8Array;
  signer: Uint8Array;
}
    export type ContractEvent = PausedEvent | ResumedEvent | CommittedEvent | ClaimFiledEvent | StakeChangedEvent | ClaimAttestedEvent | ClaimResolvedEvent | ExitFinalizedEvent | ExitRequestedEvent | ClaimChallengedEvent | UpgradeExecutedEvent | UpgradeProposedEvent;
    