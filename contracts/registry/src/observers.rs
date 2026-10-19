//! Timelocked observer membership and role independence (guide §5.5, VX-204).
use crate::{DataKey, events, providers, storage::touch_key};
use soroban_sdk::{Address, BytesN, Env, Vec};
use vaeltrix_types::{Error, Observer};
fn addresses(env: &Env) -> Vec<Address> {
    let key = DataKey::ObserverList;
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
fn get(env: &Env, address: &Address) -> Option<Observer> {
    let key = DataKey::Observer(address.clone());
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        touch_key(env, &key);
    }
    value
}
fn put(env: &Env, observer: &Observer) {
    let key = DataKey::Observer(observer.address.clone());
    env.storage().persistent().set(&key, observer);
    touch_key(env, &key);
}
pub fn is_active(env: &Env, address: &Address) -> bool {
    get(env, address).is_some_and(|o| o.active)
}
pub fn all(env: &Env) -> Vec<Observer> {
    let mut result = Vec::new(env);
    for address in addresses(env) {
        if let Some(observer) = get(env, &address) {
            result.push_back(observer);
        }
    }
    result
}
pub fn count(env: &Env) -> Result<u32, Error> {
    let mut count = 0_u32;
    for observer in all(env) {
        if observer.active {
            count = count.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
        }
    }
    Ok(count)
}
pub fn add(env: &Env, address: &Address, key: &BytesN<32>) -> Result<(), Error> {
    // Recheck independence at execution: a provider may register during the timelock.
    if !providers::by_admin(env, address).is_empty() || is_active(env, address) {
        return Err(Error::InvalidParams);
    }
    let mut list = addresses(env);
    if !list.contains(address) {
        if list.len() >= 32 {
            return Err(Error::InvalidParams);
        }
        list.push_back(address.clone());
    }
    let observer = Observer {
        address: address.clone(),
        key: key.clone(),
        active: true,
        added_at: env.ledger().timestamp(),
    };
    put(env, &observer);
    env.storage()
        .persistent()
        .set(&DataKey::ObserverList, &list);
    touch_key(env, &DataKey::ObserverList);
    events::ObserverAdded {
        observer: address.clone(),
        key: key.clone(),
    }
    .publish(env);
    Ok(())
}
pub fn remove(env: &Env, address: &Address) -> Result<(), Error> {
    let mut observer = get(env, address).ok_or(Error::UnknownObserver)?;
    if !observer.active || !addresses(env).contains(address) {
        return Err(Error::UnknownObserver);
    }
    observer.active = false;
    put(env, &observer);
    // Keep the record and its one list entry so historical attribution survives removal.
    events::ObserverRemoved {
        observer: address.clone(),
    }
    .publish(env);
    Ok(())
}
