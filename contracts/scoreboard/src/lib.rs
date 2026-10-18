//! `vaeltrix_scoreboard`: Per-period stats anchored by observers and claim outcomes pushed by the bond contract. Holds no funds.
//!
//! Interface and storage are frozen in guide §7. Implemented by VX-401.
#![no_std]

use soroban_sdk::{contract, contractimpl};

#[contract]
pub struct Scoreboard;

#[contractimpl]
impl Scoreboard {}

#[cfg(test)]
mod test;
