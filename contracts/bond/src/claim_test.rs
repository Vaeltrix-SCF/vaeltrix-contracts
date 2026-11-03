//! VX-305 named claim filing tests (guide §9.2).
#![allow(clippy::unwrap_used, clippy::arithmetic_side_effects)]
use crate::testutils::World;
use soroban_sdk::{
    Address, BytesN,
    testutils::{Address as _, Ledger},
};
use vaeltrix_types::{ClaimStatus, Error, PaymentRef};
fn fixture() -> (World<'static>, PaymentRef) {
    let w = World::new();
    let id = w.with_commitment(10_000_000_000);
    let t0 = w.env.ledger().timestamp() * 1000;
    let p = w.payment(id, 1_000_000_000, t0, Some(t0 + 131_000));
    w.advance_secs(132);
    (w, p)
}
fn file(w: &World<'_>, p: &PaymentRef) -> u64 {
    w.bond
        .file_claim(&w.client, &w.client, p, &Some(w.observer.clone()), &None)
}
#[test]
fn file_claim_path_a_late_completion() {
    let (w, p) = fixture();
    let balance = w.usdc_token.balance(&w.client);
    let id = file(&w, &p);
    let c = w.bond.claim(&id);
    assert_eq!(c.status, ClaimStatus::Filed);
    assert_eq!(c.penalty_amount, 50_000_000);
    assert_eq!(c.reserved_amount, 50_000_000);
    assert_eq!(c.claim_bond, 10_000_000);
    assert_eq!(w.usdc_token.balance(&w.client), balance - c.claim_bond);
    assert_eq!(w.bond.claim_by_payment(&p.payment_id), Some(id));
    w.assert_invariants();
}
#[test]
fn file_claim_path_a_no_completion_after_deadline() {
    let (w, mut p) = fixture();
    p.t1_ms = None;
    file(&w, &p);
    w.assert_invariants();
}
#[test]
fn file_claim_rejects_pending_payment() {
    let (w, mut p) = fixture();
    p.t1_ms = None;
    w.env
        .ledger()
        .with_mut(|l| l.timestamp = p.t0_ms / 1000 + 130);
    assert_eq!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
        Err(Ok(Error::NotInBreach))
    );
}
#[test]
fn file_claim_rejects_on_time_payment() {
    let (w, mut p) = fixture();
    p.t1_ms = Some(p.t0_ms + 130_000);
    assert_eq!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
        Err(Ok(Error::NotInBreach))
    );
}
#[test]
fn file_claim_rejects_duplicate_payment_id() {
    let (w, p) = fixture();
    file(&w, &p);
    assert_eq!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
        Err(Ok(Error::DuplicateClaim))
    );
    w.assert_invariants();
}
#[test]
fn file_claim_rejects_payment_id_mismatch() {
    let (w, mut p) = fixture();
    p.payment_id = BytesN::from_array(&w.env, &[0; 32]);
    assert_eq!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
        Err(Ok(Error::PaymentIdMismatch))
    );
}
#[test]
fn file_claim_rejects_out_of_scope_amount() {
    for amount in [0, 100_000_000_001] {
        let (w, mut p) = fixture();
        p.amount = amount;
        assert_eq!(
            w.bond
                .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
            Err(Ok(Error::OutOfScope))
        );
    }
}
#[test]
fn file_claim_rejects_not_covered_t0() {
    for mode in 0..3 {
        let (w, mut p) = fixture();
        if mode == 0 {
            p.t0_ms = 0;
        } else if mode == 1 {
            w.bond.pause(&p.commitment_id);
            p.t0_ms = w.env.ledger().timestamp() * 1000;
        } else {
            w.bond.request_exit(&p.commitment_id);
            p.t0_ms = w.env.ledger().timestamp() * 1000;
        }
        assert_eq!(
            w.bond
                .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
            Err(Ok(Error::NotCovered))
        );
    }
}
#[test]
fn file_claim_rejects_after_claim_window() {
    let (w, p) = fixture();
    w.advance_secs(600);
    assert_eq!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
        Err(Ok(Error::ClaimWindowClosed))
    );
}
#[test]
fn file_claim_rejects_unknown_observer() {
    let (w, p) = fixture();
    assert_eq!(
        w.bond.try_file_claim(
            &w.client,
            &w.client,
            &p,
            &Some(Address::generate(&w.env)),
            &None
        ),
        Err(Ok(Error::UnknownObserver))
    );
}
#[test]
fn file_claim_requires_exactly_one_path() {
    let (w, p) = fixture();
    for (o, r) in [
        (None, None),
        (Some(w.observer.clone()), Some(w.receipt(&p))),
        (None, Some(w.receipt(&p))),
    ] {
        assert_eq!(
            w.bond.try_file_claim(&w.client, &w.client, &p, &o, &r),
            Err(Ok(Error::InvalidEvidence))
        );
    }
}
#[test]
fn file_claim_partial_reserve_records_shortfall() {
    let (w, p) = fixture();
    w.env.as_contract(&w.bond.address, || {
        let mut c = crate::storage::commitment(&w.env, p.commitment_id).unwrap();
        c.stake_total = 1;
        crate::storage::put_commitment(&w.env, &c);
    });
    let id = file(&w, &p);
    let c = w.bond.claim(&id);
    assert_eq!(c.reserved_amount, 1);
    assert_eq!(c.shortfall, 49_999_999);
    w.assert_invariants();
}

