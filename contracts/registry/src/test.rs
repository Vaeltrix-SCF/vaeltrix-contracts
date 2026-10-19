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

fn register(env: &Env, id: &Address, owner: &Address) -> soroban_sdk::BytesN<32> {
    RegistryClient::new(env, id).register_provider(
        owner,
        &soroban_sdk::String::from_str(env, "anchor.example"),
        &Vec::from_array(env, [soroban_sdk::BytesN::from_array(env, &[7; 32])]),
        &soroban_sdk::String::from_str(env, "https://anchor.example/vaeltrix.json"),
    )
}

#[test]
fn register_provider_derives_expected_id() {
    use soroban_sdk::{
        BytesN, String, TryFromVal,
        xdr::{Limits, ReadXdr, ScAddress},
    };
    fn bytes(s: &str) -> std::vec::Vec<u8> {
        (0..s.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&s[i..i + 2], 16).unwrap())
            .collect()
    }
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let client = RegistryClient::new(&env, &id);
    let cases: std::vec::Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../../test-vectors/ids.json")).unwrap();
    let mut checked = 0;
    for c in cases {
        let domain = c["input"]["home_domain"].as_str().unwrap();
        if !domain
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-')
        {
            continue;
        }
        let addr = ScAddress::from_xdr(
            bytes(c["input"]["admin_scaddress_xdr"].as_str().unwrap()),
            Limits::none(),
        )
        .unwrap();
        let owner = Address::try_from_val(&env, &addr).unwrap();
        let actual = client.register_provider(
            &owner,
            &String::from_str(&env, domain),
            &Vec::from_array(&env, [BytesN::from_array(&env, &[7; 32])]),
            &String::from_str(&env, ""),
        );
        assert_eq!(
            actual,
            BytesN::<32>::from_array(
                &env,
                &bytes(c["expect"]["provider_id"].as_str().unwrap())
                    .try_into()
                    .unwrap()
            )
        );
        assert_eq!(
            client.provider_id_for(&String::from_str(&env, domain), &owner),
            actual
        );
        assert_eq!(
            client.providers_by_admin(&owner),
            Vec::from_array(&env, [actual.clone()])
        );
        assert!(!client.get_provider(&actual).verified);
        checked += 1;
    }
    assert_eq!(checked, 3);
}
#[test]
fn register_provider_rejects_duplicate() {
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let owner = Address::generate(&env);
    register(&env, &id, &owner);
    assert_eq!(
        RegistryClient::new(&env, &id).try_register_provider(
            &owner,
            &soroban_sdk::String::from_str(&env, "anchor.example"),
            &Vec::from_array(&env, [soroban_sdk::BytesN::from_array(&env, &[7; 32])]),
            &soroban_sdk::String::from_str(&env, "")
        ),
        Err(Ok(Error::ProviderExists))
    );
    assert_eq!(
        RegistryClient::new(&env, &id)
            .providers_by_admin(&owner)
            .len(),
        1
    );
}
#[test]
fn register_provider_rejects_uppercase_domain() {
    reject_provider_inputs("ANCHOR.example", 1, false, 0, Error::InvalidParams);
}
#[test]
fn register_provider_rejects_too_many_signers() {
    reject_provider_inputs("anchor.example", 6, false, 0, Error::TooManySigners);
}
#[test]
fn register_provider_rejects_duplicate_signers() {
    reject_provider_inputs("anchor.example", 2, true, 0, Error::InvalidParams);
}
fn reject_provider_inputs(
    domain: &str,
    count: u8,
    duplicate: bool,
    uri_len: usize,
    expected: Error,
) {
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let owner = Address::generate(&env);
    let mut signers = Vec::new(&env);
    for i in 0..count {
        signers.push_back(soroban_sdk::BytesN::from_array(
            &env,
            &[if duplicate { 0 } else { i }; 32],
        ));
    }
    assert_eq!(
        RegistryClient::new(&env, &id).try_register_provider(
            &owner,
            &soroban_sdk::String::from_str(&env, domain),
            &signers,
            &soroban_sdk::String::from_str(&env, &"x".repeat(uri_len))
        ),
        Err(Ok(expected))
    );
    assert!(
        RegistryClient::new(&env, &id)
            .providers_by_admin(&owner)
            .is_empty()
    );
}
#[test]
fn register_provider_rejects_invalid_domain_and_metadata_bounds() {
    for d in [
        "",
        "https://anchor.example",
        "anchor.example.",
        "anchor/example",
        "café.example",
    ] {
        reject_provider_inputs(d, 1, false, 0, Error::InvalidParams);
    }
    reject_provider_inputs(&"a".repeat(254), 1, false, 0, Error::InvalidParams);
    reject_provider_inputs("anchor.example", 0, false, 0, Error::InvalidParams);
    reject_provider_inputs("anchor.example", 1, false, 257, Error::InvalidParams);
}
#[test]
fn update_signers_requires_provider_admin() {
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let owner = Address::generate(&env);
    let provider = register(&env, &id, &owner);
    let client = RegistryClient::new(&env, &id);
    let new = Vec::from_array(&env, [soroban_sdk::BytesN::from_array(&env, &[9; 32])]);
    assert!(
        client
            .mock_auths(&[])
            .try_update_signers(&provider, &new)
            .is_err()
    );
    client
        .mock_auths(&[MockAuth {
            address: &owner,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "update_signers",
                args: (provider.clone(), new.clone()).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .update_signers(&provider, &new);
    assert_eq!(client.get_provider(&provider).signers, new);
}
#[test]
fn verify_domain_requires_verifier() {
    let env = Env::default();
    env.mock_all_auths();
    let (id, admin) = world(&env);
    let owner = Address::generate(&env);
    let provider = register(&env, &id, &owner);
    let client = RegistryClient::new(&env, &id);
    assert!(client.mock_auths(&[]).try_verify_domain(&provider).is_err());
    client
        .mock_auths(&[MockAuth {
            address: &admin,
            invoke: &MockAuthInvoke {
                contract: &id,
                fn_name: "verify_domain",
                args: (provider.clone(),).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .verify_domain(&provider);
    assert!(client.get_provider(&provider).verified);
}
#[test]
fn provider_mutations_preserve_identity_and_admin_authorization() {
    use vaeltrix_types::ProviderStatus;
    let env = Env::default();
    env.mock_all_auths();
    let (id, _) = world(&env);
    let owner = Address::generate(&env);
    let provider = register(&env, &id, &owner);
    let client = RegistryClient::new(&env, &id);
    let uri = soroban_sdk::String::from_str(&env, "https://anchor.example/new.json");
    client.update_metadata(&provider, &uri);
    assert_eq!(client.get_provider(&provider).metadata_uri, uri);
    client.verify_domain(&provider);
    client.unverify_domain(&provider);
    assert!(!client.get_provider(&provider).verified);
    client.suspend_provider(&provider, &soroban_sdk::Symbol::new(&env, "review"));
    assert_eq!(
        client.get_provider(&provider).status,
        ProviderStatus::Suspended
    );
    client.reinstate_provider(&provider);
    assert_eq!(
        client.get_provider(&provider).status,
        ProviderStatus::Active
    );
    assert_eq!(client.get_provider(&provider).admin, owner);
}
