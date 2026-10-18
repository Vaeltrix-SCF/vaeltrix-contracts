//! Unit tests for `vaeltrix_registry`. Required test names are listed in guide §9.2.

use crate::Registry;
use soroban_sdk::Env;

#[test]
fn contract_registers() {
    let env = Env::default();
    let _contract_id = env.register(Registry, ());
}
