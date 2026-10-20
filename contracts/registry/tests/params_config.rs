//! VX-506: exercise JSON parameters through the production registry validator.
#![allow(clippy::unwrap_used)]
use soroban_sdk::{Address, Env, String, Vec, testutils::Address as _};
use vaeltrix_registry::{Registry, RegistryClient};
use vaeltrix_types::Params;
fn parse(env: &Env, source: &str) -> Params {
    let v: serde_json::Value = serde_json::from_str(source).unwrap();
    let u = |name: &str| v[name].as_u64().unwrap();
    let n = |name: &str| v[name].as_str().unwrap().parse::<i128>().unwrap();
    let mut assets = Vec::new(env);
    for asset in v["allowed_stake_assets"].as_array().unwrap() {
        assets.push_back(Address::from_string(&String::from_str(
            env,
            asset.as_str().unwrap(),
        )));
    }
    Params {
        timelock_secs: u("timelock_secs"),
        challenge_window_secs: u("challenge_window_secs"),
        attestation_window_secs: u("attestation_window_secs"),
        exit_extra_secs: u("exit_extra_secs"),
        quorum: u32::try_from(u("quorum")).unwrap(),
        min_claim_bond: n("min_claim_bond"),
        claim_bond_bps: u32::try_from(u("claim_bond_bps")).unwrap(),
        rejected_bond_provider_bps: u32::try_from(u("rejected_bond_provider_bps")).unwrap(),
        stake_floor: n("stake_floor"),
        stake_k: u32::try_from(u("stake_k")).unwrap(),
        max_stake_per_commitment: n("max_stake_per_commitment"),
        allowed_stake_assets: assets,
    }
}
#[test]
fn parameter_files_match_recommendations_and_pass_rust_validator() {
    for (source, expected) in [
        (
            include_str!("../../../config/params.testnet.json"),
            (60, 180, 300, 120, 1, 1_000_000_000, 100_000_000_000),
        ),
        (
            include_str!("../../../config/params.mainnet.example.json"),
            (1_209_600, 172_800, 259_200, 604_800, 3, 10_000_000_000, 0),
        ),
    ] {
        let env = Env::default();
        let p = parse(&env, source);
        assert_eq!(
            (
                p.timelock_secs,
                p.challenge_window_secs,
                p.attestation_window_secs,
                p.exit_extra_secs,
                p.quorum,
                p.stake_floor,
                p.max_stake_per_commitment
            ),
            expected
        );
        assert_eq!(
            (
                p.min_claim_bond,
                p.claim_bond_bps,
                p.rejected_bond_provider_bps,
                p.stake_k
            ),
            (10_000_000, 1_000, 5_000, 3)
        );
        assert_eq!(p.allowed_stake_assets.len(), 1);
        let id = env.register(Registry, (Address::generate(&env), p.clone()));
        assert_eq!(RegistryClient::new(&env, &id).params(), p);
    }
}
