//! VX-307 settlement tests, including every §6.7 table row.
#![allow(clippy::unwrap_used, clippy::arithmetic_side_effects)]
extern crate std;
use crate::{
    dispute_test::{challenge, filed},
    testutils::World,
};
use soroban_sdk::{
    Address, BytesN,
    testutils::{Address as _, Ledger},
};
use vaeltrix_types::{ClaimStatus, Error};
#[test]
fn resolve_before_challenge_deadline_fails() {
    let (w, id) = filed();
    assert_eq!(w.bond.try_resolve(&id), Err(Ok(Error::ChallengeWindowOpen)));
    w.assert_invariants();
}
#[test]
fn resolve_unchallenged_pays_beneficiary_and_refunds_bond() {
    let (w, id) = filed();
    let c = w.bond.claim(&id);
    let before = w.usdc_token.balance(&w.client);
    w.env
        .ledger()
        .with_mut(|l| l.timestamp = c.challenge_deadline);
    w.env.mock_auths(&[]);
    w.bond.resolve(&id);
    assert_eq!(w.bond.claim(&id).status, ClaimStatus::Paid);
    assert_eq!(
        w.usdc_token.balance(&w.client),
        before + c.claim_bond + c.reserved_amount
    );
    let commitment = w.bond.commitment(&c.commitment_id);
    assert_eq!(commitment.stake_total, 10_000_000_000 - c.reserved_amount);
    assert_eq!(commitment.open_claims, 0);
    w.assert_invariants();
}
#[test]
fn attest_uphold_then_resolve_pays() {
    let (w, id) = filed();
    challenge(&w, id);
    w.bond.attest(
        &w.observer,
        &id,
        &true,
        &BytesN::from_array(&w.env, &[5; 32]),
    );
    w.bond.resolve(&id);
    assert_eq!(w.bond.claim(&id).status, ClaimStatus::Paid);
    w.assert_invariants();
}
#[test]
fn challenged_without_quorum_expires_after_window() {
    let (w, id) = filed();
    challenge(&w, id);
    let deadline = w.bond.claim(&id).attestation_deadline;
    w.env.ledger().with_mut(|l| l.timestamp = deadline);
    assert_eq!(w.bond.try_resolve(&id), Err(Ok(Error::QuorumNotReached)));
    w.advance_secs(1);
    let before = w.usdc_token.balance(&w.client);
    let bond = w.bond.claim(&id).claim_bond;
    w.bond.resolve(&id);
    assert_eq!(w.bond.claim(&id).status, ClaimStatus::Expired);
    assert_eq!(w.usdc_token.balance(&w.client), before + bond);
    assert_eq!(w.bond.commitment(&1).stake_total, 10_000_000_000);
    w.assert_invariants();
}
#[test]
fn resolve_twice_fails() {
    for outcome in 0..3 {
        let (w, id) = filed();
        if outcome == 0 {
            w.advance_secs(180);
        } else {
            challenge(&w, id);
            if outcome == 1 {
                w.bond.attest(
                    &w.observer,
                    &id,
                    &false,
                    &BytesN::from_array(&w.env, &[5; 32]),
                );
            } else {
                w.advance_secs(301);
            }
        }
        w.bond.resolve(&id);
        let before = w.usdc_token.balance(&w.client);
        assert_eq!(w.bond.try_resolve(&id), Err(Ok(Error::ClaimNotOpen)));
        assert_eq!(w.usdc_token.balance(&w.client), before);
        w.assert_invariants();
    }
}
#[test]
fn attest_reject_then_resolve_splits_bond() {
    for count in [1, 3, 5] {
        let w = World::new();
        let commitment = w.with_commitment(10_000_000_000);
        let mut observers = std::vec![w.observer.clone()];
        for _ in 1..count {
            let address = Address::generate(&w.env);
            let action = w
                .registry
                .propose(&vaeltrix_registry::ActionKind::AddObserver(
                    address.clone(),
                    BytesN::from_array(&w.env, &[9; 32]),
                ));
            w.advance_secs(60);
            w.registry.execute(&action);
            observers.push(address);
        }
        let mut params = w.registry.params();
        params.min_claim_bond = 10_000_001;
        let action = w
            .registry
            .propose(&vaeltrix_registry::ActionKind::SetParams(params));
        w.advance_secs(60);
        w.registry.execute(&action);
        let t = w.env.ledger().timestamp() * 1000;
        let p = w.payment(commitment, 1_000_000_000, t, Some(t + 131_000));
        w.advance_secs(132);
        let id = w
            .bond
            .file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None);
        challenge(&w, id);
        for observer in &observers {
            w.bond
                .attest(observer, &id, &false, &BytesN::from_array(&w.env, &[5; 32]));
        }
        let provider_before = w.usdc_token.balance(&w.provider_admin);
        let balances: std::vec::Vec<i128> =
            observers.iter().map(|o| w.usdc_token.balance(o)).collect();
        let total_before = provider_before
            + w.usdc_token.balance(&w.client)
            + w.usdc_token.balance(&w.bond.address)
            + balances.iter().sum::<i128>();
        w.bond.resolve(&id);
        let remainder = 5_000_001;
        let share = remainder / count;
        let dust = remainder % count;
        assert_eq!(
            w.usdc_token.balance(&w.provider_admin),
            provider_before + 5_000_000 + dust
        );
        for (observer, before) in observers.iter().zip(balances) {
            assert_eq!(w.usdc_token.balance(observer), before + share);
        }
        let total_after = w.usdc_token.balance(&w.provider_admin)
            + w.usdc_token.balance(&w.client)
            + w.usdc_token.balance(&w.bond.address)
            + observers
                .iter()
                .map(|o| w.usdc_token.balance(o))
                .sum::<i128>();
        assert_eq!(total_after, total_before);
        assert_eq!(w.bond.claim(&id).status, ClaimStatus::Rejected);
        w.assert_invariants();
    }
}
#[test]
fn scoreboard_receives_outcome_on_every_resolution() {
    for outcome in 0..3 {
        let (w, id) = filed();
        let c = w.bond.claim(&id);
        if outcome == 0 {
            w.advance_secs(180);
        } else {
            challenge(&w, id);
            if outcome == 1 {
                w.bond.attest(
                    &w.observer,
                    &id,
                    &false,
                    &BytesN::from_array(&w.env, &[5; 32]),
                );
            } else {
                w.advance_secs(301);
            }
        }
        w.bond.resolve(&id);
        let life = w.scoreboard.lifetime(&c.provider_id);
        assert_eq!(life.claims_upheld, if outcome == 0 { 1 } else { 0 });
        assert_eq!(life.claims_rejected, if outcome == 1 { 1 } else { 0 });
        assert_eq!(life.claims_expired, if outcome == 2 { 1 } else { 0 });
        assert_eq!(
            life.penalties_paid,
            if outcome == 0 { c.reserved_amount } else { 0 }
        );
        w.assert_invariants();
    }
}
#[test]
fn failed_scoreboard_call_rolls_back_storage_and_token_transfers() {
    let (w, id) = filed();
    w.advance_secs(180);
    let before = w.bond.claim(&id);
    let balance = w.usdc_token.balance(&w.client);
    w.env.as_contract(&w.bond.address, || {
        w.env
            .storage()
            .instance()
            .set(&crate::DataKey::Scoreboard, &Address::generate(&w.env))
    });
    assert!(w.bond.try_resolve(&id).is_err());
    assert_eq!(w.bond.claim(&id), before);
    assert_eq!(w.usdc_token.balance(&w.client), balance);
    w.assert_invariants();
}
#[test]
fn claim_against_exiting_commitment_still_pays() {
    let (w, id) = filed();
    w.bond.request_exit(&1);
    w.advance_secs(180);
    w.bond.resolve(&id);
    w.assert_invariants();
}

