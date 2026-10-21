//! Scoreboard wire events (guide §8.4, VX-401).
use soroban_sdk::{Address, BytesN, contractevent};
use vaeltrix_types::{ClaimOutcome, PeriodStats};
#[contractevent(topics=["bond_set"])]
pub struct BondSet {
    pub bond: Address,
}
#[contractevent(topics=["batch"])]
pub struct BatchAnchored {
    #[topic]
    pub commitment_id: u64,
    pub period: u64,
    pub merkle_root: BytesN<32>,
    pub observer: Address,
    pub stats: PeriodStats,
}
#[contractevent(topics=["claim_out"])]
pub struct ClaimRecorded {
    #[topic]
    pub claim_id: u64,
    pub provider_id: BytesN<32>,
    pub outcome: ClaimOutcome,
}
