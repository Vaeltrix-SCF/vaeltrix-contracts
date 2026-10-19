//! VX-104: dispatch every shared verdict vector against the production rules.
#![allow(clippy::unwrap_used, clippy::panic)]
use serde_json::{Value, json};
use vaeltrix_verdict::*;

fn u(value: &Value) -> u64 {
    value
        .as_u64()
        .unwrap_or_else(|| value.as_str().unwrap().parse().unwrap())
}
fn i(value: &Value) -> i128 {
    value.as_str().unwrap().parse().unwrap()
}
fn n(value: &Value) -> u32 {
    u32::try_from(u(value)).unwrap()
}
fn amount(value: Option<i128>) -> Value {
    value.map_or(Value::Null, |v| json!(v.to_string()))
}
fn time(value: Option<u64>) -> Value {
    value.map_or(Value::Null, |v| {
        if v <= 9_007_199_254_740_991 {
            json!(v)
        } else {
            json!(v.to_string())
        }
    })
}

#[test]
fn all_shared_verdict_vectors_match() {
    let cases: Vec<Value> =
        serde_json::from_str(include_str!("../../../test-vectors/verdict.json")).unwrap();
    assert!(cases.len() >= 40);
    for case in cases {
        let x = &case["input"];
        let actual = match case["fn"].as_str().unwrap() {
            "deadline_ms" => time(deadline_ms(u(&x["t0_ms"]), u(&x["target_ms"]), u(&x["grace_ms"]), u(&x["pause_ms"]))),
            "evaluate" => evaluate(u(&x["t0_ms"]), if x["t1_ms"].is_null() { None } else { Some(u(&x["t1_ms"])) }, u(&x["now_ms"]), u(&x["target_ms"]), u(&x["grace_ms"]), u(&x["pause_ms"])).map_or(Value::Null, |v| match v {
                Verdict::Pending => json!({"verdict":"Pending"}), Verdict::NoCompletion => json!({"verdict":"NoCompletion"}),
                Verdict::OnTime {latency_ms} => json!({"verdict":"OnTime","latency_ms": time(Some(latency_ms))}),
                Verdict::Late {latency_ms} => json!({"verdict":"Late","latency_ms": time(Some(latency_ms))}),
            }),
            "penalty" => amount(penalty(i(&x["amount"]), n(&x["bps"]), i(&x["cap"]))),
            "max_penalty" => amount(max_penalty(i(&x["max_amount"]), n(&x["bps"]), i(&x["cap"]))),
            "claim_bond" => amount(claim_bond(i(&x["penalty"]), i(&x["min_bond"]), n(&x["bond_bps"]))),
            "min_stake" => amount(min_stake(i(&x["floor"]), n(&x["k"]), i(&x["daily_cap"]), n(&x["bps"]))),
            "exit_cooldown_secs" => time(exit_cooldown_secs(u(&x["claim_window"]), u(&x["challenge"]), u(&x["attestation"]), u(&x["extra"]))),
            "claim_deadline_ms" => time(claim_deadline_ms(u(&x["deadline_ms"]), u(&x["claim_window_secs"]))),
            "split_rejected_bond" => split_rejected_bond(i(&x["bond"]), n(&x["provider_bps"]), n(&x["observers"])).map_or(Value::Null, |(provider, observer, dust)| json!({"to_provider":provider.to_string(),"per_observer":observer.to_string(),"dust_to_provider":dust.to_string()})),
            "apply_carve_outs" => {
                let events: Vec<CarveOutSpan> = x["events"].as_array().unwrap().iter().map(|e| CarveOutSpan {
                    kind: match e["kind"].as_str().unwrap() {
                        "ReceiverBankHoliday" => CarveOutKind::ReceiverBankHoliday,
                        "ComplianceHoldDeclared" => CarveOutKind::ComplianceHoldDeclared,
                        "InvalidBeneficiary" => CarveOutKind::InvalidBeneficiary,
                        "SenderInfoIncomplete" => CarveOutKind::SenderInfoIncomplete,
                        other => panic!("unknown carve-out kind: {other}"),
                    }, from_ms: u(&e["from_ms"]), to_ms: u(&e["to_ms"]),
                }).collect();
                let result = apply_carve_outs(&events, u(&x["max_hold_ms"]));
                json!({"pause_ms":time(Some(result.pause_ms)),"out_of_scope":result.out_of_scope})
            },
            other => panic!("unhandled vector function: {other}"),
        };
        assert_eq!(actual, case["expect"], "{}", case["name"]);
    }
}

#[test]
fn receipt_vectors_parse() {
    let receipts: Vec<Value> =
        serde_json::from_str(include_str!("../../../test-vectors/receipts.json")).unwrap();
    assert!(receipts.len() >= 3);
}
