//! Off-chain audit implementation of the period Merkle tree (guide §7.4).

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

const MAX_JSON_INTEGER: u64 = 9_007_199_254_740_991;

/// Fixed fields in JCS key order. Only strings, safe integers, booleans and null
/// can occur in the serialized record, so compact serde JSON gives JCS bytes.
#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct Record {
    pub amount: String,
    pub breach: bool,
    pub carve_out: Option<String>,
    pub pause_ms: u64,
    pub payment_id: String,
    pub t0_ms: u64,
    pub t1_ms: Option<u64>,
}

#[derive(Debug, PartialEq, Eq)]
pub enum Error {
    InvalidPaymentId,
    DuplicatePaymentId,
    InvalidAmount,
    UnsafeTime,
    Serialization,
}

fn leaf(record: &Record) -> Result<[u8; 32], Error> {
    if record.payment_id.len() != 64
        || !record
            .payment_id
            .bytes()
            .all(|byte| matches!(byte, b'0'..=b'9' | b'a'..=b'f'))
    {
        return Err(Error::InvalidPaymentId);
    }
    if !record.amount.bytes().all(|byte| byte.is_ascii_digit())
        || record.amount.parse::<i128>().is_err()
    {
        return Err(Error::InvalidAmount);
    }
    if [Some(record.t0_ms), record.t1_ms, Some(record.pause_ms)]
        .into_iter()
        .flatten()
        .any(|time| time > MAX_JSON_INTEGER)
    {
        return Err(Error::UnsafeTime);
    }
    let bytes = serde_json::to_vec(record).map_err(|_| Error::Serialization)?;
    let mut hash = Sha256::new();
    hash.update([0]);
    hash.update(bytes);
    Ok(hash.finalize().into())
}

/// Returns the raw 32-byte root, or zero bytes for an empty period.
pub fn merkle_root(records: &[Record]) -> Result<[u8; 32], Error> {
    let mut sorted: Vec<_> = records.iter().collect();
    sorted.sort_unstable_by(|a, b| a.payment_id.as_bytes().cmp(b.payment_id.as_bytes()));
    let mut previous = None;
    let mut level = Vec::with_capacity(sorted.len());
    for record in sorted {
        if previous == Some(&record.payment_id) {
            return Err(Error::DuplicatePaymentId);
        }
        previous = Some(&record.payment_id);
        level.push(leaf(record)?);
    }
    while level.len() > 1 {
        level = level
            .chunks(2)
            .filter_map(|pair| match pair {
                [left, right] => {
                    let mut hash = Sha256::new();
                    hash.update([1]);
                    hash.update(left);
                    hash.update(right);
                    Some(hash.finalize().into())
                }
                [odd] => Some(*odd),
                _ => None,
            })
            .collect();
    }
    Ok(level.first().copied().unwrap_or_default())
}
