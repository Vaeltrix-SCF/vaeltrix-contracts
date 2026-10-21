//! Stake custody and claim settlement (guide §6). Governance foundation: VX-301.
#![no_std]
mod events;
mod storage;
use soroban_sdk::{Address, BytesN, ContractExecutable, Env, contract, contractimpl};
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
