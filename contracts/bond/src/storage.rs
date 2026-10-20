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
