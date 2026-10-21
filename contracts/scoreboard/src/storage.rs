//! Frozen scoreboard keys and TTL helpers (guide §7.1, VX-401).
use soroban_sdk::{Address, BytesN, Env, Vec, contracttype};
use vaeltrix_types::{
    BatchRecord, Error, INSTANCE_BUMP, INSTANCE_THRESHOLD, LifetimeStats, PERSIST_BUMP,
    PERSIST_THRESHOLD,
};
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Registry,
    Bond,
    Batch(u64, u64),
    BatchPeriods(u64),
    Lifetime(BytesN<32>),
    CommitmentProvider(u64),
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
pub fn address(env: &Env, key: &DataKey) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(key)
        .ok_or(Error::NotInitialized)
}
pub fn lifetime(env: &Env, id: &BytesN<32>) -> LifetimeStats {
    let key = DataKey::Lifetime(id.clone());
    let v = env.storage().persistent().get(&key).unwrap_or_default();
    if env.storage().persistent().has(&key) {
        touch_key(env, &key);
    }
    v
}
pub fn periods(env: &Env, id: u64) -> Vec<u64> {
    let key = DataKey::BatchPeriods(id);
    let v = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    if env.storage().persistent().has(&key) {
        touch_key(env, &key);
    }
    v
}
pub fn batch(env: &Env, id: u64, period: u64) -> Result<BatchRecord, Error> {
    let key = DataKey::Batch(id, period);
    let v = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NothingPending)?;
    touch_key(env, &key);
    Ok(v)
}