#[test]
fn filing_requires_claimant_and_observer_authorizations_before_state_changes() {
    use soroban_sdk::{
        IntoVal,
        testutils::{MockAuth, MockAuthInvoke},
    };
    let (w, p) = fixture();
    w.env.mock_auths(&[]);
    assert!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None)
            .is_err()
    );
    let invoke = MockAuthInvoke {
        contract: &w.bond.address,
        fn_name: "file_claim",
        args: (
            w.client.clone(),
            w.client.clone(),
            p.clone(),
            Some(w.observer.clone()),
            Option::<vaeltrix_types::CompletionReceipt>::None,
        )
            .into_val(&w.env),
        sub_invokes: &[],
    };
    w.env.mock_auths(&[MockAuth {
        address: &w.client,
        invoke: &invoke,
    }]);
    assert!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None)
            .is_err()
    );
    assert_eq!(w.bond.claim_by_payment(&p.payment_id), None);
    w.assert_invariants();
}
#[test]
fn filing_checks_pause_bound_and_invalid_timeline() {
    for mode in 0..2 {
        let (w, mut p) = fixture();
        if mode == 0 {
            p.pause_ms = vaeltrix_types::MAX_PAUSE_MS + 1;
        } else {
            p.t1_ms = Some(p.t0_ms - 1);
        }
        assert_eq!(
            w.bond
                .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None),
            Err(Ok(Error::InvalidEvidence))
        );
        w.assert_invariants();
    }
}
#[test]
fn filing_accepts_last_claim_window_instant_and_exiting_suspended_provider() {
    let (w, p) = fixture();
    w.bond.request_exit(&p.commitment_id);
    w.registry.suspend_provider(
        &w.bond.commitment(&p.commitment_id).provider_id,
        &soroban_sdk::Symbol::new(&w.env, "test"),
    );
    w.env
        .ledger()
        .with_mut(|l| l.timestamp = p.t0_ms / 1000 + 730);
    file(&w, &p);
    w.assert_invariants();
}
#[test]
fn delegated_filing_charges_observer_and_emits_claim_last() {
    use soroban_sdk::testutils::Events;
    let (w, p) = fixture();
    let before = w.usdc_token.balance(&w.observer);
    let id = w
        .bond
        .file_claim(&w.observer, &w.client, &p, &Some(w.observer.clone()), &None);
    let emitted = w.env.events().all();
    let c = w.bond.claim(&id);
    assert_eq!(c.bond_payer, w.observer);
    assert_eq!(w.usdc_token.balance(&w.observer), before - c.claim_bond);
    let event = emitted.events().last().unwrap();
    let soroban_sdk::xdr::ContractEventBody::V0(body) = &event.body;
    assert_eq!(
        body.topics[0],
        soroban_sdk::xdr::ScVal::Symbol(soroban_sdk::xdr::ScSymbol(
            "claim_new".try_into().unwrap()
        ))
    );
    w.assert_invariants();
}
#[test]
fn bond_transfer_failure_rolls_back_claim_and_reservation() {
    let (w, p) = fixture();
    w.usdc_token
        .burn(&w.client, &w.usdc_token.balance(&w.client));
    assert!(
        w.bond
            .try_file_claim(&w.client, &w.client, &p, &Some(w.observer.clone()), &None)
            .is_err()
    );
    assert_eq!(w.bond.claim_by_payment(&p.payment_id), None);
    w.assert_invariants();
}
