//! Observer aggregates and bond-authorized claim accounting (guide §7, VX-401).
#![no_std]
// The frozen anchor_batch signature and its generated client take eight arguments.
#![allow(clippy::too_many_arguments)]
mod events;
mod storage;
use soroban_sdk::{Address, BytesN, Env, Vec, contract, contractimpl};
pub use storage::DataKey;
use storage::{address, touch, touch_key};
use vaeltrix_types::{
    BatchRecord, Claim, ClaimOutcome, Error, LifetimeStats, PeriodStats, RegistryClient,
};
#[contract]
pub struct Scoreboard;
#[contractimpl]
impl Scoreboard {
    pub fn __constructor(env: Env, admin: Address, registry: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Registry, &registry);
        touch(&env);
    }
    pub fn bond(env: Env) -> Option<Address> {
        touch(&env);
        env.storage()
            .instance()
            .get::<_, Option<Address>>(&DataKey::Bond)
            .flatten()
    }
    pub fn set_bond(env: Env, bond: Address) -> Result<(), Error> {
        touch(&env);
        address(&env, &DataKey::Admin)?.require_auth();
        if Self::bond(env.clone()).is_some() {
            return Err(Error::BondAlreadySet);
        }
        env.storage()
            .instance()
            .set(&DataKey::Bond, &Some(bond.clone()));
        events::BondSet { bond }.publish(&env);
        Ok(())
    }
    pub fn anchor_batch(
        env: Env,
        observer: Address,
        commitment_id: u64,
        provider_id: BytesN<32>,
        period_start: u64,
        period_end: u64,
        merkle_root: BytesN<32>,
        stats: PeriodStats,
        attestation_hash: BytesN<32>,
    ) -> Result<(), Error> {
        touch(&env);
        observer.require_auth();
        if !RegistryClient::new(&env, &address(&env, &DataKey::Registry)?)
            .is_active_observer(&observer)
        {
            return Err(Error::UnknownObserver);
        }
        if !period_start.is_multiple_of(86400)
            || period_start.checked_add(86400) != Some(period_end)
            || period_end > env.ledger().timestamp()
        {
            return Err(Error::InvalidPeriod);
        }
        let period = period_start / 86400;
        let key = DataKey::Batch(commitment_id, period);
        if env.storage().persistent().has(&key) {
            return Err(Error::BatchExists);
        }
        let counts = stats
            .on_time
            .checked_add(stats.breaches)
            .and_then(|v| v.checked_add(stats.carved_out))
            .ok_or(Error::ArithmeticOverflow)?;
        if counts != stats.payments
            || stats.p50_ms > stats.p95_ms
            || stats.p95_ms > stats.p99_ms
            || stats.volume < 0
            || stats.penalties_paid < 0
            || (stats.payments == 0 && merkle_root != BytesN::from_array(&env, &[0; 32]))
        {
            return Err(Error::InvalidParams);
        }
        let mut life = storage::lifetime(&env, &provider_id);
        life.payments = life
            .payments
            .checked_add(u64::from(stats.payments))
            .ok_or(Error::ArithmeticOverflow)?;
        life.on_time = life
            .on_time
            .checked_add(u64::from(stats.on_time))
            .ok_or(Error::ArithmeticOverflow)?;
        life.breaches = life
            .breaches
            .checked_add(u64::from(stats.breaches))
            .ok_or(Error::ArithmeticOverflow)?;
        life.carved_out = life
            .carved_out
            .checked_add(u64::from(stats.carved_out))
            .ok_or(Error::ArithmeticOverflow)?;
        life.volume = life
            .volume
            .checked_add(stats.volume)
            .ok_or(Error::ArithmeticOverflow)?;
        let record = BatchRecord {
            observer: observer.clone(),
            merkle_root: merkle_root.clone(),
            attestation_hash,
            stats: stats.clone(),
            anchored_at: env.ledger().timestamp(),
        };
        env.storage().persistent().set(&key, &record);
        touch_key(&env, &key);
        let mut periods = storage::periods(&env, commitment_id);
        periods.push_back(period);
        if periods.len() > 90 {
            periods.remove(0);
        }
        for key in [
            DataKey::BatchPeriods(commitment_id),
            DataKey::Lifetime(provider_id.clone()),
            DataKey::CommitmentProvider(commitment_id),
        ] {
            match &key {
                DataKey::BatchPeriods(_) => env.storage().persistent().set(&key, &periods),
                DataKey::Lifetime(_) => env.storage().persistent().set(&key, &life),
                _ => env.storage().persistent().set(&key, &provider_id),
            };
            touch_key(&env, &key);
        }
        events::BatchAnchored {
            commitment_id,
            period,
            merkle_root,
            observer,
            stats,
        }
        .publish(&env);
        Ok(())
    }
    pub fn record_claim_outcome(
        env: Env,
        claim: Claim,
        outcome: ClaimOutcome,
    ) -> Result<(), Error> {
        touch(&env);
        Self::bond(env.clone())
            .ok_or(Error::NotAuthorized)?
            .require_auth();
        let mut life = storage::lifetime(&env, &claim.provider_id);
        match outcome {
            ClaimOutcome::Upheld => {
                life.penalties_paid = life
                    .penalties_paid
                    .checked_add(claim.reserved_amount)
                    .ok_or(Error::ArithmeticOverflow)?;
                life.shortfall_total = life
                    .shortfall_total
                    .checked_add(claim.shortfall)
                    .ok_or(Error::ArithmeticOverflow)?;
                life.claims_upheld = life
                    .claims_upheld
                    .checked_add(1)
                    .ok_or(Error::ArithmeticOverflow)?;
            }
            ClaimOutcome::Rejected => {
                life.claims_rejected = life
                    .claims_rejected
                    .checked_add(1)
                    .ok_or(Error::ArithmeticOverflow)?
            }
            ClaimOutcome::Expired => {
                life.claims_expired = life
                    .claims_expired
                    .checked_add(1)
                    .ok_or(Error::ArithmeticOverflow)?
            }
        }
        let key = DataKey::Lifetime(claim.provider_id.clone());
        env.storage().persistent().set(&key, &life);
        touch_key(&env, &key);
        events::ClaimRecorded {
            claim_id: claim.id,
            provider_id: claim.provider_id,
            outcome,
        }
        .publish(&env);
        Ok(())
    }
    pub fn lifetime(env: Env, provider_id: BytesN<32>) -> LifetimeStats {
        touch(&env);
        storage::lifetime(&env, &provider_id)
    }
    pub fn batch(env: Env, commitment_id: u64, period: u64) -> Result<BatchRecord, Error> {
        touch(&env);
        storage::batch(&env, commitment_id, period)
    }
    pub fn stats(env: Env, commitment_id: u64, period: u64) -> Result<PeriodStats, Error> {
        touch(&env);
        Ok(storage::batch(&env, commitment_id, period)?.stats)
    }
    pub fn periods(env: Env, commitment_id: u64) -> Vec<u64> {
        touch(&env);
        storage::periods(&env, commitment_id)
    }
}
#[cfg(test)]
mod test;
