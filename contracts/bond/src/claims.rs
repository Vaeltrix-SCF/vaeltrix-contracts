//! Observer-attested filing (VX-305, guide §6.6). Path B is VX-308 (#23).
use crate::{DataKey, coverage, events, stake, storage};
use soroban_sdk::{Address, BytesN, Env, token};
use vaeltrix_types::{
    BreachKind, Claim, ClaimStatus, CommitmentStatus, CompletionReceipt, Error, MAX_PAUSE_MS,
    PaymentRef, PenaltyModel, RESOLVED_CLAIM_BUMP,
};
pub fn load_claim(env: &Env, id: u64) -> Result<Claim, Error> {
    env.storage()
        .persistent()
        .get(&DataKey::Claim(id))
        .ok_or(Error::UnknownClaim)
}

fn is_open(status: &ClaimStatus) -> bool {
    matches!(status, ClaimStatus::Filed | ClaimStatus::Challenged)
}

pub fn claim(env: &Env, id: u64) -> Result<Claim, Error> {
    let value = load_claim(env, id)?;
    if is_open(&value.status) {
        storage::touch_key(env, &DataKey::Claim(id));
    }
    Ok(value)
}

pub fn put_claim(env: &Env, value: &Claim) {
    let key = DataKey::Claim(value.id);
    env.storage().persistent().set(&key, value);
    if is_open(&value.status) {
        storage::touch_key(env, &key);
    } else {
        // Soroban can extend existing TTL, but cannot shorten it.
        env.storage()
            .persistent()
            .extend_ttl(&key, RESOLVED_CLAIM_BUMP, RESOLVED_CLAIM_BUMP);
    }
}
pub fn by_payment(env: &Env, payment_id: BytesN<32>) -> Option<u64> {
    let key = DataKey::ClaimByPayment(payment_id);
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        storage::touch_key(env, &key);
    }
    value
}
pub fn file(
    env: &Env,
    claimant: Address,
    beneficiary: Address,
    payment: PaymentRef,
    observer: Option<Address>,
    receipt: Option<CompletionReceipt>,
) -> Result<u64, Error> {
    claimant.require_auth();
    if observer.is_some() == receipt.is_some() {
        return Err(Error::InvalidEvidence);
    }
    let observer_address = observer.as_ref().ok_or(Error::InvalidEvidence)?;
    // One authorization covers both roles for delegated filing (§6.6 step 3).
    if observer_address != &claimant {
        observer_address.require_auth();
    }
    storage::touch(env);
    let registry = stake::registry(env)?;
    if !registry.is_active_observer(observer_address) {
        return Err(Error::UnknownObserver);
    }
    let mut c = storage::commitment(env, payment.commitment_id)?;
    let _provider = registry.get_provider(&c.provider_id);
    let template = registry.get_template_version(&c.template_id, &c.template_version);
    if payment.payment_id != vaeltrix_types::payment_id(env, &payment.sep31_tx_id, &c.provider_id) {
        return Err(Error::PaymentIdMismatch);
    }
    if by_payment(env, payment.payment_id.clone()).is_some() {
        return Err(Error::DuplicateClaim);
    }
    if payment.amount < template.scope.min_amount || payment.amount > template.scope.max_amount {
        return Err(Error::OutOfScope);
    }
    if c.status == CommitmentStatus::Exited || !coverage::is_covered(&c, payment.t0_ms) {
        return Err(Error::NotCovered);
    }
    if payment.pause_ms > MAX_PAUSE_MS {
        return Err(Error::InvalidEvidence);
    }
    let now = env.ledger().timestamp();
    let now_ms = now.checked_mul(1000).ok_or(Error::ArithmeticOverflow)?;
    let verdict = vaeltrix_verdict::evaluate(
        payment.t0_ms,
        payment.t1_ms,
        now_ms,
        template.target_ms,
        template.grace_ms,
        payment.pause_ms,
    )
    .ok_or(Error::InvalidEvidence)?;
    let breach = match verdict {
        vaeltrix_verdict::Verdict::Late { .. } => BreachKind::LateCompletion,
        vaeltrix_verdict::Verdict::NoCompletion => BreachKind::NoCompletion,
        _ => return Err(Error::NotInBreach),
    };
    let deadline = vaeltrix_verdict::deadline_ms(
        payment.t0_ms,
        template.target_ms,
        template.grace_ms,
        payment.pause_ms,
    )
    .ok_or(Error::ArithmeticOverflow)?;
    let last = vaeltrix_verdict::claim_deadline_ms(deadline, template.claim_window_secs)
        .ok_or(Error::ArithmeticOverflow)?;
    if now_ms > last {
        return Err(Error::ClaimWindowClosed);
    }
    let PenaltyModel::PerBreachBps(model) = template.penalty;
    let penalty = vaeltrix_verdict::penalty(payment.amount, model.bps, model.cap)
        .ok_or(Error::ArithmeticOverflow)?;
    if penalty == 0 {
        return Err(Error::OutOfScope);
    }
    let params = registry.params();
    let bond = vaeltrix_verdict::claim_bond(penalty, params.min_claim_bond, params.claim_bond_bps)
        .ok_or(Error::ArithmeticOverflow)?;
    token::Client::new(env, &c.stake_asset).transfer(
        &claimant,
        env.current_contract_address(),
        &bond,
    );
    let available = c
        .stake_total
        .checked_sub(c.stake_reserved)
        .ok_or(Error::ArithmeticOverflow)?;
    let reserved = available.min(penalty);
    let shortfall = penalty
        .checked_sub(reserved)
        .ok_or(Error::ArithmeticOverflow)?;
    c.stake_reserved = c
        .stake_reserved
        .checked_add(reserved)
        .ok_or(Error::ArithmeticOverflow)?;
    c.open_claims = c
        .open_claims
        .checked_add(1)
        .ok_or(Error::ArithmeticOverflow)?;
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextClaimId)
        .ok_or(Error::NotInitialized)?;
    let next = id.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
    let value = Claim {
        id,
        commitment_id: c.id,
        provider_id: c.provider_id.clone(),
        payment: payment.clone(),
        breach,
        claimant: claimant.clone(),
        beneficiary: beneficiary.clone(),
        bond_payer: claimant.clone(),
        filed_by_observer: observer,
        penalty_amount: penalty,
        reserved_amount: reserved,
        shortfall,
        claim_bond: bond,
        status: ClaimStatus::Filed,
        filed_at: now,
        challenge_deadline: now
            .checked_add(params.challenge_window_secs)
            .ok_or(Error::ArithmeticOverflow)?,
        attestation_deadline: 0,
        counter_evidence_hash: None,
        votes_for: 0,
        votes_against: 0,
    };
    storage::put_commitment(env, &c);
    put_claim(env, &value);
    let index = DataKey::ClaimByPayment(payment.payment_id.clone());
    env.storage().persistent().set(&index, &id);
    storage::touch_key(env, &index);
    env.storage().instance().set(&DataKey::NextClaimId, &next);
    events::ClaimFiled {
        claim_id: id,
        commitment_id: c.id,
        payment_id: payment.payment_id,
        breach,
        penalty,
        reserved,
        shortfall,
        bond,
        claimant,
        beneficiary,
    }
    .publish(env);
    Ok(id)
}
