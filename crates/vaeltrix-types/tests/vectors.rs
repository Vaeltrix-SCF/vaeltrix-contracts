//! VX-103: compare the real on-chain ID helpers against every shared VX-105 vector.
#![allow(
    clippy::unwrap_used,
    clippy::expect_used,
    clippy::arithmetic_side_effects
)]
use soroban_sdk::{
    Address, BytesN, Env, String, TryFromVal,
    xdr::{Limits, ReadXdr, ScAddress},
};
use vaeltrix_types::ids::{payment_id, provider_id};

fn hex(text: &str) -> std::vec::Vec<u8> {
    (0..text.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&text[i..i + 2], 16).unwrap())
        .collect()
}

#[test]
fn ids_match_shared_vectors() {
    let cases: std::vec::Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../../../test-vectors/ids.json")).unwrap();
    assert!(cases.len() >= 5);
    for case in cases {
        let env = Env::default();
        let input = &case["input"];
        let admin_xdr = ScAddress::from_xdr(
            hex(input["admin_scaddress_xdr"].as_str().unwrap()),
            Limits::none(),
        )
        .unwrap();
        let admin = Address::try_from_val(&env, &admin_xdr).unwrap();
        let provider = provider_id(
            &env,
            &String::from_str(&env, input["home_domain"].as_str().unwrap()),
            &admin,
        );
        assert_eq!(
            provider,
            BytesN::<32>::from_array(
                &env,
                &hex(case["expect"]["provider_id"].as_str().unwrap())
                    .try_into()
                    .unwrap()
            ),
            "{}",
            case["name"]
        );
        let payment = payment_id(
            &env,
            &String::from_str(&env, input["sep31_tx_id"].as_str().unwrap()),
            &provider,
        );
        assert_eq!(
            payment,
            BytesN::<32>::from_array(
                &env,
                &hex(case["expect"]["payment_id"].as_str().unwrap())
                    .try_into()
                    .unwrap()
            ),
            "{}",
            case["name"]
        );
    }
}
