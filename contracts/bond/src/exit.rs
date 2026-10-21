//! Provider exit locks and final stake return (guide §6.5, VX-304).
use crate::{
    events, stake,
    storage::{commitment, put_commitment},
};
use soroban_sdk::{Env, token};
use vaeltrix_types::{CommitmentStatus, Error};
pub fn request(env: &Env, id: u64) -> Result<(), Error> {
    let mut c = commitment(env, id)?;
    stake::provider(env, &c)?.admin.require_auth();
    if c.status != CommitmentStatus::Active && c.status != CommitmentStatus::Paused {
        return Err(Error::CommitmentNotActive);
    }
    let at = env.ledger().timestamp();
    c.status = CommitmentStatus::Exiting;
    c.exit_requested_at = Some(at);
    put_commitment(env, &c);
    events::ExitRequested {
        commitment_id: id,
        at,
    }
    .publish(env);
    Ok(())
}
pub fn finalize(env: &Env, id: u64) -> Result<(), Error> {
    let mut c = commitment(env, id)?;
    let p = stake::provider(env, &c)?;
    p.admin.require_auth();
    if c.status != CommitmentStatus::Exiting {
        return Err(Error::CommitmentNotActive);
    }
    let until = c
        .exit_requested_at
        .ok_or(Error::CommitmentNotActive)?
        .checked_add(c.exit_cooldown_secs)
        .ok_or(Error::ArithmeticOverflow)?;
    if env.ledger().timestamp() < until {
        return Err(Error::CooldownActive);
    }
    if c.open_claims != 0 {
        return Err(Error::OpenClaimsExist);
    }
    let amount = c.stake_total;
    c.stake_total = 0;
    c.status = CommitmentStatus::Exited;
    put_commitment(env, &c);
    token::Client::new(env, &c.stake_asset).transfer(
        &env.current_contract_address(),
        &p.admin,
        &amount,
    );
    events::ExitFinalized {
        commitment_id: id,
        at: env.ledger().timestamp(),
        amount,
    }
    .publish(env);
    Ok(())
}
