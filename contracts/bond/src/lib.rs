//! Stake custody and claim settlement (guide §6). Governance foundation: VX-301.
#![no_std]
mod coverage;
mod events;
mod stake;
mod storage;
use soroban_sdk::{Address, BytesN, ContractExecutable, Env, contract, contractimpl};
pub use stake::TemplateApi;
pub use storage::DataKey;
use storage::{address, touch};
use vaeltrix_types::{Error, RegistryClient};
#[contract]
pub struct Bond;
#[contractimpl]
impl Bond {
    pub fn __constructor(env: Env, admin: Address, registry: Address, scoreboard: Address) {
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Registry, &registry);
        env.storage()
            .instance()
            .set(&DataKey::Scoreboard, &scoreboard);
        env.storage()
            .instance()
            .set(&DataKey::NextCommitmentId, &1_u64);
        env.storage().instance().set(&DataKey::NextClaimId, &1_u64);
        touch(&env);
    }
    pub fn commit(
        env: Env,
        provider_id: BytesN<32>,
        template_id: u32,
        stake_asset: Address,
        amount: i128,
        max_volume_per_period: i128,
        period_secs: u64,
    ) -> Result<u64, Error> {
        touch(&env);
        stake::commit(
            &env,
            provider_id,
            template_id,
            stake_asset,
            amount,
            max_volume_per_period,
            period_secs,
        )
    }
    pub fn commitment(env: Env, id: u64) -> Result<vaeltrix_types::Commitment, Error> {
        touch(&env);
        storage::commitment(&env, id)
    }
    pub fn commitments_by_provider(env: Env, provider_id: BytesN<32>) -> soroban_sdk::Vec<u64> {
        touch(&env);
        stake::by_provider(&env, &provider_id)
    }
    pub fn available_stake(env: Env, id: u64) -> Result<i128, Error> {
        touch(&env);
        let c = storage::commitment(&env, id)?;
        c.stake_total
            .checked_sub(c.stake_reserved)
            .ok_or(Error::ArithmeticOverflow)
    }
    pub fn max_penalty(env: Env, id: u64) -> Result<i128, Error> {
        touch(&env);
        let c = storage::commitment(&env, id)?;
        let t = stake::registry(&env)?.get_template_version(&c.template_id, &c.template_version);
        stake::template_penalty(&t)
    }
    pub fn add_stake(env: Env, id: u64, amount: i128) -> Result<(), Error> {
        touch(&env);
        stake::change(&env, id, amount, true)
    }
    pub fn withdraw_excess(env: Env, id: u64, amount: i128) -> Result<(), Error> {
        touch(&env);
        stake::change(&env, id, amount, false)
    }
    pub fn is_covered(env: Env, commitment_id: u64, t0_ms: u64) -> Result<bool, Error> {
        touch(&env);
        Ok(coverage::is_covered(
            &storage::commitment(&env, commitment_id)?,
            t0_ms,
        ))
    }
    pub fn pause(env: Env, id: u64) -> Result<(), Error> {
        touch(&env);
        coverage::change(&env, id, false)
    }
    pub fn resume(env: Env, id: u64) -> Result<(), Error> {
        touch(&env);
        coverage::change(&env, id, true)
    }
    pub fn admin(env: Env) -> Result<Address, Error> {
        touch(&env);
        address(&env, &DataKey::Admin)
    }
    pub fn registry(env: Env) -> Result<Address, Error> {
        touch(&env);
        address(&env, &DataKey::Registry)
    }
    pub fn scoreboard(env: Env) -> Result<Address, Error> {
        touch(&env);
        address(&env, &DataKey::Scoreboard)
    }
    pub fn propose_upgrade(env: Env, wasm_hash: BytesN<32>) -> Result<(), Error> {
        touch(&env);
        address(&env, &DataKey::Admin)?.require_auth();
        let params = RegistryClient::new(&env, &address(&env, &DataKey::Registry)?).params();
        let eta = env
            .ledger()
            .timestamp()
            .checked_add(params.timelock_secs)
            .ok_or(Error::ArithmeticOverflow)?;
        env.storage()
            .instance()
            .set(&DataKey::PendingUpgrade, &Some((wasm_hash.clone(), eta)));
        events::UpgradeProposed { wasm_hash }.publish(&env);
        Ok(())
    }
    pub fn execute_upgrade(env: Env) -> Result<(), Error> {
        touch(&env);
        let (wasm_hash, eta) = env
            .storage()
            .instance()
            .get::<_, Option<(BytesN<32>, u64)>>(&DataKey::PendingUpgrade)
            .flatten()
            .ok_or(Error::NothingPending)?;
        if env.ledger().timestamp() < eta {
            return Err(Error::TimelockActive);
        }
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        env.deployer()
            .update_current_contract(ContractExecutable::Wasm(wasm_hash.clone()));
        events::UpgradeExecuted { wasm_hash }.publish(&env);
        Ok(())
    }
    pub fn cancel_upgrade(env: Env) -> Result<(), Error> {
        touch(&env);
        address(&env, &DataKey::Admin)?.require_auth();
        if env
            .storage()
            .instance()
            .get::<_, Option<(BytesN<32>, u64)>>(&DataKey::PendingUpgrade)
            .flatten()
            .is_none()
        {
            return Err(Error::NothingPending);
        }
        env.storage().instance().remove(&DataKey::PendingUpgrade);
        Ok(())
    }
}
#[cfg(test)]
mod test;
#[cfg(test)]
mod testutils;
