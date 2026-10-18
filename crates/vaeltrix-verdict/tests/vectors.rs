//! Loads `test-vectors/verdict.json` (guide §4.6), the same file the TypeScript
//! suite in `packages/core/test/vectors.test.ts` loads. VX-104/VX-105 add the
//! per-function dispatch and assertions; this harness proves the file is wired.
#![allow(clippy::panic)]

const VERDICT: &str = include_str!("../../../test-vectors/verdict.json");
const RECEIPTS: &str = include_str!("../../../test-vectors/receipts.json");

fn cases(src: &str, file: &str) -> Vec<serde_json::Value> {
    let parsed: Vec<serde_json::Value> =
        serde_json::from_str(src).unwrap_or_else(|e| panic!("{file} is not a JSON array: {e}"));
    for case in &parsed {
        assert!(case.is_object(), "every case in {file} is an object");
    }
    parsed
}

#[test]
fn verdict_vectors_parse() {
    let _ = cases(VERDICT, "verdict.json");
}

#[test]
fn receipt_vectors_parse() {
    let _ = cases(RECEIPTS, "receipts.json");
}
