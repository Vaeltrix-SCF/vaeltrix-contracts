//! Commitment creation and token custody (guide §6.4–6.5, VX-302).
use crate::{
    DataKey, events,
    storage::{address, commitment, put_commitment, touch_key},
};
use soroban_sdk::{Address, BytesN, Env, Vec, contractclient, token};
use vaeltrix_types::{
    Commitment, CommitmentStatus, Error, MAX_PAUSE_MS, PenaltyModel, Provider, ProviderStatus,
    RegistryClient, SlaTemplate,
};
// The registry's existing latest-active view is separate from the shared read client.
#[contractclient(name = "TemplateClient")]
pub trait TemplateApi {
    fn get_template(env: Env, id: u32) -> SlaTemplate;
}
pub fn registry(env: &Env) -> Result<RegistryClient<'_>, Error> {
    Ok(RegistryClient::new(env, &address(env, &DataKey::Registry)?))
}
pub fn provider(env: &Env, c: &Commitment) -> Result<Provider, Error> {
    Ok(registry(env)?.get_provider(&c.provider_id))
}
pub fn template_penalty(t: &SlaTemplate) -> Result<i128, Error> {
    let PenaltyModel::PerBreachBps(p) = &t.penalty;
    vaeltrix_verdict::max_penalty(t.scope.max_amount, p.bps, p.cap).ok_or(Error::ArithmeticOverflow)
}
pub fn by_provider(env: &Env, id: &BytesN<32>) -> Vec<u64> {
    let key = DataKey::CommitmentsByProvider(id.clone());
    let v = env
        .storage()
        .persistent()
        .get(&key)
        .unwrap_or(Vec::new(env));
    if env.storage().persistent().has(&key) {
        touch_key(env, &key);
    }
    v
}
pub fn commit(
    env: &Env,
    provider_id: BytesN<32>,
    template_id: u32,
    stake_asset: Address,
    amount: i128,
    max_volume_per_period: i128,
    period_secs: u64,
) -> Result<u64, Error> {
    let r = registry(env)?;
    let p = r.get_provider(&provider_id);
    p.admin.require_auth();
    if p.status != ProviderStatus::Active {
        return Err(Error::ProviderNotActive);
    }
    if !p.verified {
        return Err(Error::ProviderNotVerified);
    }
    let t = TemplateClient::new(env, &address(env, &DataKey::Registry)?).get_template(&template_id);
    let params = r.params();
    if stake_asset != t.scope.asset {
        return Err(Error::AssetMismatch);
    }
    if !params.allowed_stake_assets.contains(&stake_asset) {
        return Err(Error::AssetNotAllowed);
    }
    if max_volume_per_period < 0 || (max_volume_per_period > 0 && period_secs == 0) {
        return Err(Error::InvalidParams);
    }
    let daily_cap = if max_volume_per_period == 0 {
        0
    } else {
        max_volume_per_period
            .checked_mul(86_400)
            .and_then(|v| v.checked_div(i128::from(period_secs)))
            .ok_or(Error::ArithmeticOverflow)?
    };
    let PenaltyModel::PerBreachBps(penalty) = &t.penalty;
    let min_stake =
        vaeltrix_verdict::min_stake(params.stake_floor, params.stake_k, daily_cap, penalty.bps)
            .ok_or(Error::ArithmeticOverflow)?;
    if amount < min_stake {
        return Err(Error::BelowMinStake);
    }
    if amount < template_penalty(&t)? {
        return Err(Error::InsufficientStake);
    }
    if params.max_stake_per_commitment != 0 && amount > params.max_stake_per_commitment {
        return Err(Error::StakeCapExceeded);
    }
    let ms = t
        .target_ms
        .checked_add(t.grace_ms)
        .and_then(|v| v.checked_add(MAX_PAUSE_MS))
        .ok_or(Error::ArithmeticOverflow)?;
    let seconds = (ms / 1000)
        .checked_add(u64::from(ms % 1000 != 0))
        .ok_or(Error::ArithmeticOverflow)?;
    let window = t
        .claim_window_secs
        .checked_add(seconds)
        .ok_or(Error::ArithmeticOverflow)?;
    let cooldown = vaeltrix_verdict::exit_cooldown_secs(
        window,
        params.challenge_window_secs,
        params.attestation_window_secs,
        params.exit_extra_secs,
    )
    .ok_or(Error::ArithmeticOverflow)?;
    let id: u64 = env
        .storage()
        .instance()
        .get(&DataKey::NextCommitmentId)
        .ok_or(Error::NotInitialized)?;
    let next = id.checked_add(1).ok_or(Error::ArithmeticOverflow)?;
    token::Client::new(env, &stake_asset).transfer(
        &p.admin,
        env.current_contract_address(),
        &amount,
    );
    let c = Commitment {
        id,
        provider_id: provider_id.clone(),
        template_id,
        template_version: t.version,
        stake_asset: stake_asset.clone(),
        stake_total: amount,
        stake_reserved: 0,
        min_stake,
        max_volume_per_period,
        period_secs,
        effective_from: env.ledger().timestamp(),
        effective_to: None,
        paused_at: None,
        resumed_at: None,
        exit_requested_at: None,
        exit_cooldown_secs: cooldown,
        open_claims: 0,
        status: CommitmentStatus::Active,
    };
    put_commitment(env, &c);
    let mut ids = by_provider(env, &provider_id);
    ids.push_back(id);
    let key = DataKey::CommitmentsByProvider(provider_id.clone());
    env.storage().persistent().set(&key, &ids);
    touch_key(env, &key);
    env.storage()
        .instance()
        .set(&DataKey::NextCommitmentId, &next);
    events::Committed {
        commitment_id: id,
        provider_id,
        template_id,
        version: t.version,
        stake_asset,
        amount,
    }
    .publish(env);
    Ok(id)
}
pub fn change(env: &Env, id: u64, amount: i128, add: bool) -> Result<(), Error> {
    let mut c = commitment(env, id)?;
    let p = provider(env, &c)?;
    p.admin.require_auth();
    if c.status != CommitmentStatus::Active && c.status != CommitmentStatus::Paused {
        return Err(Error::CommitmentNotActive);
    }
    if amount <= 0 {
        return Err(Error::InvalidParams);
    }
    let delta = if add {
        amount
    } else {
        amount.checked_neg().ok_or(Error::ArithmeticOverflow)?
    };
    let total = c
        .stake_total
        .checked_add(delta)
        .ok_or(Error::ArithmeticOverflow)?;
    if add {
        if p.status != ProviderStatus::Active {
            return Err(Error::ProviderNotActive);
        }
        let cap = registry(env)?.params().max_stake_per_commitment;
        if cap != 0 && total > cap {
            return Err(Error::StakeCapExceeded);
        }
    } else if total
        .checked_sub(c.stake_reserved)
        .ok_or(Error::ArithmeticOverflow)?
        < c.min_stake
    {
        return Err(Error::InsufficientStake);
    }
    c.stake_total = total;
    put_commitment(env, &c);
    let contract = env.current_contract_address();
    let (from, to) = if add {
        (&p.admin, &contract)
    } else {
        (&contract, &p.admin)
    };
    token::Client::new(env, &c.stake_asset).transfer(from, to, &amount);
    events::StakeChanged {
        commitment_id: id,
        delta,
        new_total: total,
    }
    .publish(env);
    Ok(())
}
