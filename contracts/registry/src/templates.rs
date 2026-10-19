//! Immutable template versions and their activation lifecycle (guide §5.4, VX-203).
use crate::{
    DataKey, events, params, require_admin,
    storage::{touch, touch_key},
};
use soroban_sdk::{Env, Vec};
use vaeltrix_types::{Error, EventKind, Metric, PenaltyModel, SlaTemplate, TemplateStatus};
fn latest(env: &Env, id: u32) -> Option<u32> {
    let key = DataKey::TemplateLatest(id);
    let value = env.storage().persistent().get(&key);
    if value.is_some() {
        touch_key(env, &key);
    }
    value
}
pub fn ids(env: &Env) -> Vec<u32> {
    let key = DataKey::TemplateIds;
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
pub fn get(env: &Env, id: u32, version: u32) -> Result<SlaTemplate, Error> {
    let key = DataKey::Template(id, version);
    let value = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(Error::UnknownTemplate)?;
    touch_key(env, &key);
    Ok(value)
}
fn put(env: &Env, t: &SlaTemplate) {
    let key = DataKey::Template(t.id, t.version);
    env.storage().persistent().set(&key, t);
    touch_key(env, &key);
}
fn validate(env: &Env, t: &SlaTemplate) -> Result<(), Error> {
    if t.metric != Metric::TimeToCompletion
        || t.start_event != EventKind::OnChainSettled
        || t.end_event != EventKind::ReceiverCreditConfirmed
        || t.target_ms == 0
        || t.grace_ms > t.target_ms
        || t.scope.min_amount <= 0
        || t.scope.max_amount < t.scope.min_amount
        || t.claim_window_secs == 0
        || t.max_hold_ms > 172_800_000
    {
        return Err(Error::InvalidParams);
    }
    match &t.penalty {
        PenaltyModel::PerBreachBps(p) => {
            if p.bps == 0 || p.bps > 10_000 || p.cap <= 0 {
                return Err(Error::InvalidParams);
            }
        }
    }
    if !params(env)?.allowed_stake_assets.contains(&t.scope.asset) {
        return Err(Error::AssetNotAllowed);
    }
    for (i, kind) in t.carve_outs.iter().enumerate() {
        if t.carve_outs
            .iter()
            .skip(i.checked_add(1).ok_or(Error::ArithmeticOverflow)?)
            .any(|other| other == kind)
        {
            return Err(Error::InvalidParams);
        }
    }
    Ok(())
}
pub fn propose(env: &Env, mut template: SlaTemplate) -> Result<u32, Error> {
    require_admin(env)?;
    touch(env);
    let previous = latest(env, template.id);
    let expected = previous
        .unwrap_or(0)
        .checked_add(1)
        .ok_or(Error::ArithmeticOverflow)?;
    if template.version != expected {
        return Err(Error::TemplateExists);
    }
    validate(env, &template)?;
    template.status = TemplateStatus::Proposed;
    template.activates_at = env
        .ledger()
        .timestamp()
        .checked_add(params(env)?.timelock_secs)
        .ok_or(Error::ArithmeticOverflow)?;
    let mut all = ids(env);
    if previous.is_none() {
        all.push_back(template.id);
    }
    put(env, &template);
    let key = DataKey::TemplateLatest(template.id);
    env.storage().persistent().set(&key, &template.version);
    touch_key(env, &key);
    env.storage().persistent().set(&DataKey::TemplateIds, &all);
    touch_key(env, &DataKey::TemplateIds);
    events::TemplateProposed {
        template_id: template.id,
        version: template.version,
        activates_at: template.activates_at,
    }
    .publish(env);
    Ok(template.version)
}
pub fn activate(env: &Env, id: u32, version: u32) -> Result<(), Error> {
    touch(env);
    let mut t = get(env, id, version)?;
    if t.status != TemplateStatus::Proposed {
        return Err(Error::TemplateNotActive);
    }
    if env.ledger().timestamp() < t.activates_at {
        return Err(Error::TimelockActive);
    }
    t.status = TemplateStatus::Active;
    put(env, &t);
    events::TemplateActivated {
        template_id: id,
        version,
    }
    .publish(env);
    Ok(())
}
pub fn cancel(env: &Env, id: u32, version: u32) -> Result<(), Error> {
    require_admin(env)?;
    touch(env);
    let mut t = get(env, id, version)?;
    if t.status != TemplateStatus::Proposed {
        return Err(Error::TemplateNotActive);
    }
    t.status = TemplateStatus::Deprecated;
    put(env, &t);
    events::TemplateCancelled {
        template_id: id,
        version,
    }
    .publish(env);
    Ok(())
}
pub fn deprecate(env: &Env, id: u32, version: u32) -> Result<(), Error> {
    require_admin(env)?;
    touch(env);
    let mut t = get(env, id, version)?;
    t.status = TemplateStatus::Deprecated;
    put(env, &t);
    events::TemplateDeprecated {
        template_id: id,
        version,
    }
    .publish(env);
    Ok(())
}
pub fn active(env: &Env, id: u32) -> Result<SlaTemplate, Error> {
    let mut version = latest(env, id).ok_or(Error::TemplateNotActive)?;
    while version > 0 {
        if env
            .storage()
            .persistent()
            .has(&DataKey::Template(id, version))
        {
            let template = get(env, id, version)?;
            if template.status == TemplateStatus::Active {
                return Ok(template);
            }
        }
        version = version.checked_sub(1).ok_or(Error::ArithmeticOverflow)?;
    }
    Err(Error::TemplateNotActive)
}
