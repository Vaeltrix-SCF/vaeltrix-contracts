//! Normative scoreboard tests (VX-401, guide §9.2).
#![allow(clippy::unwrap_used, clippy::arithmetic_side_effects)]
use crate::{Scoreboard, ScoreboardClient};
use soroban_sdk::{
    Address, BytesN, Env, IntoVal, Vec, contract, contractimpl,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
};
use vaeltrix_types::{Claim, ClaimOutcome, Error, Params, PeriodStats};
fn params(env: &Env) -> Params {
    Params {
        timelock_secs: 60,
        challenge_window_secs: 180,
        attestation_window_secs: 300,
        exit_extra_secs: 120,
        quorum: 1,
        min_claim_bond: 10_000_000,
        claim_bond_bps: 1_000,
        rejected_bond_provider_bps: 5_000,
        stake_floor: 1_000_000_000,
        stake_k: 3,
        max_stake_per_commitment: 100_000_000_000,
        allowed_stake_assets: Vec::from_array(env, [Address::generate(env)]),
    }
}

struct World {
    env: Env,
    id: Address,
    admin: Address,
    registry: Address,
    observer: Address,
    bond: Address,
}
impl World {
    fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let registry = env.register(vaeltrix_registry::Registry, (admin.clone(), params(&env)));
        let r = vaeltrix_registry::RegistryClient::new(&env, &registry);
        let observer = Address::generate(&env);
        let a = r.propose(&vaeltrix_registry::ActionKind::AddObserver(
            observer.clone(),
            BytesN::from_array(&env, &[1; 32]),
        ));
        env.ledger().with_mut(|l| l.timestamp = 86400);
        r.execute(&a);
        let id = env.register(Scoreboard, (admin.clone(), registry.clone()));
        let bond = env.register(BondCaller, ());
        Self {
            env,
            id,
            admin,
            registry,
            observer,
            bond,
        }
    }
    fn anchor(&self, start: u64, stats: &PeriodStats) {
        ScoreboardClient::new(&self.env, &self.id).anchor_batch(
            &self.observer,
            &1,
            &BytesN::from_array(&self.env, &[2; 32]),
            &start,
            &(start + 86400),
            &BytesN::from_array(&self.env, &[0; 32]),
            stats,
            &BytesN::from_array(&self.env, &[3; 32]),
        );
    }
    fn claim(&self) -> Claim {
        use vaeltrix_types::{BreachKind, ClaimStatus, PaymentRef};
        Claim {
            id: 1,
            commitment_id: 1,
            provider_id: BytesN::from_array(&self.env, &[2; 32]),
            payment: PaymentRef {
                payment_id: BytesN::from_array(&self.env, &[4; 32]),
                sep31_tx_id: soroban_sdk::String::from_str(&self.env, "tx"),
                commitment_id: 1,
                amount: 100,
                t0_ms: 0,
                t1_ms: Some(2),
                pause_ms: 0,
                evidence_hash: BytesN::from_array(&self.env, &[5; 32]),
            },
            breach: BreachKind::LateCompletion,
            claimant: self.observer.clone(),
            beneficiary: self.admin.clone(),
            bond_payer: self.observer.clone(),
            filed_by_observer: Some(self.observer.clone()),
            penalty_amount: 100,
            reserved_amount: 90,
            shortfall: 10,
            claim_bond: 1,
            status: ClaimStatus::Paid,
            filed_at: 1,
            challenge_deadline: 2,
            attestation_deadline: 0,
            counter_evidence_hash: None,
            votes_for: 0,
            votes_against: 0,
        }
    }
}
#[contract]
struct BondCaller;
#[contractimpl]
impl BondCaller {
    pub fn record(env: Env, scoreboard: Address, claim: Claim, outcome: ClaimOutcome) {
        vaeltrix_types::ScoreboardClient::new(&env, &scoreboard)
            .record_claim_outcome(&claim, &outcome);
    }
}
#[test]
fn set_bond_only_once() {
    let w = World::new();
    let e = &w.env;
    let c = ScoreboardClient::new(e, &w.id);
    assert_eq!(c.bond(), None);
    let auth = MockAuthInvoke {
        contract: &w.id,
        fn_name: "set_bond",
        args: (w.bond.clone(),).into_val(e),
        sub_invokes: &[],
    };
    e.mock_auths(&[MockAuth {
        address: &w.observer,
        invoke: &auth,
    }]);
    assert!(c.try_set_bond(&w.bond).is_err());
    e.mock_auths(&[MockAuth {
        address: &w.admin,
        invoke: &auth,
    }]);
    c.set_bond(&w.bond);
    assert_eq!(c.bond(), Some(w.bond.clone()));
    e.mock_auths(&[MockAuth {
        address: &w.admin,
        invoke: &auth,
    }]);
    assert_eq!(c.try_set_bond(&w.bond), Err(Ok(Error::BondAlreadySet)));
}
#[test]
fn anchor_batch_requires_active_observer() {
    let w = World::new();
    let e = &w.env;
    let c = ScoreboardClient::new(e, &w.id);
    let p = BytesN::from_array(e, &[2; 32]);
    let root = BytesN::from_array(e, &[0; 32]);
    let stats = PeriodStats::default();
    let attestation = BytesN::from_array(e, &[3; 32]);
    let args = (
        w.observer.clone(),
        1_u64,
        p.clone(),
        0_u64,
        86400_u64,
        root.clone(),
        stats.clone(),
        attestation.clone(),
    )
        .into_val(e);
    let wrong = Address::generate(e);
    let auth = MockAuthInvoke {
        contract: &w.id,
        fn_name: "anchor_batch",
        args,
        sub_invokes: &[],
    };
    e.mock_auths(&[MockAuth {
        address: &wrong,
        invoke: &auth,
    }]);
    assert!(
        c.try_anchor_batch(&w.observer, &1, &p, &0, &86400, &root, &stats, &attestation)
            .is_err()
    );
    e.mock_auths(&[MockAuth {
        address: &w.observer,
        invoke: &auth,
    }]);
    w.anchor(0, &stats);
    e.mock_all_auths();
    let r = vaeltrix_registry::RegistryClient::new(e, &w.registry);
    let a = r.propose(&vaeltrix_registry::ActionKind::RemoveObserver(
        w.observer.clone(),
    ));
    e.ledger().with_mut(|l| l.timestamp = 172800);
    r.execute(&a);
    assert_eq!(
        c.try_anchor_batch(
            &w.observer,
            &1,
            &p,
            &86400,
            &172800,
            &root,
            &stats,
            &attestation
        ),
        Err(Ok(Error::UnknownObserver))
    );
}
fn bad_period(start: u64, end: u64) {
    let w = World::new();
    let e = &w.env;
    let z = BytesN::from_array(e, &[0; 32]);
    assert_eq!(
        ScoreboardClient::new(e, &w.id).try_anchor_batch(
            &w.observer,
            &1,
            &z,
            &start,
            &end,
            &z,
            &PeriodStats::default(),
            &z
        ),
        Err(Ok(Error::InvalidPeriod))
    );
}
#[test]
fn anchor_batch_rejects_misaligned_period() {
    bad_period(1, 86401);
    bad_period(0, 86399);
}
#[test]
fn anchor_batch_rejects_future_period() {
    bad_period(86400, 172800);
}
#[test]
fn anchor_batch_rejects_duplicate() {
    let w = World::new();
    w.anchor(0, &PeriodStats::default());
    let e = &w.env;
    let z = BytesN::from_array(e, &[0; 32]);
    assert_eq!(
        ScoreboardClient::new(e, &w.id).try_anchor_batch(
            &w.observer,
            &1,
            &z,
            &0,
            &86400,
            &z,
            &PeriodStats::default(),
            &z
        ),
        Err(Ok(Error::BatchExists))
    );
}
#[test]
fn anchor_batch_rejects_inconsistent_counts() {
    let w = World::new();
    let e = &w.env;
    let z = BytesN::from_array(e, &[0; 32]);
    for s in [
        PeriodStats {
            payments: 1,
            ..Default::default()
        },
        PeriodStats {
            p50_ms: 2,
            p95_ms: 1,
            ..Default::default()
        },
        PeriodStats {
            p95_ms: 2,
            p99_ms: 1,
            ..Default::default()
        },
        PeriodStats {
            volume: -1,
            ..Default::default()
        },
        PeriodStats {
            penalties_paid: -1,
            ..Default::default()
        },
    ] {
        assert_eq!(
            ScoreboardClient::new(e, &w.id).try_anchor_batch(
                &w.observer,
                &1,
                &z,
                &0,
                &86400,
                &z,
                &s,
                &z
            ),
            Err(Ok(Error::InvalidParams))
        );
    }
}
#[test]
fn record_claim_outcome_rejects_non_bond_caller() {
    let w = World::new();
    let e = &w.env;
    let c = ScoreboardClient::new(e, &w.id);
    c.set_bond(&w.bond);
    e.mock_auths(&[]);
    assert!(
        c.try_record_claim_outcome(&w.claim(), &ClaimOutcome::Upheld)
            .is_err()
    );
    let other = e.register(BondCaller, ());
    assert!(
        BondCallerClient::new(e, &other)
            .try_record(&w.id, &w.claim(), &ClaimOutcome::Upheld)
            .is_err()
    );
    BondCallerClient::new(e, &w.bond).record(&w.id, &w.claim(), &ClaimOutcome::Upheld);
    assert_eq!(c.lifetime(&w.claim().provider_id).penalties_paid, 90);
}
#[test]
fn lifetime_accumulates_batches_and_outcomes() {
    let w = World::new();
    let e = &w.env;
    let c = ScoreboardClient::new(e, &w.id);
    c.set_bond(&w.bond);
    let s = PeriodStats {
        payments: 3,
        on_time: 1,
        breaches: 1,
        carved_out: 1,
        volume: 1000,
        penalties_paid: 999,
        ..Default::default()
    };
    w.anchor(0, &s);
    e.ledger().with_mut(|l| l.timestamp = 172800);
    w.anchor(86400, &s);
    let claim = w.claim();
    assert_eq!(c.lifetime(&claim.provider_id).penalties_paid, 0);
    e.mock_auths(&[]);
    for outcome in [
        ClaimOutcome::Upheld,
        ClaimOutcome::Rejected,
        ClaimOutcome::Expired,
    ] {
        BondCallerClient::new(e, &w.bond).record(&w.id, &claim, &outcome);
    }
    let v = c.lifetime(&claim.provider_id);
    assert_eq!(
        (v.payments, v.on_time, v.breaches, v.carved_out, v.volume),
        (6, 2, 2, 2, 2000)
    );
    assert_eq!(
        (
            v.penalties_paid,
            v.shortfall_total,
            v.claims_upheld,
            v.claims_rejected,
            v.claims_expired
        ),
        (90, 10, 1, 1, 1)
    );
    assert_eq!(c.stats(&1, &0), s);
    assert_eq!(c.batch(&1, &1).stats, s);
}
#[test]
fn periods_list_capped_at_90() {
    let w = World::new();
    let e = &w.env;
    e.ledger().with_mut(|l| l.timestamp = 92 * 86400);
    for day in 0..92 {
        // Separate daily transactions each receive the normal network budget.
        e.cost_estimate().budget().reset_default();
        w.anchor(day * 86400, &PeriodStats::default());
    }
    let p = ScoreboardClient::new(e, &w.id).periods(&1);
    assert_eq!(p.len(), 90);
    assert_eq!(p.get(0), Some(2));
    assert_eq!(p.get(89), Some(91));
}

