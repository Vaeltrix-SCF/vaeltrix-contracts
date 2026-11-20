#![allow(clippy::unwrap_used)]

use serde::Deserialize;
use vaeltrix_merkle_reference::{Record, merkle_root};

#[derive(Deserialize)]
struct Case {
    name: String,
    records: Vec<Record>,
    root: String,
}

#[test]
fn shared_merkle_vectors() {
    let cases: Vec<Case> =
        serde_json::from_str(include_str!("../../../test-vectors/merkle.json")).unwrap();
    assert!(!cases.is_empty());
    for case in cases {
        let actual: String = merkle_root(&case.records)
            .unwrap()
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect();
        assert_eq!(actual, case.root, "{}", case.name);
    }
}
