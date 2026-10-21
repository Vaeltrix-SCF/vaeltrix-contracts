//! Bond construction and upgrade tests (VX-301).
#![allow(clippy::unwrap_used, clippy::arithmetic_side_effects)]
extern crate std;
use crate::testutils::params;
use crate::{Bond, BondClient, DataKey};
use soroban_sdk::{
    Address, BytesN, Env, IntoVal,
    testutils::{Address as _, Ledger, MockAuth, MockAuthInvoke},
};
use vaeltrix_types::Error;
#[test]
fn constructor_stores_addresses_and_counters() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let registry = e.register(vaeltrix_registry::Registry, (admin.clone(), params(&e)));
    let scoreboard = Address::generate(&e);
    let id = e.register(Bond, (admin.clone(), registry.clone(), scoreboard.clone()));
    let c = BondClient::new(&e, &id);
    assert_eq!(c.admin(), admin);
    assert_eq!(c.registry(), registry);
    assert_eq!(c.scoreboard(), scoreboard);
    e.as_contract(&id, || {
        assert_eq!(
            e.storage()
                .instance()
                .get::<_, u64>(&DataKey::NextCommitmentId),
            Some(1)
        );
        assert_eq!(
            e.storage().instance().get::<_, u64>(&DataKey::NextClaimId),
            Some(1)
        );
    });
    assert_eq!(c.try_execute_upgrade(), Err(Ok(Error::NothingPending)));
}
#[test]
fn upgrade_respects_registry_timelock_and_admin_auth() {
    let e = Env::default();
    let admin = Address::generate(&e);
    let registry = e.register(vaeltrix_registry::Registry, (admin.clone(), params(&e)));
    let id = e.register(
        Bond,
        (admin.clone(), registry.clone(), Address::generate(&e)),
    );
    let c = BondClient::new(&e, &id);
    let hash = e
        .deployer()
        .upload_contract_wasm(&include_bytes!("../../registry/testdata/upgrade.wasm")[..]);
    let wrong = Address::generate(&e);
    let auth = MockAuthInvoke {
        contract: &id,
        fn_name: "propose_upgrade",
        args: (hash.clone(),).into_val(&e),
        sub_invokes: &[],
    };
    e.mock_auths(&[MockAuth {
        address: &wrong,
        invoke: &auth,
    }]);
    assert!(c.try_propose_upgrade(&hash).is_err());
    e.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &auth,
    }]);
    c.propose_upgrade(&hash);
    e.mock_auths(&[]);
    e.ledger().with_mut(|l| l.timestamp = 59);
    assert_eq!(c.try_execute_upgrade(), Err(Ok(Error::TimelockActive)));
    let cancel = MockAuthInvoke {
        contract: &id,
        fn_name: "cancel_upgrade",
        args: ().into_val(&e),
        sub_invokes: &[],
    };
    e.mock_auths(&[MockAuth {
        address: &wrong,
        invoke: &cancel,
    }]);
    assert!(c.try_cancel_upgrade().is_err());
    e.mock_auths(&[MockAuth {
        address: &admin,
        invoke: &cancel,
    }]);
    c.cancel_upgrade();
    assert_eq!(c.try_execute_upgrade(), Err(Ok(Error::NothingPending)));
    // A changed registry timelock applies to the next proposal.
    e.mock_all_auths();
    let r = vaeltrix_registry::RegistryClient::new(&e, &registry);
    let mut p = r.params();
    p.timelock_secs = 120;
    let a = r.propose(&vaeltrix_registry::ActionKind::SetParams(p));
    e.ledger().with_mut(|l| l.timestamp = 119);
    r.execute(&a);
    c.propose_upgrade(&hash);
    e.mock_auths(&[]);
    e.ledger().with_mut(|l| l.timestamp = 238);
    assert_eq!(c.try_execute_upgrade(), Err(Ok(Error::TimelockActive)));
    e.ledger().with_mut(|l| l.timestamp = 239);
    c.execute_upgrade();
    e.as_contract(&id, || {
        assert_eq!(
            e.storage()
                .instance()
                .get::<_, Option<(BytesN<32>, u64)>>(&DataKey::PendingUpgrade),
            None
        );
    });
}

