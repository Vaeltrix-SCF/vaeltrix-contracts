//! `vaeltrix_registry`: Identity and configuration: providers, SLA templates, observers, params and the admin timelock. Holds no funds.
//!
//! Interface and storage are frozen in guide §5. Implemented by VX-201 to VX-207.
#![no_std]

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct Registry;

#[contractimpl]
impl Registry {}

#[cfg(test)]
mod test;
