//! Pause ceiling and storage TTL policy (guide §6.1, §8.3, VX-103).
pub const MAX_PAUSE_MS: u64 = 604_800_000;
pub const DAY_LEDGERS: u32 = 17_280;
pub const INSTANCE_BUMP: u32 = 30 * DAY_LEDGERS;
pub const INSTANCE_THRESHOLD: u32 = 7 * DAY_LEDGERS;
pub const PERSIST_BUMP: u32 = 120 * DAY_LEDGERS;
pub const PERSIST_THRESHOLD: u32 = 30 * DAY_LEDGERS;
pub const RESOLVED_CLAIM_BUMP: u32 = 90 * DAY_LEDGERS;
