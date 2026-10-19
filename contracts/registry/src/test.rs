//! Normative registry tests from guide §9.2 (VX-201).
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::arithmetic_side_effects
)]
extern crate std;
use crate::{ActionKind, DataKey, Registry, RegistryClient};
use soroban_sdk::{
    Address, Env, IntoVal, Vec,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
};
use vaeltrix_types::{Error, Params};

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
fn world(env: &Env) -> (Address, Address) {
    let admin = Address::generate(env);
    let id = env.register(Registry, (admin.clone(), params(env)));
    (id, admin)
}

#[test]
fn constructor_rejects_bad_params() {
    let env = Env::default();
    let valid = params(&env);
    let mut cases = std::vec::Vec::new();
    macro_rules! bad {
        ($field:ident, $value:expr) => {{
            let mut p = valid.clone();
            p.$field = $value;
            cases.push(p);
        }};
    }
    bad!(challenge_window_secs, 59);
    bad!(attestation_window_secs, 59);
    bad!(quorum, 0);
    bad!(quorum, 33);
    bad!(min_claim_bond, 0);
    bad!(min_claim_bond, -1);
    bad!(claim_bond_bps, 10_001);
    bad!(rejected_bond_provider_bps, 10_001);
    bad!(stake_floor, 0);
    bad!(stake_floor, -1);
    bad!(stake_k, 0);
    bad!(max_stake_per_commitment, -1);
    bad!(allowed_stake_assets, Vec::new(&env));
    let mut assets = Vec::new(&env);
    for _ in 0..9 {
        assets.push_back(Address::generate(&env));
    }
    bad!(allowed_stake_assets, assets);
    let asset = valid.allowed_stake_assets.get(0).unwrap();
    bad!(
        allowed_stake_assets,
        Vec::from_array(&env, [asset.clone(), asset])
    );
    for p in cases {
        assert!(
            std::panic::catch_unwind(std::panic::AssertUnwindSafe(
                || env.register(Registry, (Address::generate(&env), p.clone()))
            ))
            .is_err()
        );
        let id = env.register(Registry, (Address::generate(&env), valid.clone()));
        let client = RegistryClient::new(&env, &id);
        env.mock_all_auths();
        assert_eq!(
            client.try_propose(&ActionKind::SetParams(p)),
            Err(Ok(Error::InvalidParams))
        );
    }
}

#[test]
fn admin_transfer_is_two_step() {
    let env = Env::default();
    let (id, admin) = world(&env);
    let client = RegistryClient::new(&env, &id);
    let next = Address::generate(&env);
    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "propose_admin",
                args: (next.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .propose_admin(&next);
    assert_eq!(client.admin(), admin);
    assert!(client.mock_auths(&[]).try_accept_admin().is_err());
    client
        .mock_auths(&[MockAuth {
            address: &next,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "accept_admin",
                args: ().into_val(&env),
                sub_invokes: &[],
            },
        }])
        .accept_admin();
    assert_eq!(client.admin(), next);
    assert_eq!(client.try_accept_admin(), Err(Ok(Error::NothingPending)));
}

#[test]
fn upgrade_action_respects_timelock() {
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let client = RegistryClient::new(&env, &id);
    let wasm = env
        .deployer()
        .upload_contract_wasm(&include_bytes!("../testdata/upgrade.wasm")[..]);
    let action = client.propose(&ActionKind::Upgrade(wasm));
    assert_eq!(client.try_execute(&action), Err(Ok(Error::TimelockActive)));
    env.ledger().with_mut(|l| {
        l.timestamp = 60;
        l.sequence_number += 12;
    });
    client.execute(&action);
    env.as_contract(&id, || {
        let action: crate::PendingAction = env
            .storage()
            .persistent()
            .get(&DataKey::Action(action))
            .unwrap();
        assert!(action.executed);
    });
}

#[test]
fn cancelled_and_executed_actions_cannot_run_again() {
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let client = RegistryClient::new(&env, &id);
    let verifier = Address::generate(&env);
    let a = client.propose(&ActionKind::SetVerifier(verifier.clone()));
    client.cancel(&a);
    env.ledger().with_mut(|l| l.timestamp = 60);
    assert_eq!(client.try_execute(&a), Err(Ok(Error::NothingPending)));
    let b = client.propose(&ActionKind::SetVerifier(verifier));
    env.ledger().with_mut(|l| l.timestamp = 120);
    client.execute(&b);
    assert_eq!(client.try_execute(&b), Err(Ok(Error::NothingPending)));
    assert_eq!(client.try_cancel(&b), Err(Ok(Error::NothingPending)));
    let mut changed = client.params();
    changed.quorum = 2;
    let c = client.propose(&ActionKind::SetParams(changed.clone()));
    assert_ne!(client.params(), changed);
    env.ledger().with_mut(|l| l.timestamp = 180);
    client.execute(&c);
    assert_eq!(client.params(), changed);
    assert_eq!(client.try_action(&999), Err(Ok(Error::NothingPending)));
}
