//! Exact SHA-256 identifier recipes (guide §2 D4, VX-103).
use soroban_sdk::{Address, Bytes, BytesN, Env, String, xdr::ToXdr};

pub fn provider_id(env: &Env, home_domain: &String, admin: &Address) -> BytesN<32> {
    let mut message = Bytes::from_slice(env, b"VAELTRIX:PROVIDER:v1");
    // Home domains are DNS names: fold ASCII capitals; preserve UTF-8 bytes.
    for byte in home_domain.to_bytes().iter() {
        message.push_back(byte.to_ascii_lowercase());
    }
    // ToXdr serializes an ScVal::Address. D4 requires its inner ScAddress:
    // omit the four-byte ScVal discriminant, retaining both address variants.
    message.append(&admin.to_xdr(env).slice(4..));
    env.crypto().sha256(&message).into()
}

pub fn payment_id(env: &Env, sep31_tx_id: &String, provider_id: &BytesN<32>) -> BytesN<32> {
    let mut message = Bytes::from_slice(env, b"VAELTRIX:PAYMENT:v1");
    message.append(&sep31_tx_id.to_bytes());
    message.append(&Bytes::from(provider_id));
    env.crypto().sha256(&message).into()
}
