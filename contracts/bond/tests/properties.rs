//! VX-312: exercise full three-contract action sequences (guide §6.9, §9.3).
#![allow(clippy::arithmetic_side_effects, clippy::unwrap_used)]

#[path = "../src/testutils.rs"]
mod testutils;

use proptest::prelude::*;
use soroban_sdk::{
    Address, BytesN, Env, IntoVal, String as SorobanString, Symbol, TryFromVal, Val,
    Vec as SorobanVec,
    testutils::{Address as _, EnvTestConfig, Events},
    xdr::{ContractEventBody, ScVal},
};
use std::collections::BTreeSet;
use testutils::World;
use vaeltrix_bond::{Bond, BondClient, DataKey};
use vaeltrix_types::{Claim, ClaimStatus, Commitment, CommitmentStatus, MAX_PAUSE_MS};

const FUNDS: i128 = 1_000_000_000_000;
const STAKE: i128 = 10_000_000_000;

#[derive(Clone, Debug)]
enum Action {
    Commit(bool, i128),
    AddStake(usize, i128),
    Withdraw(usize, i128),
    Pause(usize),
    Resume(usize),
    RequestExit(usize),
    FinalizeExit(usize),
    File {
        commitment: usize,
        signed: bool,
        complete: bool,
        amount: i128,
        latency: u64,
    },
    Challenge(usize),
    Attest(usize, bool),
    Resolve(usize),
    AdvanceTime(u64),
}

fn action() -> impl Strategy<Value = Action> {
    let stake = || prop::sample::select(vec![0, 1, STAKE, STAKE * 2]);
    let index = || 0_usize..8;
    prop_oneof![
        1 => (any::<bool>(), stake()).prop_map(|(p, a)| Action::Commit(p, a)),
        1 => (index(), stake()).prop_map(|(i, a)| Action::AddStake(i, a)),
        1 => (index(), stake()).prop_map(|(i, a)| Action::Withdraw(i, a)),
        1 => index().prop_map(Action::Pause),
        1 => index().prop_map(Action::Resume),
        1 => index().prop_map(Action::RequestExit),
        1 => index().prop_map(Action::FinalizeExit),
        3 => (
            index(),
            any::<bool>(),
            any::<bool>(),
            prop::sample::select(vec![0, 10_000_000, 1_000_000_000, 100_000_000_001]),
            110_000_u64..=155_000,
        )
            .prop_map(|(commitment, signed, complete, amount, latency)| Action::File {
                commitment,
                signed,
                complete,
                amount,
                latency,
            }),
        1 => index().prop_map(Action::Challenge),
        1 => (index(), any::<bool>()).prop_map(|(i, vote)| Action::Attest(i, vote)),
        1 => index().prop_map(Action::Resolve),
        1 => (0_u64..=900).prop_map(Action::AdvanceTime),
    ]
}

struct Snapshot {
    commitments: Vec<Commitment>,
    claims: Vec<Claim>,
}

impl Snapshot {
    fn read(w: &World<'_>) -> Self {
        w.env.as_contract(&w.bond.address, || {
            let storage = w.env.storage();
            let next_commitment: u64 = storage.instance().get(&DataKey::NextCommitmentId).unwrap();
            let next_claim: u64 = storage.instance().get(&DataKey::NextClaimId).unwrap();
            Self {
                commitments: (1..next_commitment)
                    .map(|id| storage.persistent().get(&DataKey::Commitment(id)).unwrap())
                    .collect(),
                claims: (1..next_claim)
                    .map(|id| storage.persistent().get(&DataKey::Claim(id)).unwrap())
                    .collect(),
            }
        })
    }
}

struct Runner {
    world: World<'static>,
    providers: [(Address, BytesN<32>); 2],
    cooldown: u64,
}

impl Runner {
    fn new() -> Self {
        let w = World::with_env(Env::new_with_config(EnvTestConfig {
            capture_snapshot_at_drop: false,
        }));
        let first = w.with_provider();
        let second_admin = Address::generate(&w.env);
        let second = w.registry.register_provider(
            &second_admin,
            &SorobanString::from_str(&w.env, "second.example"),
            &SorobanVec::from_array(
                &w.env,
                [BytesN::from_array(
                    &w.env,
                    &w.provider_signer.verifying_key().to_bytes(),
                )],
            ),
            &SorobanString::from_str(&w.env, ""),
        );
        w.registry.verify_domain(&second);
        w.usdc_admin.mint(&second_admin, &FUNDS);
        let template = w.with_template_901();
        for provider in [&first, &second] {
            w.bond.commit(provider, &template, &w.usdc, &STAKE, &0, &0);
        }
        let t = w.registry.get_template(&template);
        let p = w.registry.params();
        let cooldown = (t.target_ms + t.grace_ms + MAX_PAUSE_MS).div_ceil(1000)
            + t.claim_window_secs
            + p.challenge_window_secs
            + p.attestation_window_secs
            + p.exit_extra_secs;
        w.advance_secs(160);
        w.assert_invariants();
        let providers = [(w.provider_admin.clone(), first), (second_admin, second)];
        Self {
            world: w,
            providers,
            cooldown,
        }
    }