#[test]
fn commit_happy_path_moves_tokens_and_emits_event() {
    use soroban_sdk::{Vec, testutils::Events, token};
    let w = crate::testutils::StakeWorld::new();
    let e = &w.env;
    let c = BondClient::new(e, &w.id);
    let token = token::Client::new(e, &w.asset);
    let before = token.balance(&w.owner);
    let id = c.commit(&w.provider, &901, &w.asset, &2_000_000_000, &0, &0);
    let emitted = e.events().all();
    assert_eq!(id, 1);
    assert_eq!(token.balance(&w.owner), before - 2_000_000_000);
    assert_eq!(token.balance(&w.id), 2_000_000_000);
    let stored = c.commitment(&id);
    assert_eq!(stored.template_version, 1);
    assert_eq!(stored.min_stake, 1_000_000_000);
    assert_eq!(c.available_stake(&id), 2_000_000_000);
    assert_eq!(c.max_penalty(&id), 1_000_000_000);
    assert_eq!(
        c.commitments_by_provider(&w.provider),
        Vec::from_array(e, [id])
    );
    let events = emitted;
    let event = events.events().last().unwrap();
    let soroban_sdk::xdr::ContractEventBody::V0(body) = &event.body;
    assert_eq!(
        body.topics[0],
        soroban_sdk::xdr::ScVal::Symbol(soroban_sdk::xdr::ScSymbol(
            std::vec::Vec::from(b"commit".as_slice())
                .try_into()
                .unwrap()
        ))
    );
}
#[test]
fn commit_freezes_exit_cooldown_per_corrected_formula() {
    let w = crate::testutils::StakeWorld::new();
    let e = &w.env;
    let c = BondClient::new(e, &w.id);
    let id = c.commit(
        &w.provider,
        &901,
        &w.asset,
        &3_000_000_000,
        &10_000_000_000,
        &86_400,
    );
    let old = c.commitment(&id);
    assert_eq!(old.exit_cooldown_secs, 606_130);
    assert_eq!(old.min_stake, 1_500_000_000);
    let r = vaeltrix_registry::RegistryClient::new(e, &w.registry);
    let mut p = r.params();
    p.exit_extra_secs = 9999;
    p.stake_floor = 9_000_000_000;
    let a = r.propose(&vaeltrix_registry::ActionKind::SetParams(p));
    e.ledger().with_mut(|l| l.timestamp = 120);
    r.execute(&a);
    assert_eq!(c.commitment(&id), old);
}
#[test]
fn add_stake_and_withdraw_excess_respect_min_stake_and_reserved() {
    use soroban_sdk::token;
    let w = crate::testutils::StakeWorld::new();
    let e = &w.env;
    let c = BondClient::new(e, &w.id);
    let id = c.commit(&w.provider, &901, &w.asset, &2_000_000_000, &0, &0);
    let initial = token::Client::new(e, &w.asset).balance(&w.owner);
    c.add_stake(&id, &1_000_000_000);
    assert_eq!(
        token::Client::new(e, &w.asset).balance(&w.owner),
        initial - 1_000_000_000
    );
    e.as_contract(&w.id, || {
        let key = DataKey::Commitment(id);
        let mut value: vaeltrix_types::Commitment = e.storage().persistent().get(&key).unwrap();
        value.stake_reserved = 500_000_000;
        e.storage().persistent().set(&key, &value);
    });
    assert_eq!(
        c.try_withdraw_excess(&id, &1_500_000_001),
        Err(Ok(Error::InsufficientStake))
    );
    c.withdraw_excess(&id, &1_500_000_000);
    assert_eq!(c.available_stake(&id), 1_000_000_000);
    assert_eq!(
        token::Client::new(e, &w.asset).balance(&w.id),
        1_500_000_000
    );
    assert_eq!(
        token::Client::new(e, &w.asset).balance(&w.owner),
        initial + 500_000_000
    );
    for amount in [0, -1] {
        assert_eq!(c.try_add_stake(&id, &amount), Err(Ok(Error::InvalidParams)));
        assert_eq!(
            c.try_withdraw_excess(&id, &amount),
            Err(Ok(Error::InvalidParams))
        );
    }
}
macro_rules! rejected_commit {
    ($name:ident,$setup:expr,$amount:expr,$expected:expr) => {
        #[test]
        fn $name() {
            let w = crate::testutils::StakeWorld::new();
            let e = &w.env;
            let r = vaeltrix_registry::RegistryClient::new(e, &w.registry);
            ($setup)(&w, &r);
            let c = BondClient::new(e, &w.id);
            let before = soroban_sdk::token::Client::new(e, &w.asset).balance(&w.owner);
            assert_eq!(
                c.try_commit(&w.provider, &901, &w.asset, &$amount, &0, &0),
                Err(Ok($expected))
            );
            assert_eq!(
                soroban_sdk::token::Client::new(e, &w.asset).balance(&w.owner),
                before
            );
            assert!(c.commitments_by_provider(&w.provider).is_empty());
        }
    };
}
rejected_commit!(
    commit_rejects_unverified_provider,
    |w: &crate::testutils::StakeWorld, r: &vaeltrix_registry::RegistryClient| r
        .unverify_domain(&w.provider),
    2_000_000_000,
    Error::ProviderNotVerified
);
rejected_commit!(
    commit_rejects_suspended_provider,
    |w: &crate::testutils::StakeWorld, r: &vaeltrix_registry::RegistryClient| r
        .suspend_provider(&w.provider, &soroban_sdk::Symbol::new(&w.env, "audit")),
    2_000_000_000,
    Error::ProviderNotActive
);
rejected_commit!(
    commit_rejects_inactive_template,
    |_: &crate::testutils::StakeWorld, r: &vaeltrix_registry::RegistryClient| r
        .deprecate_template(&901, &1),
    2_000_000_000,
    Error::TemplateNotActive
);
rejected_commit!(
    commit_rejects_below_min_stake,
    |_: &crate::testutils::StakeWorld, _: &vaeltrix_registry::RegistryClient| {},
    999_999_999,
    Error::BelowMinStake
);
rejected_commit!(
    commit_rejects_over_cap,
    |_: &crate::testutils::StakeWorld, _: &vaeltrix_registry::RegistryClient| {},
    100_000_000_001,
    Error::StakeCapExceeded
);
#[test]
fn commit_rejects_asset_mismatch() {
    let w = crate::testutils::StakeWorld::new();
    let c = BondClient::new(&w.env, &w.id);
    assert_eq!(
        c.try_commit(
            &w.provider,
            &901,
            &Address::generate(&w.env),
            &2_000_000_000,
            &0,
            &0
        ),
        Err(Ok(Error::AssetMismatch))
    );
}
#[test]
fn commit_rejects_below_max_penalty() {
    let w = crate::testutils::StakeWorld::new();
    let e = &w.env;
    let r = vaeltrix_registry::RegistryClient::new(e, &w.registry);
    let mut p = r.params();
    p.stake_floor = 1;
    let a = r.propose(&vaeltrix_registry::ActionKind::SetParams(p));
    e.ledger().with_mut(|l| l.timestamp = 120);
    r.execute(&a);
    assert_eq!(
        BondClient::new(e, &w.id).try_commit(&w.provider, &901, &w.asset, &999_999_999, &0, &0),
        Err(Ok(Error::InsufficientStake))
    );
}

