//! Frozen shared structs (guide §4.2, VX-103).
use crate::enums::*;
use soroban_sdk::{Address, BytesN, String, Symbol, Vec, contracttype};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Provider {
    pub id: BytesN<32>,
    pub admin: Address,
    pub signers: Vec<BytesN<32>>,
    pub home_domain: String,
    pub metadata_uri: String,
    pub verified: bool,
    pub status: ProviderStatus,
    pub registered_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Scope {
    pub asset: Address,
    pub direction: Direction,
    pub sender_country: Option<Symbol>,
    pub receiver_country: Option<Symbol>,
    pub min_amount: i128,
    pub max_amount: i128,
    pub payout_rail: Option<Symbol>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlaTemplate {
    pub id: u32,
    pub version: u32,
    pub metric: Metric,
    pub start_event: EventKind,
    pub end_event: EventKind,
    pub target_ms: u64,
    pub grace_ms: u64,
    pub penalty: PenaltyModel,
    pub scope: Scope,
    pub carve_outs: Vec<CarveOut>,
    pub max_hold_ms: u64,
    pub claim_window_secs: u64,
    pub evidence_mode: EvidenceMode,
    pub status: TemplateStatus,
    pub activates_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Commitment {
    pub id: u64,
    pub provider_id: BytesN<32>,
    pub template_id: u32,
    pub template_version: u32,
    pub stake_asset: Address,
    pub stake_total: i128,
    pub stake_reserved: i128,
    pub min_stake: i128,
    pub max_volume_per_period: i128,
    pub period_secs: u64,
    pub effective_from: u64,
    pub effective_to: Option<u64>,
    pub paused_at: Option<u64>,
    pub resumed_at: Option<u64>,
    pub exit_requested_at: Option<u64>,
    pub exit_cooldown_secs: u64,
    pub open_claims: u32,
    pub status: CommitmentStatus,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRef {
    pub payment_id: BytesN<32>,
    pub sep31_tx_id: String,
    pub commitment_id: u64,
    pub amount: i128,
    pub t0_ms: u64,
    pub t1_ms: Option<u64>,
    pub pause_ms: u64,
    pub evidence_hash: BytesN<32>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CompletionReceipt {
    pub signer: BytesN<32>,
    pub signature: BytesN<64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Claim {
    pub id: u64,
    pub commitment_id: u64,
    pub provider_id: BytesN<32>,
    pub payment: PaymentRef,
    pub breach: BreachKind,
    pub claimant: Address,
    pub beneficiary: Address,
    pub bond_payer: Address,
    pub filed_by_observer: Option<Address>,
    pub penalty_amount: i128,
    pub reserved_amount: i128,
    pub shortfall: i128,
    pub claim_bond: i128,
    pub status: ClaimStatus,
    pub filed_at: u64,
    pub challenge_deadline: u64,
    pub attestation_deadline: u64,
    pub counter_evidence_hash: Option<BytesN<32>>,
    pub votes_for: u32,
    pub votes_against: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Observer {
    pub address: Address,
    pub key: BytesN<32>,
    pub active: bool,
    pub added_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Params {
    pub timelock_secs: u64,
    pub challenge_window_secs: u64,
    pub attestation_window_secs: u64,
    pub exit_extra_secs: u64,
    pub quorum: u32,
    pub min_claim_bond: i128,
    pub claim_bond_bps: u32,
    pub rejected_bond_provider_bps: u32,
    pub stake_floor: i128,
    pub stake_k: u32,
    pub max_stake_per_commitment: i128,
    pub allowed_stake_assets: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct PeriodStats {
    pub payments: u32,
    pub on_time: u32,
    pub breaches: u32,
    pub carved_out: u32,
    pub p50_ms: u64,
    pub p95_ms: u64,
    pub p99_ms: u64,
    pub volume: i128,
    pub penalties_paid: i128,
}

#[contracttype]
#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct LifetimeStats {
    pub payments: u64,
    pub on_time: u64,
    pub breaches: u64,
    pub carved_out: u64,
    pub volume: i128,
    pub penalties_paid: i128,
    pub claims_upheld: u32,
    pub claims_rejected: u32,
    pub claims_expired: u32,
    pub shortfall_total: i128,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BatchRecord {
    pub observer: Address,
    pub merkle_root: BytesN<32>,
    pub attestation_hash: BytesN<32>,
    pub stats: PeriodStats,
    pub anchored_at: u64,
}