    fn provider(&self, id: &BytesN<32>) -> &Address {
        &self
            .providers
            .iter()
            .find(|(_, provider)| provider == id)
            .unwrap()
            .0
    }

    fn check_invariants(&self, before: &Snapshot, after: &Snapshot) {
        let w = &self.world;
        w.assert_invariants(); // I1, I2, I7 and I8.
        for c in &after.commitments {
            assert!(c.exit_cooldown_secs >= self.cooldown, "I4: {}", c.id);
        }
        let mut payments = BTreeSet::new();
        assert!(
            after.claims.len() >= before.claims.len(),
            "I5: claim disappeared"
        );
        for (i, c) in after.claims.iter().enumerate() {
            assert!(
                payments.insert(c.payment.payment_id.to_array()),
                "I5: duplicate payment"
            );
            if let Some(previous) = before.claims.get(i) {
                assert_eq!(
                    previous.payment.payment_id, c.payment.payment_id,
                    "I5: changed payment"
                );
                assert!(
                    previous.status == c.status
                        || matches!(
                            (&previous.status, &c.status),
                            (
                                ClaimStatus::Filed,
                                ClaimStatus::Challenged | ClaimStatus::Paid
                            ) | (
                                ClaimStatus::Challenged,
                                ClaimStatus::Paid | ClaimStatus::Rejected | ClaimStatus::Expired
                            )
                        ),
                    "I9: {:?} -> {:?}",
                    previous.status,
                    c.status
                );
            } else {
                assert_eq!(c.status, ClaimStatus::Filed, "I9: new claim must be Filed");
            }
        }
    }

    fn apply(&self, action: &Action) -> bool {
        let w = &self.world;
        let before = Snapshot::read(w);
        let commitment = |i: usize| &before.commitments[i % before.commitments.len()];
        let claim_id = |i: usize| {
            if before.claims.is_empty() {
                1
            } else {
                before.claims[i % before.claims.len()].id
            }
        };
        let hash = BytesN::from_array(&w.env, &[4; 32]);
        let mut allowed = Vec::new();
        let mut resolved = None;
        let success = match *action {
            Action::Commit(second, amount) => matches!(
                w.bond.try_commit(
                    &self.providers[usize::from(second)].1,
                    &901,
                    &w.usdc,
                    &amount,
                    &0,
                    &0
                ),
                Ok(Ok(_))
            ),
            Action::AddStake(i, a) => {
                matches!(w.bond.try_add_stake(&commitment(i).id, &a), Ok(Ok(())))
            }
            Action::Withdraw(i, a) => {
                let c = commitment(i);
                allowed.push(self.provider(&c.provider_id).clone());
                matches!(w.bond.try_withdraw_excess(&c.id, &a), Ok(Ok(())))
            }
            Action::Pause(i) => matches!(w.bond.try_pause(&commitment(i).id), Ok(Ok(()))),
            Action::Resume(i) => matches!(w.bond.try_resume(&commitment(i).id), Ok(Ok(()))),
            Action::RequestExit(i) => {
                matches!(w.bond.try_request_exit(&commitment(i).id), Ok(Ok(())))
            }
            Action::FinalizeExit(i) => {
                let c = commitment(i);
                let ready = c.status == CommitmentStatus::Exiting
                    && c.open_claims == 0
                    && c.exit_requested_at
                        .is_some_and(|at| w.env.ledger().timestamp() >= at + c.exit_cooldown_secs);
                let result = matches!(w.bond.try_finalize_exit(&c.id), Ok(Ok(())));
                assert!(!result || ready, "I3: finalized before exit was ready");
                allowed.push(self.provider(&c.provider_id).clone());
                result
            }
            Action::File {
                commitment: i,
                signed,
                complete,
                amount,
                latency,
            } => {
                let t0 = w.env.ledger().timestamp().saturating_sub(160) * 1000;
                let p = w.payment(
                    commitment(i).id,
                    amount,
                    t0,
                    complete.then_some(t0 + latency),
                );
                let observer = (!signed).then(|| w.observer.clone());
                let receipt = signed.then(|| {
                    // No-completion Path B still carries a receipt; it must be rejected before signature verification.
                    let mut completed = p.clone();
                    completed.t1_ms = Some(t0 + latency);
                    w.receipt(&completed)
                });
                matches!(
                    w.bond
                        .try_file_claim(&w.client, &w.client, &p, &observer, &receipt),
                    Ok(Ok(_))
                )
            }
            Action::Challenge(i) => matches!(w.bond.try_challenge(&claim_id(i), &hash), Ok(Ok(()))),
            Action::Attest(i, vote) => matches!(
                w.bond.try_attest(&w.observer, &claim_id(i), &vote, &hash),
                Ok(Ok(()))
            ),
            Action::Resolve(i) => {
                let id = claim_id(i);
                let ok = matches!(w.bond.try_resolve(&id), Ok(Ok(())));
                if ok {
                    resolved = Some(id);
                }
                ok
            }
            Action::AdvanceTime(seconds) => {
                w.advance_secs(seconds);
                true
            }
        };
        let events = (!matches!(action, Action::AdvanceTime(_)))
            .then(|| w.env.events().all().filter_by_contract(&w.usdc));
        let after = Snapshot::read(w);
        if let Some(id) = resolved {
            let claim = after.claims.iter().find(|c| c.id == id).unwrap();
            match claim.status {
                ClaimStatus::Paid => {
                    allowed.push(claim.beneficiary.clone());
                    allowed.push(claim.bond_payer.clone());
                }
                ClaimStatus::Rejected => {
                    allowed.push(self.provider(&claim.provider_id).clone());
                    allowed.extend(
                        w.bond
                            .claim_votes(&id)
                            .iter()
                            .filter_map(|(address, uphold)| (!uphold).then_some(address)),
                    );
                }
                ClaimStatus::Expired => allowed.push(claim.bond_payer.clone()),
                _ => unreachable!("resolve left claim open"),
            }
        }
        if let Some(events) = events {
            let to_xdr = |address: &Address| {
                let val: Val = address.into_val(&w.env);
                ScVal::try_from_val(&w.env, &val).unwrap()
            };
            let bond = to_xdr(&w.bond.address);
            let transfer_val: Val = Symbol::new(&w.env, "transfer").into_val(&w.env);
            let transfer = ScVal::try_from_val(&w.env, &transfer_val).unwrap();
            for event in events.events() {
                let ContractEventBody::V0(body) = &event.body;
                let topics = body.topics.as_slice();
                if topics.first() == Some(&transfer) && topics.get(1) == Some(&bond) {
                    assert!(
                        success
                            && allowed
                                .iter()
                                .any(|address| topics.get(2) == Some(&to_xdr(address))),
                        "I6: unexpected outbound transfer after {action:?}: {topics:?}"
                    );
                }
            }
        }
        self.check_invariants(&before, &after);
        success
    }

