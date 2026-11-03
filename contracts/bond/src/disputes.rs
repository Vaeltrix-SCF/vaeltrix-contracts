//! Challenge and attestation state transitions (VX-306, guide §6.7).
use crate::{DataKey, claims, events, stake, storage};
use soroban_sdk::{Address, BytesN, Env, Vec};
use vaeltrix_types::{ClaimStatus, Error};
pub fn votes(env: &Env, id: u64) -> Vec<(Address, bool)> {
    let key = DataKey::ClaimVotes(id);
    let result = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    if env.storage().persistent().has(&key) {
        storage::touch_key(env, &key);
    }
    result
}
pub fn challenge(env: &Env, id: u64, hash: BytesN<32>) -> Result<(), Error> {
    let mut claim = claims::claim(env, id)?;
    let registry = stake::registry(env)?;
    registry
        .get_provider(&claim.provider_id)
        .admin
        .require_auth();
    storage::touch(env);
    let now = env.ledger().timestamp();
    if claim.status != ClaimStatus::Filed || now >= claim.challenge_deadline {
        return Err(Error::ClaimNotOpen);
    }
    claim.status = ClaimStatus::Challenged;
    claim.counter_evidence_hash = Some(hash.clone());
    claim.attestation_deadline = now
        .checked_add(registry.params().attestation_window_secs)
        .ok_or(Error::ArithmeticOverflow)?;
    claims::put_claim(env, &claim);
    events::ClaimChallenged {
        claim_id: id,
        counter_evidence_hash: hash,
        attestation_deadline: claim.attestation_deadline,
    }
    .publish(env);
    Ok(())
}
pub fn attest(
    env: &Env,
    observer: Address,
    id: u64,
    uphold: bool,
    hash: BytesN<32>,
) -> Result<(), Error> {
    observer.require_auth();
    storage::touch(env);
    if !stake::registry(env)?.is_active_observer(&observer) {
        return Err(Error::UnknownObserver);
    }
    let mut claim = claims::claim(env, id)?;
    if claim.status != ClaimStatus::Challenged {
        return Err(Error::ClaimNotOpen);
    }
    if env.ledger().timestamp() > claim.attestation_deadline {
        return Err(Error::AttestationWindowClosed);
    }
    let mut votes = votes(env, id);
    if votes.iter().any(|(address, _)| address == observer) {
        return Err(Error::AlreadyAttested);
    }
    // Approved observer-rotation bound: docs/guide-clarifications.md (§6.7 / §17.5).
    if votes.len() >= 32 {
        return Err(Error::InvalidParams);
    }
    votes.push_back((observer.clone(), uphold));
    if uphold {
        claim.votes_for = claim
            .votes_for
            .checked_add(1)
            .ok_or(Error::ArithmeticOverflow)?;
    } else {
        claim.votes_against = claim
            .votes_against
            .checked_add(1)
            .ok_or(Error::ArithmeticOverflow)?;
    }
    let key = DataKey::ClaimVotes(id);
    env.storage().persistent().set(&key, &votes);
    storage::touch_key(env, &key);
    claims::put_claim(env, &claim);
    events::ClaimAttested {
        claim_id: id,
        observer,
        uphold,
        attestation_hash: hash,
    }
    .publish(env);
    Ok(())
}
