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
