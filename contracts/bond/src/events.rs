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