#[test]
fn scoreboard_ttl_and_overflow_preserve_accounting() {
    use soroban_sdk::testutils::storage::{Instance as _, Persistent as _};
    use vaeltrix_types::{INSTANCE_BUMP, LifetimeStats, PERSIST_BUMP, PERSIST_THRESHOLD};
    let w = World::new();
    let e = &w.env;
    e.ledger()
        .with_mut(|l| l.max_entry_ttl = PERSIST_BUMP + 100);
    w.anchor(0, &PeriodStats::default());
    let p = BytesN::from_array(e, &[2; 32]);
    let keys = [
        crate::DataKey::Batch(1, 0),
        crate::DataKey::BatchPeriods(1),
        crate::DataKey::Lifetime(p.clone()),
        crate::DataKey::CommitmentProvider(1),
    ];
    e.as_contract(&w.id, || {
        assert_eq!(e.storage().instance().get_ttl(), INSTANCE_BUMP);
        for key in &keys {
            assert_eq!(e.storage().persistent().get_ttl(key), PERSIST_BUMP);
        }
    });
    let c = ScoreboardClient::new(e, &w.id);
    for _ in 0..4 {
        e.ledger()
            .with_mut(|l| l.sequence_number += PERSIST_BUMP / 4 - PERSIST_THRESHOLD / 4 + 1);
        c.bond();
    }
    e.as_contract(&w.id, || {
        assert!(e.storage().persistent().get_ttl(&keys[0]) < PERSIST_THRESHOLD)
    });
    c.batch(&1, &0);
    c.periods(&1);
    c.lifetime(&p);
    e.as_contract(&w.id, || {
        for key in &keys[..3] {
            assert_eq!(e.storage().persistent().get_ttl(key), PERSIST_BUMP);
        }
    });
    e.as_contract(&w.id, || {
        e.storage().persistent().set(
            &keys[2],
            &LifetimeStats {
                volume: i128::MAX,
                ..Default::default()
            },
        )
    });
    e.ledger().with_mut(|l| l.timestamp = 172800);
    let zero = BytesN::from_array(e, &[0; 32]);
    let stats = PeriodStats {
        volume: 1,
        ..Default::default()
    };
    assert_eq!(
        c.try_anchor_batch(&w.observer, &1, &p, &86400, &172800, &zero, &stats, &zero),
        Err(Ok(Error::ArithmeticOverflow))
    );
    assert_eq!(c.lifetime(&p).volume, i128::MAX);
    assert_eq!(c.periods(&1), Vec::from_array(e, [0_u64]));
    assert_eq!(c.try_batch(&1, &1), Err(Ok(Error::NothingPending)));
}
