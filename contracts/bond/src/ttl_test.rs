//! VX-309 keeper and claim retention tests (guide §8.3).
#![allow(clippy::unwrap_used)]

use crate::{DataKey, testutils::World};
use soroban_sdk::testutils::{Ledger, storage::Persistent};
use vaeltrix_types::{ClaimStatus, Error, PERSIST_BUMP, PERSIST_THRESHOLD, RESOLVED_CLAIM_BUMP};

fn file_with_initial_ttl(max_ttl: u32) -> (World<'static>, u64, u64) {
    let w = World::new();
    w.env.ledger().set_max_entry_ttl(max_ttl);
    let commitment = w.with_commitment(10_000_000_000);
    let t0 = w.env.ledger().timestamp().checked_mul(1000).unwrap();
    let payment = w.payment(
        commitment,
        1_000_000_000,
        t0,
        Some(t0.checked_add(131_000).unwrap()),
    );
    w.advance_secs(132);
    let claim = w.bond.file_claim(
        &w.client,
        &w.client,
        &payment,
        &Some(w.observer.clone()),
        &None,
    );
    w.env.ledger().set_max_entry_ttl(PERSIST_BUMP + 100);
    (w, commitment, claim)
}

fn ttl(w: &World<'_>, key: &DataKey) -> u32 {
    w.env.as_contract(&w.bond.address, || {
        w.env.storage().persistent().get_ttl(key)
    })
}

#[test]
fn ttl_extended_on_touch() {
    let (w, commitment, claim) = file_with_initial_ttl(PERSIST_THRESHOLD);
    w.advance_secs(5);
    let commitment_key = DataKey::Commitment(commitment);
    let claim_key = DataKey::Claim(claim);
    assert!(ttl(&w, &commitment_key) < PERSIST_THRESHOLD);
    assert!(ttl(&w, &claim_key) < PERSIST_THRESHOLD);

    w.env.mock_auths(&[]);
    w.bond.extend_commitment_ttl(&commitment);
    assert!(w.env.auths().is_empty());
    w.bond.extend_claim_ttl(&claim);
    assert!(w.env.auths().is_empty());
    assert_eq!(ttl(&w, &commitment_key), PERSIST_BUMP);
    assert_eq!(ttl(&w, &claim_key), PERSIST_BUMP);
    assert_eq!(
        w.bond.try_extend_commitment_ttl(&999),
        Err(Ok(Error::UnknownCommitment))
    );
    assert_eq!(
        w.bond.try_extend_claim_ttl(&999),
        Err(Ok(Error::UnknownClaim))
    );
}

#[test]
fn resolution_bumps_claim_once_and_preserves_payment_index() {
    let (w, _, id) = file_with_initial_ttl(RESOLVED_CLAIM_BUMP);
    let claim_key = DataKey::Claim(id);
    let claim = w.bond.claim(&id);
    let payment_key = DataKey::ClaimByPayment(claim.payment.payment_id.clone());
    w.advance_secs(180);
    let payment_ttl = ttl(&w, &payment_key);
    assert!(ttl(&w, &claim_key) < RESOLVED_CLAIM_BUMP);
    w.env.mock_auths(&[]);
    w.bond.resolve(&id);
    assert_eq!(ttl(&w, &claim_key), RESOLVED_CLAIM_BUMP);
    assert_eq!(ttl(&w, &payment_key), payment_ttl);
    assert_eq!(w.bond.claim_by_payment(&claim.payment.payment_id), Some(id));

    // Keep the contract instance live so we can check the terminal claim
    // after it falls below the threshold that would refresh an open claim.
    w.env.as_contract(&w.bond.address, || {
        w.env
            .storage()
            .instance()
            .extend_ttl(PERSIST_BUMP, PERSIST_BUMP)
    });
    let elapsed = RESOLVED_CLAIM_BUMP - PERSIST_THRESHOLD + 1;
    w.env.ledger().with_mut(|l| {
        l.sequence_number = l.sequence_number.checked_add(elapsed).unwrap();
    });
    let remaining = ttl(&w, &claim_key);
    assert!(remaining < PERSIST_THRESHOLD);
    assert_eq!(w.bond.claim(&id).status, ClaimStatus::Paid);
    w.bond.extend_claim_ttl(&id);
    assert_eq!(ttl(&w, &claim_key), remaining);
}

#[test]
fn resolution_does_not_shorten_an_existing_longer_claim_ttl() {
    let (w, _, id) = file_with_initial_ttl(PERSIST_BUMP + 100);
    let key = DataKey::Claim(id);
    w.advance_secs(180);
    let before = ttl(&w, &key);
    assert!(before > RESOLVED_CLAIM_BUMP);
    w.bond.resolve(&id);
    assert_eq!(ttl(&w, &key), before);
}
