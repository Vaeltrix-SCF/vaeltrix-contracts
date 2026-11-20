import {Address} from '@stellar/stellar-sdk';

    /**
 * Event: Init
 */
export interface InitEvent {
  name: "Init";
  data: {
    admin?: string;
  };
}

/**
 * Event: AdminSet
 */
export interface AdminSetEvent {
  name: "AdminSet";
  data: {
    address?: string;
  };
}

/**
 * Event: AdminProposed
 */
export interface AdminProposedEvent {
  name: "AdminProposed";
  data: {
    address?: string;
  };
}

/**
 * Event: ObserverAdded
 */
export interface ObserverAddedEvent {
  name: "ObserverAdded";
  data: {
    observer: string;
    key?: Uint8Array;
  };
}

/**
 * Event: ActionExecuted
 */
export interface ActionExecutedEvent {
  name: "ActionExecuted";
  data: {
    action_id: number;
  };
}

/**
 * Event: ActionProposed
 */
export interface ActionProposedEvent {
  name: "ActionProposed";
  data: {
    action_id: number;
    kind?: number;
    eta?: bigint;
  };
}

/**
 * Event: ActionCancelled
 */
export interface ActionCancelledEvent {
  name: "ActionCancelled";
  data: {
    action_id: number;
  };
}

/**
 * Event: ObserverRemoved
 */
export interface ObserverRemovedEvent {
  name: "ObserverRemoved";
  data: {
    observer: string;
  };
}

/**
 * Event: ProviderSigners
 */
export interface ProviderSignersEvent {
  name: "ProviderSigners";
  data: {
    provider_id: Uint8Array;
    new_value?: Array<Uint8Array>;
  };
}

/**
 * Event: ProviderMetadata
 */
export interface ProviderMetadataEvent {
  name: "ProviderMetadata";
  data: {
    provider_id: Uint8Array;
    new_value?: string;
  };
}

/**
 * Event: ProviderVerified
 */
export interface ProviderVerifiedEvent {
  name: "ProviderVerified";
  data: {
    provider_id: Uint8Array;
  };
}

/**
 * Event: TemplateProposed
 */
export interface TemplateProposedEvent {
  name: "TemplateProposed";
  data: {
    template_id: number;
    version?: number;
    activates_at?: bigint;
  };
}

/**
 * Event: ProviderSuspended
 */
export interface ProviderSuspendedEvent {
  name: "ProviderSuspended";
  data: {
    provider_id: Uint8Array;
    reason?: string;
  };
}

/**
 * Event: TemplateActivated
 */
export interface TemplateActivatedEvent {
  name: "TemplateActivated";
  data: {
    template_id: number;
    version?: number;
  };
}

/**
 * Event: TemplateCancelled
 */
export interface TemplateCancelledEvent {
  name: "TemplateCancelled";
  data: {
    template_id: number;
    version?: number;
  };
}

/**
 * Event: ProviderRegistered
 */
export interface ProviderRegisteredEvent {
  name: "ProviderRegistered";
  data: {
    provider_id: Uint8Array;
    admin?: string;
    home_domain?: string;
  };
}

/**
 * Event: ProviderReinstated
 */
export interface ProviderReinstatedEvent {
  name: "ProviderReinstated";
  data: {
    provider_id: Uint8Array;
  };
}

/**
 * Event: ProviderUnverified
 */
export interface ProviderUnverifiedEvent {
  name: "ProviderUnverified";
  data: {
    provider_id: Uint8Array;
  };
}

/**
 * Event: TemplateDeprecated
 */
export interface TemplateDeprecatedEvent {
  name: "TemplateDeprecated";
  data: {
    template_id: number;
    version?: number;
  };
}

/**
 * Union: ActionKind
 */
 export type ActionKind =
  { tag: "SetParams"; values: readonly [Params] } |
  { tag: "AddObserver"; values: readonly [string, Uint8Array] } |
  { tag: "RemoveObserver"; values: readonly [string] } |
  { tag: "SetVerifier"; values: readonly [string] } |
  { tag: "Upgrade"; values: readonly [Uint8Array] };

/**
 * Struct: PendingAction
 */
