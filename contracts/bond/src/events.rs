//! Bond governance events (guide §8.4, VX-301).
use soroban_sdk::{BytesN, contractevent};
#[contractevent(topics=["upg_prop"])]
pub struct UpgradeProposed {
    pub wasm_hash: BytesN<32>,
}
#[contractevent(topics=["upg_exec"])]
pub struct UpgradeExecuted {
    pub wasm_hash: BytesN<32>,
}
// Stake events (VX-302).
#[contractevent(topics=["commit"])]
pub struct Committed {
    #[topic]
    pub commitment_id: u64,
    pub provider_id: BytesN<32>,
    pub template_id: u32,
    pub version: u32,
    pub stake_asset: soroban_sdk::Address,
    pub amount: i128,
}
#[contractevent(topics=["stake_chg"])]
pub struct StakeChanged {
    #[topic]
    pub commitment_id: u64,
    pub delta: i128,
    pub new_total: i128,
}
// Coverage transitions (VX-303).
#[contractevent(topics=["cmt_pause"])]
pub struct Paused {
    #[topic]
    pub commitment_id: u64,
    pub at: u64,
}
#[contractevent(topics=["cmt_resum"])]
pub struct Resumed {
    #[topic]
    pub commitment_id: u64,
    pub at: u64,
}
// Exit lifecycle (VX-304).
#[contractevent(topics=["exit_req"])]
pub struct ExitRequested {
    #[topic]
    pub commitment_id: u64,
    pub at: u64,
}
#[contractevent(topics=["exit_fin"])]
pub struct ExitFinalized {
    #[topic]
    pub commitment_id: u64,
    pub at: u64,
    pub amount: i128,
}
// Claim lifecycle (VX-305).
#[contractevent(topics=["claim_new"])]
pub struct ClaimFiled {
    #[topic]
    pub claim_id: u64,
    pub commitment_id: u64,
    pub payment_id: BytesN<32>,
    pub breach: vaeltrix_types::BreachKind,
    pub penalty: i128,
    pub reserved: i128,
    pub shortfall: i128,
    pub bond: i128,
    pub claimant: soroban_sdk::Address,
    pub beneficiary: soroban_sdk::Address,
}
// Challenge and voting (VX-306).
#[contractevent(topics=["claim_chal"])]
pub struct ClaimChallenged {
    #[topic]
    pub claim_id: u64,
    pub counter_evidence_hash: BytesN<32>,
    pub attestation_deadline: u64,
}
#[contractevent(topics=["claim_att"])]
pub struct ClaimAttested {
    #[topic]
    pub claim_id: u64,
    pub observer: soroban_sdk::Address,
    pub uphold: bool,
    pub attestation_hash: BytesN<32>,
}
// Atomic settlement (VX-307).
#[contractevent(topics=["claim_res"])]
pub struct ClaimResolved {
    #[topic]
    pub claim_id: u64,
    pub outcome: vaeltrix_types::ClaimOutcome,
    pub amount_paid: i128,
    pub bond_refunded: bool,
}
