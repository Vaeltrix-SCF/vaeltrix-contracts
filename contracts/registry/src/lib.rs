//! Registry governance and identity (guide §5, VX-201).
#![no_std]
mod events;
mod storage;
use soroban_sdk::{Address, Env, contract, contractimpl};
pub use storage::{ActionKind, DataKey, PendingAction};
use storage::{touch, touch_key};
use vaeltrix_types::{Error, Params};

fn validate_params(p: &Params) -> Result<(), Error> {
    if p.challenge_window_secs < 60
        || p.attestation_window_secs < 60
        || p.quorum == 0
        || p.quorum > 32
        || p.min_claim_bond <= 0
        || p.claim_bond_bps > 10_000
        || p.rejected_bond_provider_bps > 10_000
        || p.stake_floor <= 0
        || p.stake_k == 0
        || p.max_stake_per_commitment < 0
        || p.allowed_stake_assets.is_empty()
        || p.allowed_stake_assets.len() > 8
    {
        return Err(Error::InvalidParams);
    }
    for (i, asset) in p.allowed_stake_assets.iter().enumerate() {
        if p.allowed_stake_assets
            .iter()
            .skip(i.checked_add(1).ok_or(Error::ArithmeticOverflow)?)
            .any(|a| a == asset)
        {
            return Err(Error::InvalidParams);
        }
    }
    Ok(())
}
fn admin(env: &Env) -> Result<Address, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Admin)
        .ok_or(Error::NotInitialized)
}
fn require_admin(env: &Env) -> Result<(), Error> {
    admin(env)?.require_auth();
    Ok(())
}
fn params(env: &Env) -> Result<Params, Error> {
    env.storage()
        .instance()
        .get(&DataKey::Params)
        .ok_or(Error::NotInitialized)
}
fn action(env: &Env, id: u32) -> Result<PendingAction, Error> {
    let key = DataKey::Action(id);
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::NothingPending)?;
    touch_key(env, &key);
    Ok(value)
}
fn pending(env: &Env, id: u32) -> Result<PendingAction, Error> {
    let value = action(env, id)?;
    if value.executed || value.cancelled {
        return Err(Error::NothingPending);
    }
    Ok(value)
}
#[contract]
pub struct Registry;
#[contractimpl]
impl Registry {
    pub fn __constructor(env: Env, admin: Address, params: Params) -> Result<(), Error> {
        validate_params(&params)?;
        env.storage().instance().set(&DataKey::Admin, &admin);
        env.storage().instance().set(&DataKey::Params, &params);
        env.storage().instance().set(&DataKey::Verifier, &admin);
        env.storage().instance().set(&DataKey::NextActionId, &1_u32);
        touch(&env);
        events::init(&env, admin);
        Ok(())
    }
    pub fn admin(env: Env) -> Result<Address, Error> {
        touch(&env);
        admin(&env)
    }
    pub fn params(env: Env) -> Result<Params, Error> {
        touch(&env);
        params(&env)
    }
    pub fn propose_admin(env: Env, new_admin: Address) -> Result<(), Error> {
        require_admin(&env)?;
        touch(&env);
        env.storage()
            .instance()
            .set(&DataKey::PendingAdmin, &Some(new_admin.clone()));
        events::AdminProposed { address: new_admin }.publish(&env);
        Ok(())
    }
    pub fn accept_admin(env: Env) -> Result<(), Error> {
        let next: Address = env
            .storage()
            .instance()
            .get::<_, Option<Address>>(&DataKey::PendingAdmin)
            .flatten()
            .ok_or(Error::NothingPending)?;
        next.require_auth();
        touch(&env);
        env.storage().instance().set(&DataKey::Admin, &next);
        env.storage().instance().remove(&DataKey::PendingAdmin);
        events::AdminSet { address: next }.publish(&env);
        Ok(())
    }
    pub fn propose(env: Env, kind: ActionKind) -> Result<u32, Error> {
        require_admin(&env)?;
        touch(&env);
        if let ActionKind::SetParams(ref p) = kind {
            validate_params(p)?;
        }
        // Observer action execution is completed by VX-204; keep it fail-closed here.
        if matches!(
            kind,
            ActionKind::AddObserver(..) | ActionKind::RemoveObserver(..)
        ) {
            return Err(Error::InvalidParams);
        }
        let id: u32 = env
            .storage()
            .instance()
            .get(&DataKey::NextActionId)
            .ok_or(Error::NotInitialized)?;
        let next_id = id.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
        let eta = env
            .ledger()
            .timestamp()
            .checked_add(params(&env)?.timelock_secs)
            .ok_or(Error::ArithmeticOverflow)?;
        let tag = match &kind {
            ActionKind::SetParams(_) => 0,
            ActionKind::AddObserver(..) => 1,
            ActionKind::RemoveObserver(_) => 2,
            ActionKind::SetVerifier(_) => 3,
            ActionKind::Upgrade(_) => 4,
        };
        let key = DataKey::Action(id);
        env.storage().persistent().set(
            &key,
            &PendingAction {
                id,
                kind,
                eta,
                executed: false,
                cancelled: false,
            },
        );
        touch_key(&env, &key);
        env.storage()
            .instance()
            .set(&DataKey::NextActionId, &next_id);
        events::ActionProposed {
            action_id: id,
            kind: tag,
            eta,
        }
        .publish(&env);
        Ok(id)
    }
    pub fn execute(env: Env, action_id: u32) -> Result<(), Error> {
        touch(&env);
        let mut a = pending(&env, action_id)?;
        if env.ledger().timestamp() < a.eta {
            return Err(Error::TimelockActive);
        }
        match &a.kind {
            ActionKind::SetParams(p) => {
                validate_params(p)?;
                env.storage().instance().set(&DataKey::Params, p);
            }
            ActionKind::SetVerifier(v) => env.storage().instance().set(&DataKey::Verifier, v),
            ActionKind::Upgrade(hash) => env
                .deployer()
                .update_current_contract(soroban_sdk::ContractExecutable::Wasm(hash.clone())),
            ActionKind::AddObserver(..) | ActionKind::RemoveObserver(..) => {
                return Err(Error::InvalidParams);
            }
        }
        a.executed = true;
        let key = DataKey::Action(action_id);
        env.storage().persistent().set(&key, &a);
        touch_key(&env, &key);
        events::ActionExecuted { action_id }.publish(&env);
        Ok(())
    }
    pub fn cancel(env: Env, action_id: u32) -> Result<(), Error> {
        require_admin(&env)?;
        touch(&env);
        let mut a = pending(&env, action_id)?;
        a.cancelled = true;
        let key = DataKey::Action(action_id);
        env.storage().persistent().set(&key, &a);
        touch_key(&env, &key);
        events::ActionCancelled { action_id }.publish(&env);
        Ok(())
    }
    pub fn action(env: Env, id: u32) -> Result<PendingAction, Error> {
        touch(&env);
        action(&env, id)
    }
}
#[cfg(test)]
mod test;
