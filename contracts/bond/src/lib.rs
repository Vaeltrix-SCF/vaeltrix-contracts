//! `vaeltrix_bond`: Holds every token: commitments, stake, claims, challenges, resolution and exits.
//!
//! Interface and storage are frozen in guide §6. Implemented by VX-301 to VX-312.
#![no_std]

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct Bond;

#[contractimpl]
impl Bond {}

#[cfg(test)]
mod test;

#[cfg(test)]
mod testutils;
