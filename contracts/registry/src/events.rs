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
