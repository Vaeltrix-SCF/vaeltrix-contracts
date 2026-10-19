//! Frozen cross-contract clients (guide §4.3, VX-103).
use crate::{
    enums::ClaimOutcome,
    structs::{Claim, Params, Provider, SlaTemplate},
};
use soroban_sdk::{Address, BytesN, Env};

#[soroban_sdk::contractclient(name = "RegistryClient")]
pub trait RegistryApi {
    fn get_provider(env: Env, provider_id: BytesN<32>) -> Provider;
    fn get_template_version(env: Env, template_id: u32, version: u32) -> SlaTemplate;
    fn is_active_observer(env: Env, observer: Address) -> bool;
    fn active_observer_count(env: Env) -> u32;
    fn params(env: Env) -> Params;
}
#[soroban_sdk::contractclient(name = "ScoreboardClient")]
pub trait ScoreboardApi {
    fn record_claim_outcome(env: Env, claim: Claim, outcome: ClaimOutcome);
}
