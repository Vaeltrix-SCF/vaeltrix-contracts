//! Shared on-chain types for every Vaeltrix contract.
//!
//! Single source of truth for `#[contracttype]` structs and enums, the `Error`
//! enum and the cross-contract client traits. Contents are defined in guide §4
//! and implemented by issue VX-103. Freeze before any contract work starts.
#![no_std]

pub mod clients;
pub mod constants;
pub mod enums;
pub mod errors;
pub mod ids;
pub mod structs;
