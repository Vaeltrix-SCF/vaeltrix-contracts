//! VX-104 edge cases beyond the shared cross-language fixtures.
#![allow(clippy::arithmetic_side_effects, clippy::unwrap_used)]
use vaeltrix_verdict::*;

#[test]
fn penalty_rounds_down_in_the_providers_favour() {
    assert_eq!(penalty(19_999, 50, 1_000), Some(99));
    assert_eq!(penalty(1, 9_999, 1_000), Some(0));
    assert_eq!(max_penalty(19_999, 50, 1_000), Some(99));
}

#[test]
fn monetary_inputs_fail_closed_for_negatives_bad_bps_and_overflow() {
    for value in [-1, i128::MIN] {
        assert_eq!(penalty(value, 50, 100), None);
        assert_eq!(penalty(100, 50, value), None);
        assert_eq!(claim_bond(value, 10, 1_000), None);
        assert_eq!(claim_bond(100, value, 1_000), None);
        assert_eq!(min_stake(value, 3, 100, 50), None);
        assert_eq!(min_stake(100, 3, value, 50), None);
        assert_eq!(split_rejected_bond(value, 5_000, 1), None);
    }
    assert_eq!(penalty(100, 10_001, 100), None);
    assert_eq!(claim_bond(100, 1, 10_001), None);
    assert_eq!(min_stake(1, 3, 100, 10_001), None);
    assert_eq!(split_rejected_bond(100, 10_001, 1), None);
    assert_eq!(penalty(i128::MAX, 2, 1), None);
    assert_eq!(claim_bond(i128::MAX, 1, 2), None);
    assert_eq!(min_stake(1, 2, i128::MAX, 1), None);
    assert_eq!(min_stake(1, 1, i128::MAX, 2), None);
    assert_eq!(split_rejected_bond(i128::MAX, 2, 1), None);
    assert_eq!(split_rejected_bond(100, 5_000, 0), None);
}

#[test]
fn rejected_bond_split_conserves_every_stroop() {
    for bond in 0..=101 {
        for observers in 1..=5 {
            for bps in [0, 1, 5_000, 9_999, 10_000] {
                let (provider, per_observer, dust) =
                    split_rejected_bond(bond, bps, observers).unwrap();
                assert_eq!(provider + per_observer * i128::from(observers) + dust, bond);
                assert!(dust >= 0 && dust < i128::from(observers));
            }
        }
    }
}

#[test]
fn temporal_arithmetic_checks_all_additions_and_multiplications() {
    assert_eq!(deadline_ms(0, u64::MAX, 1, 0), None);
    assert_eq!(deadline_ms(0, 0, u64::MAX, 1), None);
    assert_eq!(exit_cooldown_secs(0, 0, u64::MAX, 1), None);
    assert_eq!(claim_deadline_ms(u64::MAX, 1), None);
    assert_eq!(claim_deadline_ms(0, u64::MAX), None);
    assert_eq!(evaluate(2, Some(1), 10, 1, 0, 0), None);
    assert_eq!(evaluate(0, Some(1), 10, 1, 0, 2), None);
    assert_eq!(
        evaluate(0, Some(0), 0, 0, 0, 0),
        Some(Verdict::OnTime { latency_ms: 0 })
    );
}

fn span(kind: CarveOutKind, from_ms: u64, to_ms: u64) -> CarveOutSpan {
    CarveOutSpan {
        kind,
        from_ms,
        to_ms,
    }
}

#[test]
fn carve_out_union_is_order_independent_and_never_double_counts() {
    let a = span(CarveOutKind::ReceiverBankHoliday, 1, 7);
    let b = span(CarveOutKind::SenderInfoIncomplete, 5, 9);
    let c = span(CarveOutKind::ReceiverBankHoliday, 3, 4);
    let d = span(CarveOutKind::SenderInfoIncomplete, 12, 14);
    for events in [[a, b, c, d], [d, c, b, a], [b, d, a, c], [c, a, d, b]] {
        assert_eq!(
            apply_carve_outs(&events, 100),
            CarveOutResult {
                pause_ms: 10,
                out_of_scope: false
            }
        );
    }
    assert_eq!(apply_carve_outs(&[a, a, a], 100).pause_ms, 6);
}

#[test]
fn compliance_cap_is_applied_before_merging_with_other_pauses() {
    let hold = span(CarveOutKind::ComplianceHoldDeclared, 10, 100);
    let holiday = span(CarveOutKind::ReceiverBankHoliday, 20, 40);
    assert_eq!(apply_carve_outs(&[holiday, hold], 15).pause_ms, 30);
    assert_eq!(apply_carve_outs(&[hold], 0).pause_ms, 0);
    let invalid = span(CarveOutKind::InvalidBeneficiary, 0, u64::MAX);
    assert_eq!(
        apply_carve_outs(&[invalid, hold], 15),
        CarveOutResult {
            pause_ms: 15,
            out_of_scope: true
        }
    );
}

#[test]
fn carve_outs_handle_the_full_u64_range_and_empty_spans_without_panicking() {
    let full = span(CarveOutKind::ReceiverBankHoliday, 0, u64::MAX);
    let near_end = span(
        CarveOutKind::ComplianceHoldDeclared,
        u64::MAX - 10,
        u64::MAX,
    );
    assert_eq!(apply_carve_outs(&[near_end], u64::MAX).pause_ms, 10);
    assert_eq!(
        apply_carve_outs(&[near_end, full, full], u64::MAX).pause_ms,
        u64::MAX
    );
    assert_eq!(
        apply_carve_outs(
            &[
                span(CarveOutKind::ReceiverBankHoliday, 10, 5),
                span(CarveOutKind::SenderInfoIncomplete, 1, 1)
            ],
            100
        )
        .pause_ms,
        0
    );
}