    fn settle(self) {
        let before = Snapshot::read(&self.world);
        for (i, c) in before.commitments.iter().enumerate() {
            if matches!(
                c.status,
                CommitmentStatus::Active | CommitmentStatus::Paused
            ) {
                assert!(self.apply(&Action::RequestExit(i)));
            }
        }
        let snapshot = Snapshot::read(&self.world);
        let deadline = snapshot
            .commitments
            .iter()
            .filter_map(|c| c.exit_requested_at.map(|at| at + c.exit_cooldown_secs))
            .chain(
                snapshot
                    .claims
                    .iter()
                    .map(|c| c.challenge_deadline.max(c.attestation_deadline)),
            )
            .max()
            .unwrap_or_default();
        let now = self.world.env.ledger().timestamp();
        assert!(self.apply(&Action::AdvanceTime(deadline.saturating_sub(now) + 1)));
        for (i, c) in snapshot.claims.iter().enumerate() {
            if matches!(c.status, ClaimStatus::Filed | ClaimStatus::Challenged) {
                assert!(self.apply(&Action::Resolve(i)));
            }
        }
        for (i, c) in snapshot.commitments.iter().enumerate() {
            if c.status == CommitmentStatus::Exiting {
                assert!(self.apply(&Action::FinalizeExit(i)));
            }
        }
        let w = &self.world;
        assert_eq!(
            w.usdc_token.balance(&w.bond.address),
            0,
            "bond retained tokens"
        );
        let total = [
            &self.providers[0].0,
            &self.providers[1].0,
            &w.client,
            &w.observer,
        ]
        .into_iter()
        .map(|account| w.usdc_token.balance(account))
        .sum::<i128>();
        assert_eq!(total, 4 * FUNDS, "token conservation");
    }
}

proptest! {
    #[test]
    fn bond_action_sequences(actions in prop::collection::vec(action(), 1..=60)) {
        let runner = Runner::new();
        for action in &actions {
            runner.apply(action);
        }
        runner.settle();
    }
}

// Keep a deterministic rejection path so the reserve-release invariant is exercised
// even when a particular random run contains no rejected resolution.
#[test]
fn rejected_claim_releases_reserve_and_conserves_tokens() {
    let runner = Runner::new();
    for action in [
        Action::File {
            commitment: 0,
            signed: false,
            complete: true,
            amount: 1_000_000_000,
            latency: 131_000,
        },
        Action::Challenge(0),
        Action::Attest(0, false),
        Action::Resolve(0),
    ] {
        assert!(runner.apply(&action), "{action:?}");
    }
    runner.settle();
}
