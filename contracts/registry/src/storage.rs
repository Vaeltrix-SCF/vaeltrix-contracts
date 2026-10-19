//! Frozen registry storage and governance actions (guide §5.1, VX-201).
use soroban_sdk::{Address, BytesN, Env, contracttype};
use vaeltrix_types::{INSTANCE_BUMP, INSTANCE_THRESHOLD, PERSIST_BUMP, PERSIST_THRESHOLD, Params};
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    PendingAdmin,
    Params,
    Verifier,
    NextActionId,
    Provider(BytesN<32>),
    ProviderByAdmin(Address),
    Template(u32, u32),
    TemplateLatest(u32),
    TemplateIds,
    Observer(Address),
    ObserverList,
    Action(u32),
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ActionKind {
    SetParams(Params),
    AddObserver(Address, BytesN<32>),
    RemoveObserver(Address),
    SetVerifier(Address),
    Upgrade(BytesN<32>),
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PendingAction {
    pub id: u32,
    pub kind: ActionKind,
    pub eta: u64,
    pub executed: bool,
    pub cancelled: bool,
}

pub fn touch(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}
pub fn touch_key(env: &Env, key: &DataKey) {
    env.storage()
        .persistent()
        .extend_ttl(key, PERSIST_THRESHOLD, PERSIST_BUMP);
}