export interface PendingAction {
  cancelled: boolean;
  eta: bigint;
  executed: boolean;
  id: number;
  kind: ActionKind;
}

/**
 * Union: Metric
 */
 export type Metric =
  { tag: "TimeToCompletion"; values: void };

/**
 * Union: CarveOut
 */
 export type CarveOut =
  { tag: "ReceiverBankHoliday"; values: void } |
  { tag: "ComplianceHoldDeclared"; values: void } |
  { tag: "InvalidBeneficiary"; values: void } |
  { tag: "SenderInfoIncomplete"; values: void };

/**
 * Union: Direction
 */
 export type Direction =
  { tag: "Inbound"; values: void } |
  { tag: "Outbound"; values: void };

/**
 * Union: EventKind
 */
 export type EventKind =
  { tag: "SenderDebitConfirmed"; values: void } |
  { tag: "OnChainSettled"; values: void } |
  { tag: "ReceiverAccepted"; values: void } |
  { tag: "ReceiverCreditConfirmed"; values: void } |
  { tag: "RecipientAcknowledged"; values: void };

/**
 * Union: EvidenceMode
 */
 export type EvidenceMode =
  { tag: "DualSigned"; values: void } |
  { tag: "ProviderSigned"; values: void } |
  { tag: "ObserverOnly"; values: void };

/**
 * Union: PenaltyModel
 */
 export type PenaltyModel =
  { tag: "PerBreachBps"; values: readonly [PerBreachBps] };

/**
 * Struct: PerBreachBps
 */
export interface PerBreachBps {
  bps: number;
  cap: bigint;
}

/**
 * Union: ProviderStatus
 */
 export type ProviderStatus =
  { tag: "Active"; values: void } |
  { tag: "Suspended"; values: void } |
  { tag: "Exited"; values: void };

/**
 * Union: TemplateStatus
 */
 export type TemplateStatus =
  { tag: "Proposed"; values: void } |
  { tag: "Active"; values: void } |
  { tag: "Deprecated"; values: void };

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
 * Struct: Scope
 */
export interface Scope {
  asset: string;
  direction: Direction;
  max_amount: bigint;
  min_amount: bigint;
  payout_rail: string | null;
  receiver_country: string | null;
  sender_country: string | null;
}

/**
 * Struct: Params
 */
export interface Params {
  allowed_stake_assets: Array<string>;
  attestation_window_secs: bigint;
  challenge_window_secs: bigint;
  claim_bond_bps: number;
  exit_extra_secs: bigint;
  max_stake_per_commitment: bigint;
  min_claim_bond: bigint;
  quorum: number;
  rejected_bond_provider_bps: number;
  stake_floor: bigint;
  stake_k: number;
  timelock_secs: bigint;
}

/**
 * Struct: Observer
 */
export interface Observer {
  active: boolean;
  added_at: bigint;
  address: string;
  key: Uint8Array;
}

/**
 * Struct: Provider
 */
export interface Provider {
  admin: string;
  home_domain: string;
  id: Uint8Array;
  metadata_uri: string;
  registered_at: bigint;
  signers: Array<Uint8Array>;
  status: ProviderStatus;
  verified: boolean;
}

/**
 * Struct: SlaTemplate
 */
export interface SlaTemplate {
  activates_at: bigint;
  carve_outs: Array<CarveOut>;
  claim_window_secs: bigint;
  end_event: EventKind;
  evidence_mode: EvidenceMode;
  grace_ms: bigint;
  id: number;
  max_hold_ms: bigint;
  metric: Metric;
  penalty: PenaltyModel;
  scope: Scope;
  start_event: EventKind;
  status: TemplateStatus;
  target_ms: bigint;
  version: number;
}
    export type ContractEvent = InitEvent | AdminSetEvent | AdminProposedEvent | ObserverAddedEvent | ActionExecutedEvent | ActionProposedEvent | ActionCancelledEvent | ObserverRemovedEvent | ProviderSignersEvent | ProviderMetadataEvent | ProviderVerifiedEvent | TemplateProposedEvent | ProviderSuspendedEvent | TemplateActivatedEvent | TemplateCancelledEvent | ProviderRegisteredEvent | ProviderReinstatedEvent | ProviderUnverifiedEvent | TemplateDeprecatedEvent;
    