//! Typed governance events (guide §8.4, VX-201).
use soroban_sdk::{Address, Env, contractevent};
#[contractevent(topics = ["init"])]
pub struct Init {
    pub admin: Address,
}
#[contractevent(topics = ["adm_prop"])]
pub struct AdminProposed {
    pub address: Address,
}
#[contractevent(topics = ["adm_set"])]
pub struct AdminSet {
    pub address: Address,
}
#[contractevent(topics = ["act_prop"])]
pub struct ActionProposed {
    #[topic]
    pub action_id: u32,
    pub kind: u32,
    pub eta: u64,
}
#[contractevent(topics = ["act_exec"])]
pub struct ActionExecuted {
    #[topic]
    pub action_id: u32,
}
#[contractevent(topics = ["act_canc"])]
pub struct ActionCancelled {
    #[topic]
    pub action_id: u32,
}
pub fn init(env: &Env, admin: Address) {
    Init { admin }.publish(env);
}

// Provider events (guide §8.4, VX-202).
#[contractevent(topics = ["prov_reg"])]
pub struct ProviderRegistered {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
    pub admin: Address,
    pub home_domain: soroban_sdk::String,
}
#[contractevent(topics = ["prov_sig"])]
pub struct ProviderSigners {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
    pub new_value: soroban_sdk::Vec<soroban_sdk::BytesN<32>>,
}
#[contractevent(topics = ["prov_meta"])]
pub struct ProviderMetadata {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
    pub new_value: soroban_sdk::String,
}
#[contractevent(topics = ["prov_ver"])]
pub struct ProviderVerified {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
}
#[contractevent(topics = ["prov_unv"])]
pub struct ProviderUnverified {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
}
#[contractevent(topics = ["prov_sus"])]
pub struct ProviderSuspended {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
    pub reason: soroban_sdk::Symbol,
}
#[contractevent(topics = ["prov_rein"])]
pub struct ProviderReinstated {
    #[topic]
    pub provider_id: soroban_sdk::BytesN<32>,
}
