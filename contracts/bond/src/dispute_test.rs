//! VX-306 challenge and attestation tests.
#![allow(clippy::arithmetic_side_effects, clippy::unwrap_used)]
use crate::testutils::World;
use soroban_sdk::{BytesN, testutils::Ledger};
use vaeltrix_types::{ClaimStatus, Error};
pub(super) fn filed() -> (World<'static>, u64) {
    let w = World::new();
    let commitment = w.with_commitment(10_000_000_000);
    let t = w.env.ledger().timestamp() * 1000;
    let p = w.payment(commitment, 1_000_000_000, t, Some(t + 131_000));
    w.advance_secs(132);
    let id = w
        .bond
        .file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None);
    (w, id)
}
pub(super) fn challenge(w: &World<'_>, id: u64) {
    w.bond.challenge(&id, &BytesN::from_array(&w.env, &[4; 32]));
}
#[test]
fn challenge_after_deadline_fails() {
    let (w, id) = filed();
    w.advance_secs(180);
    assert_eq!(
        w.bond
            .try_challenge(&id, &BytesN::from_array(&w.env, &[4; 32])),
        Err(Ok(Error::ClaimNotOpen))
    );
    w.assert_invariants();
}
#[test]
fn challenge_requires_provider_admin() {
    let (w, id) = filed();
    w.env.mock_auths(&[]);
    assert!(
        w.bond
            .try_challenge(&id, &BytesN::from_array(&w.env, &[4; 32]))
            .is_err()
    );
    assert_eq!(w.bond.claim(&id).status, ClaimStatus::Filed);
    w.assert_invariants();
}
#[test]
fn attest_twice_fails() {
    let (w, id) = filed();
    challenge(&w, id);
    let hash = BytesN::from_array(&w.env, &[5; 32]);
    w.bond.attest(&w.observer, &id, &true, &hash);
    assert_eq!(
        w.bond.try_attest(&w.observer, &id, &false, &hash),
        Err(Ok(Error::AlreadyAttested))
    );
    assert_eq!(w.bond.claim(&id).votes_for, 1);
    assert_eq!(w.bond.claim(&id).votes_against, 0);
    assert_eq!(
        w.bond.claim_votes(&id).get(0),
        Some((w.observer.clone(), true))
    );
    w.assert_invariants();
}
#[test]
fn attest_after_window_fails() {
    let (w, id) = filed();
    challenge(&w, id);
    w.advance_secs(301);
    assert_eq!(
        w.bond.try_attest(
            &w.observer,
            &id,
            &true,
            &BytesN::from_array(&w.env, &[5; 32])
        ),
        Err(Ok(Error::AttestationWindowClosed))
    );
}
#[test]
fn challenge_sets_frozen_deadline_and_cannot_repeat() {
    let (w, id) = filed();
    let before = w.bond.claim(&id);
    challenge(&w, id);
    let after = w.bond.claim(&id);
    assert_eq!(after.status, ClaimStatus::Challenged);
    assert_eq!(after.attestation_deadline, after.filed_at + 300);
    assert_eq!(
        after.counter_evidence_hash,
        Some(BytesN::from_array(&w.env, &[4; 32]))
    );
    assert_eq!(after.claim_bond, before.claim_bond);
    assert_eq!(
        w.bond
            .try_challenge(&id, &BytesN::from_array(&w.env, &[4; 32])),
        Err(Ok(Error::ClaimNotOpen))
    );
    w.assert_invariants();
}
#[test]
fn attest_requires_auth_and_active_observer_and_challenged_status() {
    use soroban_sdk::{Address, testutils::Address as _};
    let (w, id) = filed();
    let hash = BytesN::from_array(&w.env, &[5; 32]);
    assert_eq!(
        w.bond.try_attest(&w.observer, &id, &true, &hash),
        Err(Ok(Error::ClaimNotOpen))
    );
    challenge(&w, id);
    assert_eq!(
        w.bond
            .try_attest(&Address::generate(&w.env), &id, &true, &hash),
        Err(Ok(Error::UnknownObserver))
    );
    w.env.mock_auths(&[]);
    assert!(w.bond.try_attest(&w.observer, &id, &true, &hash).is_err());
    assert_eq!(w.bond.claim(&id).votes_for, 0);
    w.assert_invariants();
}
#[test]
fn filing_observer_can_vote_at_exact_attestation_deadline() {
    let (w, id) = filed();
    challenge(&w, id);
    let deadline = w.bond.claim(&id).attestation_deadline;
    w.env.ledger().with_mut(|l| l.timestamp = deadline);
    w.bond.attest(
        &w.observer,
        &id,
        &false,
        &BytesN::from_array(&w.env, &[5; 32]),
    );
    assert_eq!(w.bond.claim(&id).votes_against, 1);
    w.assert_invariants();
}

#[test]
fn rotated_observer_votes_remain_bounded_without_erasing_history() {
    use soroban_sdk::{Address, Vec, testutils::Address as _};
    let (w, id) = filed();
    challenge(&w, id);
    let votes: Vec<(Address, bool)> =
        Vec::from_iter(&w.env, (0..32).map(|_| (Address::generate(&w.env), false)));
    w.env.as_contract(&w.bond.address, || {
        w.env
            .storage()
            .persistent()
            .set(&crate::DataKey::ClaimVotes(id), &votes);
        let mut c = crate::claims::claim(&w.env, id).unwrap();
        c.votes_against = 32;
        crate::claims::put_claim(&w.env, &c);
    });
    assert_eq!(
        w.bond.try_attest(
            &w.observer,
            &id,
            &true,
            &BytesN::from_array(&w.env, &[5; 32])
        ),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(w.bond.claim_votes(&id), votes);
    assert_eq!(w.bond.claim(&id).votes_for, 0);
    w.assert_invariants();
}
