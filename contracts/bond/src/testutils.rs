//! Local bond fixtures. The full three-contract World remains VX-310.
use soroban_sdk::{Address, Env, Vec, testutils::Address as _};
use vaeltrix_types::Params;
pub fn params(env: &Env) -> Params {
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