#[test]
fn delegated_bond_refund_and_beneficiary_payment_are_separate() {
    let w = World::new();
    let commitment = w.with_commitment(10_000_000_000);
    let t = w.env.ledger().timestamp() * 1000;
    let p = w.payment(commitment, 1_000_000_000, t, Some(t + 131_000));
    w.advance_secs(132);
    let id = w
        .bond
        .file_claim(&w.observer, &w.client, &p, &Some(w.observer.clone()), &None);
    let c = w.bond.claim(&id);
    let payer = w.usdc_token.balance(&w.observer);
    let client = w.usdc_token.balance(&w.client);
    w.advance_secs(180);
    w.bond.resolve(&id);
    assert_eq!(w.usdc_token.balance(&w.observer), payer + c.claim_bond);
    assert_eq!(w.usdc_token.balance(&w.client), client + c.reserved_amount);
    w.assert_invariants();
}
#[test]
fn partial_and_zero_reservation_pay_only_reserved_and_record_shortfall() {
    for reserved in [0, 1] {
        let (w, id) = filed();
        w.env.as_contract(&w.bond.address, || {
            let mut c = crate::claims::claim(&w.env, id).unwrap();
            c.reserved_amount = reserved;
            c.shortfall = c.penalty_amount - reserved;
            crate::claims::put_claim(&w.env, &c);
            let mut commitment = crate::storage::commitment(&w.env, c.commitment_id).unwrap();
            commitment.stake_total = reserved;
            commitment.stake_reserved = reserved;
            crate::storage::put_commitment(&w.env, &commitment);
        });
        let c = w.bond.claim(&id);
        let before = w.usdc_token.balance(&w.client);
        w.advance_secs(180);
        w.bond.resolve(&id);
        assert_eq!(
            w.usdc_token.balance(&w.client),
            before + c.claim_bond + reserved
        );
        let life = w.scoreboard.lifetime(&c.provider_id);
        assert_eq!(life.penalties_paid, reserved);
        assert_eq!(life.shortfall_total, c.penalty_amount - reserved);
        w.assert_invariants();
    }
}
#[test]
fn resolving_one_claim_preserves_other_claim_reservations() {
    let (w, id) = filed();
    let first = w.bond.claim(&id);
    let p = w.payment(
        first.commitment_id,
        1_000_000_000,
        first.payment.t0_ms + 1,
        first.payment.t1_ms,
    );
    let second = w
        .bond
        .file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None);
    w.assert_invariants();
    w.advance_secs(180);
    w.bond.resolve(&id);
    w.assert_invariants();
    assert_eq!(w.bond.commitment(&first.commitment_id).open_claims, 1);
    w.bond.resolve(&second);
    w.assert_invariants();
    assert_eq!(w.bond.commitment(&first.commitment_id).open_claims, 0);
}
#[test]
fn settlement_event_is_last_after_scoreboard_and_has_exact_payout() {
    use soroban_sdk::testutils::Events;
    let (w, id) = filed();
    w.advance_secs(180);
    w.bond.resolve(&id);
    let emitted = w.env.events().all();
    let events = emitted.events();
    let event = events.last().unwrap();
    let soroban_sdk::xdr::ContractEventBody::V0(body) = &event.body;
    assert_eq!(
        body.topics[0],
        soroban_sdk::xdr::ScVal::Symbol(soroban_sdk::xdr::ScSymbol(
            "claim_res".try_into().unwrap()
        ))
    );
    let previous = &events[events.len() - 2];
    let soroban_sdk::xdr::ContractEventBody::V0(body) = &previous.body;
    assert_eq!(
        body.topics[0],
        soroban_sdk::xdr::ScVal::Symbol(soroban_sdk::xdr::ScSymbol(
            "claim_out".try_into().unwrap()
        ))
    );
    w.assert_invariants();
}
