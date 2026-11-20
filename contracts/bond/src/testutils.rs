//! Shared three-contract World (VX-310, guide §9.1) and local bond fixtures.
#![allow(clippy::unwrap_used, clippy::arithmetic_side_effects, dead_code)]
extern crate std;
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

use crate::{BondClient, DataKey};
use ed25519_dalek::{Signer, SigningKey};
use soroban_sdk::{
    BytesN, String,
    testutils::Ledger,
    token::{Client as TokenClient, StellarAssetClient},
};
use vaeltrix_registry::{ActionKind, RegistryClient};
use vaeltrix_scoreboard::ScoreboardClient;
use vaeltrix_types::{
    Claim, ClaimStatus, Commitment, CommitmentStatus, CompletionReceipt, PaymentRef,
};

pub struct World<'a> {
    pub env: Env,
    pub admin: Address,
    pub usdc: Address,
    pub usdc_admin: StellarAssetClient<'a>,
    pub usdc_token: TokenClient<'a>,
    pub registry: RegistryClient<'a>,
    pub bond: BondClient<'a>,
    pub scoreboard: ScoreboardClient<'a>,
    pub observer: Address,
    pub provider_admin: Address,
    pub provider_signer: SigningKey,
    pub client: Address,
}
impl<'a> World<'a> {
    pub fn new() -> Self {
        let env = Env::default();
        env.mock_all_auths();
        let admin = Address::generate(&env);
        let observer = Address::generate(&env);
        let provider_admin = Address::generate(&env);
        let client = Address::generate(&env);
        let usdc = env
            .register_stellar_asset_contract_v2(admin.clone())
            .address();
        let mut configuration = params(&env);
        configuration.stake_floor = 10_000_000_000;
        configuration.allowed_stake_assets = Vec::from_array(&env, [usdc.clone()]);
        let registry_id = env.register(vaeltrix_registry::Registry, (admin.clone(), configuration));
        let scoreboard_id = env.register(
            vaeltrix_scoreboard::Scoreboard,
            (admin.clone(), registry_id.clone()),
        );
        let bond_id = env.register(
            crate::Bond,
            (admin.clone(), registry_id.clone(), scoreboard_id.clone()),
        );
        let registry = RegistryClient::new(&env, &registry_id);
        let scoreboard = ScoreboardClient::new(&env, &scoreboard_id);
        scoreboard.set_bond(&bond_id);
        let action = registry.propose(&ActionKind::AddObserver(
            observer.clone(),
            BytesN::from_array(&env, &[2; 32]),
        ));
        env.ledger().with_mut(|l| {
            l.timestamp = 60;
            l.sequence_number += 12;
        });
        registry.execute(&action);
        let usdc_admin = StellarAssetClient::new(&env, &usdc);
        for account in [&provider_admin, &client, &observer] {
            usdc_admin.mint(account, &1_000_000_000_000);
        }
        Self {
            bond: BondClient::new(&env, &bond_id),
            usdc_token: TokenClient::new(&env, &usdc),
            usdc_admin,
            registry,
            scoreboard,
            admin,
            usdc,
            observer,
            provider_admin,
            client,
            provider_signer: SigningKey::from_bytes(&[7; 32]),
            env,
        }
    }
    pub fn advance_secs(&self, secs: u64) {
        self.env.ledger().with_mut(|l| {
            l.timestamp = l.timestamp.checked_add(secs).unwrap();
            l.sequence_number = l
                .sequence_number
                .checked_add(u32::try_from(secs / 5).unwrap())
                .unwrap();
        });
    }
    pub fn with_template_901(&self) -> u32 {
        if self.registry.template_ids().contains(901) {
            return 901;
        }
        let mut t = template(&self.env, &self.registry.address);
        t.scope.min_amount = 10_000_000;
        self.registry.propose_template(&t);
        self.advance_secs(self.registry.params().timelock_secs);
        self.registry.activate_template(&901, &1);
        901
    }
    pub fn with_provider(&self) -> BytesN<32> {
        let existing = self.registry.providers_by_admin(&self.provider_admin);
        if let Some(id) = existing.get(0) {
            return id;
        }
        let id = self.registry.register_provider(
            &self.provider_admin,
            &String::from_str(&self.env, "anchor.example"),
            &Vec::from_array(
                &self.env,
                [BytesN::from_array(
                    &self.env,
                    &self.provider_signer.verifying_key().to_bytes(),
                )],
            ),
            &String::from_str(&self.env, ""),
        );
        self.registry.verify_domain(&id);
        id
    }
    pub fn with_commitment(&self, stake: i128) -> u64 {
        let provider = self.with_provider();
        let template = self.with_template_901();
        self.bond
            .commit(&provider, &template, &self.usdc, &stake, &0, &0)
    }
    pub fn payment(
        &self,
        commitment: u64,
        amount: i128,
        t0_ms: u64,
        t1_ms: Option<u64>,
    ) -> PaymentRef {
        // Fixture IDs remain deterministic while distinct timestamps produce distinct payments.
        let tx = String::from_str(
            &self.env,
            &std::format!("test-{commitment}-{amount}-{t0_ms}"),
        );
        let provider = self.bond.commitment(&commitment).provider_id;
        PaymentRef {
            payment_id: vaeltrix_types::payment_id(&self.env, &tx, &provider),
            sep31_tx_id: tx,
            commitment_id: commitment,
            amount,
            t0_ms,
            t1_ms,
            pause_ms: 0,
            evidence_hash: BytesN::from_array(&self.env, &[3; 32]),
        }
    }
    pub fn receipt(&self, p: &PaymentRef) -> CompletionReceipt {
        let mut bytes = std::vec::Vec::from(&b"VAELTRIX:RECEIPT:v1"[..]);
        bytes.extend_from_slice(&self.env.ledger().network_id().to_array());
        bytes.extend_from_slice(&p.payment_id.to_array());
        bytes.extend_from_slice(&p.commitment_id.to_be_bytes());
        bytes.extend_from_slice(&p.amount.to_be_bytes());
        bytes.extend_from_slice(&p.t0_ms.to_be_bytes());
        bytes.extend_from_slice(&p.t1_ms.unwrap().to_be_bytes());
        bytes.extend_from_slice(&p.pause_ms.to_be_bytes());
        assert_eq!(bytes.len(), 131);
        CompletionReceipt {
            signer: BytesN::from_array(&self.env, &self.provider_signer.verifying_key().to_bytes()),
            signature: BytesN::from_array(&self.env, &self.provider_signer.sign(&bytes).to_bytes()),
        }
    }
    pub fn assert_invariants(&self) {
        self.env.as_contract(&self.bond.address, || {
            let next_commitment: u64 = self
                .env
                .storage()
                .instance()
                .get(&DataKey::NextCommitmentId)
                .unwrap();
            let next_claim: u64 = self
                .env
                .storage()
                .instance()
                .get(&DataKey::NextClaimId)
                .unwrap();
            let claims: std::vec::Vec<Claim> = (1..next_claim)
                .map(|id| {
                    self.env
                        .storage()
                        .persistent()
                        .get(&DataKey::Claim(id))
                        .unwrap()
                })
                .collect();
            let mut assets: std::vec::Vec<(Address, i128)> = std::vec::Vec::new();
            for id in 1..next_commitment {
                let c: Commitment = self
                    .env
                    .storage()
                    .persistent()
                    .get(&DataKey::Commitment(id))
                    .unwrap();
                assert!(
                    c.stake_reserved >= 0 && c.stake_reserved <= c.stake_total,
                    "I1"
                );
                let open: std::vec::Vec<&Claim> = claims
                    .iter()
                    .filter(|claim| {
                        claim.commitment_id == id
                            && matches!(claim.status, ClaimStatus::Filed | ClaimStatus::Challenged)
                    })
                    .collect();
                assert_eq!(
                    c.stake_reserved,
                    open.iter().map(|claim| claim.reserved_amount).sum::<i128>(),
                    "I2"
                );
                assert_eq!(c.open_claims as usize, open.len(), "I8");
                let index = assets
                    .iter()
                    .position(|(asset, _)| asset == &c.stake_asset)
                    .unwrap_or_else(|| {
                        assets.push((c.stake_asset.clone(), 0));
                        assets.len() - 1
                    });
                let total = &mut assets[index].1;
                if c.status != CommitmentStatus::Exited {
                    *total += c.stake_total;
                }
                *total += open.iter().map(|claim| claim.claim_bond).sum::<i128>();
            }
            for (asset, required) in assets {
                assert!(
                    TokenClient::new(&self.env, &asset).balance(&self.bond.address) >= required,
                    "I7"
                );
            }
        });
    }
}
