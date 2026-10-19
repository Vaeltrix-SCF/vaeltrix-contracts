//! Pure, allocation-free SLA rules (guide §4.5, VX-104).
//! Amounts are stroops; payment times are milliseconds; windows are seconds.
//! Fallible arithmetic returns `None`, never a wrapped or rounded-up amount.
#![no_std]

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Verdict {
    Pending,
    OnTime { latency_ms: u64 },
    Late { latency_ms: u64 },
    NoCompletion,
}

pub fn deadline_ms(t0_ms: u64, target_ms: u64, grace_ms: u64, pause_ms: u64) -> Option<u64> {
    t0_ms
        .checked_add(target_ms)?
        .checked_add(grace_ms)?
        .checked_add(pause_ms)
}

pub fn evaluate(
    t0_ms: u64,
    t1_ms: Option<u64>,
    now_ms: u64,
    target_ms: u64,
    grace_ms: u64,
    pause_ms: u64,
) -> Option<Verdict> {
    let deadline = deadline_ms(t0_ms, target_ms, grace_ms, pause_ms)?;
    match t1_ms {
        Some(t1) => {
            let latency_ms = t1.checked_sub(t0_ms)?.checked_sub(pause_ms)?;
            Some(if latency_ms > target_ms.checked_add(grace_ms)? {
                Verdict::Late { latency_ms }
            } else {
                Verdict::OnTime { latency_ms }
            })
        }
        None => Some(if now_ms > deadline {
            Verdict::NoCompletion
        } else {
            Verdict::Pending
        }),
    }
}

fn fraction(amount: i128, bps: u32) -> Option<i128> {
    if amount < 0 || bps > 10_000 {
        return None;
    }
    amount.checked_mul(i128::from(bps))?.checked_div(10_000)
}

/// Floor the proportional penalty before applying the cap (provider-favouring rounding).
pub fn penalty(amount: i128, bps: u32, cap: i128) -> Option<i128> {
    if cap < 0 {
        return None;
    }
    Some(fraction(amount, bps)?.min(cap))
}

pub fn max_penalty(max_amount: i128, bps: u32, cap: i128) -> Option<i128> {
    penalty(max_amount, bps, cap)
}

pub fn claim_bond(penalty: i128, min_bond: i128, bond_bps: u32) -> Option<i128> {
    if min_bond < 0 {
        return None;
    }
    Some(fraction(penalty, bond_bps)?.max(min_bond))
}

pub fn min_stake(floor: i128, k: u32, daily_cap: i128, bps: u32) -> Option<i128> {
    if floor < 0 || daily_cap < 0 {
        return None;
    }
    Some(fraction(i128::from(k).checked_mul(daily_cap)?, bps)?.max(floor))
}

pub fn exit_cooldown_secs(
    claim_window: u64,
    challenge: u64,
    attestation: u64,
    extra: u64,
) -> Option<u64> {
    claim_window
        .checked_add(challenge)?
        .checked_add(attestation)?
        .checked_add(extra)
}

pub fn claim_deadline_ms(deadline_ms: u64, claim_window_secs: u64) -> Option<u64> {
    deadline_ms.checked_add(claim_window_secs.checked_mul(1_000)?)
}

/// Returns the provider's base share, each observer's share, and dust added to the provider.
pub fn split_rejected_bond(
    bond: i128,
    provider_bps: u32,
    observers: u32,
) -> Option<(i128, i128, i128)> {
    let to_provider = fraction(bond, provider_bps)?;
    let remainder = bond.checked_sub(to_provider)?;
    let count = i128::from(observers);
    let per_observer = remainder.checked_div(count)?;
    let dust_to_provider = remainder.checked_rem(count)?;
    Some((to_provider, per_observer, dust_to_provider))
}

/// Primitive equivalents of the off-chain carve-out kinds; no Soroban dependency.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CarveOutKind {
    ReceiverBankHoliday,
    ComplianceHoldDeclared,
    InvalidBeneficiary,
    SenderInfoIncomplete,
}

/// A pre-validated half-open pause interval, as used by the shared VX-105 fixtures.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct CarveOutSpan {
    pub kind: CarveOutKind,
    pub from_ms: u64,
    pub to_ms: u64,
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CarveOutResult {
    pub pause_ms: u64,
    pub out_of_scope: bool,
}

fn interval(span: &CarveOutSpan, max_hold_ms: u64) -> Option<(u64, u64)> {
    if span.kind == CarveOutKind::InvalidBeneficiary {
        return None;
    }
    let duration = span.to_ms.checked_sub(span.from_ms)?;
    let duration = if span.kind == CarveOutKind::ComplianceHoldDeclared {
        duration.min(max_hold_ms)
    } else {
        duration
    };
    let end = span.from_ms.checked_add(duration)?;
    if end == span.from_ms {
        None
    } else {
        Some((span.from_ms, end))
    }
}

/// Union unsorted pause intervals without allocating. Each hold is capped before union.
/// InvalidBeneficiary excludes the payment and adds no pause. Empty or reversed intervals
/// add no duration; the observer must validate evidence before constructing these spans.
/// Repeated scans trade O(n²) work for zero allocation and no fixed capacity limit.
pub fn apply_carve_outs(events: &[CarveOutSpan], max_hold_ms: u64) -> CarveOutResult {
    let mut result = CarveOutResult {
        pause_ms: 0,
        out_of_scope: events
            .iter()
            .any(|e| e.kind == CarveOutKind::InvalidBeneficiary),
    };
    let mut cursor = 0;
    while let Some(start) = events
        .iter()
        .filter_map(|e| interval(e, max_hold_ms))
        .filter(|&(_, end)| end > cursor)
        .map(|(start, _)| start.max(cursor))
        .min()
    {
        let mut end = start;
        loop {
            let previous_end = end;
            for (from, to) in events.iter().filter_map(|e| interval(e, max_hold_ms)) {
                if from <= end {
                    end = end.max(to);
                }
            }
            if end == previous_end {
                break;
            }
        }
        // Disjoint union lengths within [0, u64::MAX] cannot overflow. Keep checked
        // arithmetic even for this invariant; the conservative fallback is the full range.
        match end
            .checked_sub(start)
            .and_then(|length| result.pause_ms.checked_add(length))
        {
            Some(total) => result.pause_ms = total,
            None => {
                return CarveOutResult {
                    pause_ms: u64::MAX,
                    ..result
                };
            }
        }
        cursor = end;
    }
    result
}
