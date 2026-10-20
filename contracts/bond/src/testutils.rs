//! Local bond fixtures. The full three-contract World remains VX-310.
use soroban_sdk::{Address, Env, Vec, testutils::Address as _};
use vaeltrix_types::Params;
pub fn params(env: &Env) -> Params {
    Params {
        timelock_secs: 60,
        challenge_window_secs: 180,
        attestation_window_secs: 300,
        exit_extra_secs: 120,
        quorum: 1,
        min_claim_bond: 10_000_000,
        claim_bond_bps: 1_000,
        rejected_bond_provider_bps: 5_000,
        stake_floor: 1_000_000_000,
        stake_k: 3,
        max_stake_per_commitment: 100_000_000_000,
        allowed_stake_assets: Vec::from_array(env, [Address::generate(env)]),
    }
}

pub fn template(env: &Env, registry: &Address) -> vaeltrix_types::SlaTemplate {
    use vaeltrix_types::{
        CarveOut, Direction, EventKind, EvidenceMode, Metric, PenaltyModel, PerBreachBps, Scope,
        SlaTemplate, TemplateStatus,
    };
    SlaTemplate {
        id: 901,
        version: 1,
        metric: Metric::TimeToCompletion,
        start_event: EventKind::OnChainSettled,
        end_event: EventKind::ReceiverCreditConfirmed,
        target_ms: 120_000,
        grace_ms: 10_000,
        penalty: PenaltyModel::PerBreachBps(PerBreachBps {
            bps: 500,
            cap: 1_000_000_000,
        }),
        scope: Scope {
            asset: vaeltrix_registry::RegistryClient::new(env, registry)
                .params()
                .allowed_stake_assets
                .get(0)
                .unwrap(),
            direction: Direction::Inbound,
            sender_country: None,
            receiver_country: None,
            min_amount: 1,
            max_amount: 100_000_000_000,
            payout_rail: None,
        },
        carve_outs: Vec::from_array(env, [CarveOut::ComplianceHoldDeclared]),
        max_hold_ms: 60_000,
        claim_window_secs: 600,
        evidence_mode: EvidenceMode::ObserverOnly,
        status: TemplateStatus::Active,
        activates_at: 0,
    }
}

// VX-302 local stake fixture; VX-310 adds the full claim/invariant World.
pub struct StakeWorld {
    pub env: Env,
    pub id: Address,
    pub registry: Address,
    pub owner: Address,
    pub provider: soroban_sdk::BytesN<32>,
    pub asset: Address,
}
impl StakeWorld {
    pub fn new() -> Self {
        use soroban_sdk::{BytesN, String, testutils::Ledger, token};
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let owner = Address::generate(&env);
        let asset = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let mut p = params(&env);
        p.allowed_stake_assets = Vec::from_array(&env, [asset.clone()]);
        let registry = env.register(vaeltrix_registry::Registry, (admin.clone(), p));
        let r = vaeltrix_registry::RegistryClient::new(&env, &registry);
        let provider = r.register_provider(
            &owner,
            &String::from_str(&env, "anchor.example"),
            &Vec::from_array(&env, [BytesN::from_array(&env, &[1; 32])]),
            &String::from_str(&env, ""),
        );
        r.verify_domain(&provider);
        r.propose_template(&template(&env, &registry));
        env.ledger().with_mut(|l| l.timestamp = 60);
        r.activate_template(&901, &1);
        let id = env.register(
            crate::Bond,
            (admin.clone(), registry.clone(), Address::generate(&env)),
        );
        token::StellarAssetClient::new(&env, &asset).mint(&owner, &1_000_000_000_000);
        Self {
            env,
            id,
            registry,
            owner,
            provider,
            asset,
        }
    }
}
