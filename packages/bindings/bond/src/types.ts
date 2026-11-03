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
    export type ContractEvent = PausedEvent | ResumedEvent | CommittedEvent | StakeChangedEvent | ExitFinalizedEvent | ExitRequestedEvent | UpgradeExecutedEvent | UpgradeProposedEvent;
    