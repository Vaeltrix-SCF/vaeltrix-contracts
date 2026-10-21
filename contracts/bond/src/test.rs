//! Bond construction and upgrade tests (VX-301).
#![allow(clippy::unwrap_used, clippy::arithmetic_side_effects)]
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
