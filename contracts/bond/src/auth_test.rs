//! VX-311: signer matrix from guide §8.2.
#![allow(clippy::unwrap_used)]
extern crate std;

use crate::testutils::World;
use soroban_sdk::{
    Address, BytesN, Env, IntoVal, Symbol, TryFromVal, Val, Vec,
    testutils::{Address as _, MockAuth, MockAuthInvoke},
};
use vaeltrix_types::{CompletionReceipt, Error, PaymentRef};

struct Matrix<'w, 'a> {
    world: &'w World<'a>,
    wrong: Address,
}

impl Matrix<'_, '_> {
    fn protected<T: TryFromVal<Env, Val>>(
        &self,
        name: &str,
        args: Vec<Val>,
        signers: &[(&Address, &[MockAuthInvoke<'_>])],
    ) -> T {
        let w = self.world;
        let method = Symbol::new(&w.env, name);
        let roots: std::vec::Vec<_> = signers
            .iter()
            .map(|(_, sub_invokes)| MockAuthInvoke {
                contract: &w.bond.address,
                fn_name: name,
                args: args.clone(),
                sub_invokes,
            })
            .collect();
        let auth: std::vec::Vec<_> = signers
            .iter()
            .zip(&roots)
            .map(|((address, _), invoke)| MockAuth { address, invoke })
            .collect();

        // Replace each required signer in turn, preserving any other valid signature.
        for (i, _) in signers.iter().enumerate() {
            let mut wrong = auth.clone();
            wrong[i].address = &self.wrong;
            w.env.mock_auths(&wrong);
            assert!(
                matches!(
                    w.env
                        .try_invoke_contract::<T, Error>(&w.bond.address, &method, args.clone()),
                    Err(Err(_))
                ),
                "{name} accepted the wrong signer at index {i} or did not fail at host authorization"
            );
        }

        w.env.mock_auths(&auth);
        let result = w.env.invoke_contract(&w.bond.address, &method, args);
        let actual = w.env.auths();
        assert_eq!(actual.len(), signers.len(), "{name} authorization count");
        for (expected, _) in signers {
            assert!(actual.iter().any(|(address, _)| address == *expected));
        }
        result
    }

    fn transfer(&self, from: &Address, amount: i128) -> MockAuthInvoke<'_> {
        let w = self.world;
        MockAuthInvoke {
            contract: &w.usdc,
            fn_name: "transfer",
            args: (from.clone(), w.bond.address.clone(), amount).into_val(&w.env),
            sub_invokes: &[],
        }
    }

    fn file(
        &self,
        payment: &PaymentRef,
        observer: Option<Address>,
        receipt: Option<CompletionReceipt>,
    ) -> u64 {
        let w = self.world;
        let bond_transfer = [self.transfer(&w.client, 10_000_000)];
        let mut signers: std::vec::Vec<(&Address, &[MockAuthInvoke<'_>])> =
            std::vec![(&w.client, &bond_transfer)];
        if let Some(observer) = &observer {
            signers.push((observer, &[]));
        }
        self.protected(
            "file_claim",
            (
                w.client.clone(),
                w.client.clone(),
                payment.clone(),
                observer.clone(),
                receipt,
            )
                .into_val(&w.env),
            &signers,
        )
    }

    fn anyone(&self, name: &str, args: Vec<Val>) {
        let w = self.world;
        w.env.mock_auths(&[]);
        w.env
            .invoke_contract::<()>(&w.bond.address, &Symbol::new(&w.env, name), args);
        assert!(w.env.auths().is_empty(), "{name} required a signature");
    }
}

fn late_payment(w: &World<'_>, id: u64) -> PaymentRef {
    w.advance_secs(5);
    let t0 = w.env.ledger().timestamp().checked_mul(1000).unwrap();
    let p = w.payment(
        id,
        1_000_000_000,
        t0,
        Some(t0.checked_add(131_000).unwrap()),
    );
    w.advance_secs(132);
    p
}

#[test]
fn auth_matrix_bond() {
    let w = World::new();
    let provider = w.with_provider();
    let template = w.with_template_901();
    let e = &w.env;
    let matrix = Matrix {
        world: &w,
        wrong: Address::generate(e),
    };
    let owner = [(&w.provider_admin, &[][..])];
    let admin = [(&w.admin, &[][..])];
    let observer = [(&w.observer, &[][..])];
    let stake = 10_000_000_000_i128;
    let id: u64 = matrix.protected(
        "commit",
        (provider, template, w.usdc.clone(), stake, 0_i128, 0_u64).into_val(e),
        &[(
            &w.provider_admin,
            &[matrix.transfer(&w.provider_admin, stake)],
        )],
    );
    matrix.protected::<()>(
        "add_stake",
        (id, 1_i128).into_val(e),
        &[(&w.provider_admin, &[matrix.transfer(&w.provider_admin, 1)])],
    );
    matrix.protected::<()>("withdraw_excess", (id, 1_i128).into_val(e), &owner);
    matrix.protected::<()>("pause", (id,).into_val(e), &owner);
    w.advance_secs(5);
    matrix.protected::<()>("resume", (id,).into_val(e), &owner);
    matrix.anyone("extend_commitment_ttl", (id,).into_val(e));

    let claim_a = matrix.file(&late_payment(&w, id), Some(w.observer.clone()), None);
    matrix.anyone("extend_claim_ttl", (claim_a,).into_val(e));
    let hash = BytesN::from_array(e, &[4; 32]);
    matrix.protected::<()>("challenge", (claim_a, hash.clone()).into_val(e), &owner);
    matrix.protected::<()>(
        "attest",
        (w.observer.clone(), claim_a, true, hash).into_val(e),
        &observer,
    );
    matrix.anyone("resolve", (claim_a,).into_val(e));

    let payment_b = late_payment(&w, id);
    let claim_b = matrix.file(&payment_b, None, Some(w.receipt(&payment_b)));
    w.advance_secs(w.registry.params().challenge_window_secs);
    matrix.anyone("resolve", (claim_b,).into_val(e));

    matrix.protected::<()>("request_exit", (id,).into_val(e), &owner);
    w.advance_secs(w.bond.commitment(&id).exit_cooldown_secs);
    matrix.protected::<()>("finalize_exit", (id,).into_val(e), &owner);
    w.assert_invariants();

    let wasm = e
        .deployer()
        .upload_contract_wasm(&include_bytes!("../../registry/testdata/upgrade.wasm")[..]);
    matrix.protected::<()>("propose_upgrade", (wasm.clone(),).into_val(e), &admin);
    matrix.protected::<()>("cancel_upgrade", ().into_val(e), &admin);
    matrix.protected::<()>("propose_upgrade", (wasm,).into_val(e), &admin);
    w.advance_secs(w.registry.params().timelock_secs);
    matrix.anyone("execute_upgrade", ().into_val(e));
}
