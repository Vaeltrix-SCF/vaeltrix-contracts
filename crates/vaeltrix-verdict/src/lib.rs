//! Pure verdict rules: breach evaluation, penalty, claim bond, minimum stake,
//! exit cooldown, claim deadline, rejected-bond split and carve-out merging.
//!
//! Every function returns `Option` and never panics (guide §4.5). The
//! TypeScript port in `@vaeltrix/core` must agree with this crate on every case
//! in `test-vectors/verdict.json`. Implemented by VX-104.
#![no_std]
