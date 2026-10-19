//! Provider identity and metadata (guide §5.3, VX-202).
use crate::{
    DataKey, events, require_admin,
    storage::{touch, touch_key},
};
use soroban_sdk::{Address, BytesN, Env, String, Symbol, Vec};
use vaeltrix_types::{Error, Provider, ProviderStatus, provider_id};

fn validate_signers(signers: &Vec<BytesN<32>>) -> Result<(), Error> {
    if signers.is_empty() {
        return Err(Error::InvalidParams);
    }
    if signers.len() > 5 {
        return Err(Error::TooManySigners);
    }
    for (i, signer) in signers.iter().enumerate() {
        if signers
            .iter()
            .skip(i.checked_add(1).ok_or(Error::ArithmeticOverflow)?)
            .any(|s| s == signer)
        {
            return Err(Error::InvalidParams);
        }
    }
    Ok(())
}
pub fn get(env: &Env, id: &BytesN<32>) -> Result<Provider, Error> {
    let key = DataKey::Provider(id.clone());
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::UnknownProvider)?;
    touch_key(env, &key);
    Ok(value)
}
fn put(env: &Env, provider: &Provider) {
    let key = DataKey::Provider(provider.id.clone());
    env.storage().persistent().set(&key, provider);
    touch_key(env, &key);
}
pub fn by_admin(env: &Env, admin: &Address) -> Vec<BytesN<32>> {
    let key = DataKey::ProviderByAdmin(admin.clone());
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    if env.storage().persistent().has(&key) {
        touch_key(env, &key);
    }
    value
}
pub fn register(
    env: &Env,
    admin: Address,
    home_domain: String,
    signers: Vec<BytesN<32>>,
    metadata_uri: String,
) -> Result<BytesN<32>, Error> {
    admin.require_auth();
    touch(env);
    if home_domain.is_empty()
        || home_domain.len() > 253
        || home_domain.to_bytes().last() == Some(b'.')
        || home_domain
            .to_bytes()
            .iter()
            .any(|b| !(b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'.' || b == b'-'))
        || metadata_uri.len() > 256
    {
        return Err(Error::InvalidParams);
    }
    validate_signers(&signers)?;
    // VX-204: role independence must also hold when an observer registers a provider.
    if crate::observers::is_active(env, &admin) {
        return Err(Error::InvalidParams);
    }
    let id = provider_id(env, &home_domain, &admin);
    if env
        .storage()
        .persistent()
        .has(&DataKey::Provider(id.clone()))
    {
        return Err(Error::ProviderExists);
    }
    let provider = Provider {
        id: id.clone(),
        admin: admin.clone(),
        signers,
        home_domain: home_domain.clone(),
        metadata_uri,
        verified: false,
        status: ProviderStatus::Active,
        registered_at: env.ledger().timestamp(),
    };
    let mut ids = by_admin(env, &admin);
    ids.push_back(id.clone());
    put(env, &provider);
    let key = DataKey::ProviderByAdmin(admin.clone());
    env.storage().persistent().set(&key, &ids);
    touch_key(env, &key);
    events::ProviderRegistered {
        provider_id: id.clone(),
        admin,
        home_domain,
    }
    .publish(env);
    Ok(id)
}
pub fn update_signers(env: &Env, id: BytesN<32>, signers: Vec<BytesN<32>>) -> Result<(), Error> {
    let mut provider = get(env, &id)?;
    provider.admin.require_auth();
    touch(env);
    validate_signers(&signers)?;
    provider.signers = signers.clone();
    put(env, &provider);
    events::ProviderSigners {
        provider_id: id,
        new_value: signers,
    }
    .publish(env);
    Ok(())
}
pub fn update_metadata(env: &Env, id: BytesN<32>, metadata_uri: String) -> Result<(), Error> {
    let mut provider = get(env, &id)?;
    provider.admin.require_auth();
    touch(env);
    if metadata_uri.len() > 256 {
        return Err(Error::InvalidParams);
    }
    provider.metadata_uri = metadata_uri.clone();
    put(env, &provider);
    events::ProviderMetadata {
        provider_id: id,
        new_value: metadata_uri,
    }
    .publish(env);
    Ok(())
}
pub fn verify(env: &Env, id: BytesN<32>, verified: bool) -> Result<(), Error> {
    let verifier: Address = env
        .storage()
        .instance()
        .get(&DataKey::Verifier)
        .ok_or(Error::NotInitialized)?;
    verifier.require_auth();
    touch(env);
    let mut provider = get(env, &id)?;
    provider.verified = verified;
    put(env, &provider);
    if verified {
        events::ProviderVerified { provider_id: id }.publish(env);
    } else {
        events::ProviderUnverified { provider_id: id }.publish(env);
    }
    Ok(())
}
pub fn suspend(env: &Env, id: BytesN<32>, reason: Symbol) -> Result<(), Error> {
    require_admin(env)?;
    touch(env);
    let mut provider = get(env, &id)?;
    provider.status = ProviderStatus::Suspended;
    put(env, &provider);
    events::ProviderSuspended {
        provider_id: id,
        reason,
    }
    .publish(env);
    Ok(())
}
pub fn reinstate(env: &Env, id: BytesN<32>) -> Result<(), Error> {
    require_admin(env)?;
    touch(env);
    let mut provider = get(env, &id)?;
    provider.status = ProviderStatus::Active;
    put(env, &provider);
    events::ProviderReinstated { provider_id: id }.publish(env);
    Ok(())
}
