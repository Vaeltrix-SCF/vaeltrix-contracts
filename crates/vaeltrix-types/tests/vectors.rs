//! Loads `test-vectors/ids.json` (guide §4.6). VX-103 adds the per-case
//! assertions against the `ids` helpers; this harness only proves the file is
//! wired in and well-formed.

const IDS: &str = include_str!("../../../test-vectors/ids.json");

#[test]
fn ids_vectors_parse() {
    let cases: Vec<serde_json::Value> =
        serde_json::from_str(IDS).expect("ids.json is a JSON array");
    for case in &cases {
        assert!(case.is_object(), "every vector case is an object");
    }
}
