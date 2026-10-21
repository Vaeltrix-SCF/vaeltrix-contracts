//! Historical coverage and pause transitions (guide §6.3, VX-303).
use crate::{
    events, stake,
    storage::{commitment, put_commitment},
};
use soroban_sdk::Env;
use vaeltrix_types::{Commitment, CommitmentStatus, Error};
pub(super) fn is_covered(c: &Commitment, t0_ms: u64) -> bool {
    let t = t0_ms / 1000;
    if t < c.effective_from
        || c.effective_to.is_some_and(|end| t >= end)
        || c.exit_requested_at.is_some_and(|exit| t >= exit)
    {
        return false;
    }
    match c.paused_at {
        None => true,
        Some(p) => match c.resumed_at {
            Some(r) => r > p && (t < p || t >= r),
            None => t < p,
        },
    }
}
pub fn change(env: &Env, id: u64, resume: bool) -> Result<(), Error> {
    let mut c = commitment(env, id)?;
    stake::provider(env, &c)?.admin.require_auth();
    let expected = if resume {
        CommitmentStatus::Paused
    } else {
        CommitmentStatus::Active
    };
    if c.status != expected {
        return Err(Error::CommitmentNotActive);
    }
    let at = env.ledger().timestamp();
    if resume {
        c.status = CommitmentStatus::Active;
        c.resumed_at = Some(at);
    } else {
        c.status = CommitmentStatus::Paused;
        c.paused_at = Some(at);
        c.resumed_at = None;
    }
    put_commitment(env, &c);
    if resume {
        events::Resumed {
            commitment_id: id,
            at,
        }
        .publish(env);
    } else {
        events::Paused {
            commitment_id: id,
            at,
        }
        .publish(env);
    }
    Ok(())
}