#[test]
fn stake_rejects_invalid_volume_overflow_and_unauthorized_owner() {
    let w = crate::testutils::StakeWorld::new();
    let e = &w.env;
    let c = BondClient::new(e, &w.id);
    assert_eq!(
        c.try_commit(&w.provider, &901, &w.asset, &2_000_000_000, &1, &0),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(
        c.try_commit(&w.provider, &901, &w.asset, &2_000_000_000, &-1, &1),
        Err(Ok(Error::InvalidParams))
    );
    assert_eq!(
        c.try_commit(&w.provider, &901, &w.asset, &2_000_000_000, &i128::MAX, &1),
        Err(Ok(Error::ArithmeticOverflow))
    );
    let id = c.commit(&w.provider, &901, &w.asset, &2_000_000_000, &0, &0);
    assert_eq!(
        c.try_add_stake(&id, &100_000_000_000),
        Err(Ok(Error::StakeCapExceeded))
    );
    assert_eq!(
        c.try_add_stake(&id, &i128::MAX),
        Err(Ok(Error::ArithmeticOverflow))
    );
    let stranger = Address::generate(e);
    for name in ["add_stake", "withdraw_excess"] {
        let args = (id, 1_i128).into_val(e);
        e.mock_auths(&[MockAuth {
            address: &stranger,
            invoke: &MockAuthInvoke {
                contract: &w.id,
                fn_name: name,
                args,
                sub_invokes: &[],
            },
        }]);
        assert!(
            e.try_invoke_contract::<(), Error>(
                &w.id,
                &soroban_sdk::Symbol::new(e, name),
                (id, 1_i128).into_val(e)
            )
            .is_err()
        );
    }
    assert_eq!(c.commitment(&id).stake_total, 2_000_000_000);
}
