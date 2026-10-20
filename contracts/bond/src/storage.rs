//! Frozen bond storage keys (guide §6.1, VX-301).
use soroban_sdk::{Address, BytesN, Env, contracttype};
use vaeltrix_types::{Error, INSTANCE_BUMP, INSTANCE_THRESHOLD};
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    Admin,
    Registry,
    Scoreboard,
    NextCommitmentId,
    NextClaimId,
    PendingUpgrade,
    Commitment(u64),
    CommitmentsByProvider(BytesN<32>),
    Claim(u64),
    ClaimByPayment(BytesN<32>),
    ClaimVotes(u64),
}
pub fn touch(env: &Env) {
    env.storage()
        .instance()
        .extend_ttl(INSTANCE_THRESHOLD, INSTANCE_BUMP);
}
pub fn address(env: &Env, key: &DataKey) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(key)
        .ok_or(Error::NotInitialized)
}
pub fn touch_key(env: &Env, key: &DataKey) {
    env.storage().persistent().extend_ttl(
        key,
        vaeltrix_types::PERSIST_THRESHOLD,
        vaeltrix_types::PERSIST_BUMP,
    );
}
pub fn commitment(env: &Env, id: u64) -> Result<vaeltrix_types::Commitment, Error> {
    let key = DataKey::Commitment(id);
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::UnknownCommitment)?;
    touch_key(env, &key);
    Ok(value)
}
pub fn put_commitment(env: &Env, value: &vaeltrix_types::Commitment) {
    let key = DataKey::Commitment(value.id);
    env.storage().persistent().set(&key, value);
    touch_key(env, &key);
}
