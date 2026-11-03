//! Claim resolution and atomic payouts (VX-307, guide §6.7).
use crate::{DataKey, claims, disputes, events, stake, storage};
use soroban_sdk::{Env, token};
use vaeltrix_types::{ClaimOutcome, ClaimStatus, Error, ScoreboardClient};
pub fn resolve(env: &Env, id: u64) -> Result<(), Error> {
    storage::touch(env);
    let mut claim = claims::claim(env, id)?;
    let now = env.ledger().timestamp();
    let registry = stake::registry(env)?;
    let params = registry.params();
    let outcome = match claim.status {
        ClaimStatus::Filed => {
            if now < claim.challenge_deadline {
                return Err(Error::ChallengeWindowOpen);
            }
            ClaimOutcome::Upheld
        }
        ClaimStatus::Challenged => {
            if claim.votes_for >= params.quorum {
                ClaimOutcome::Upheld
            } else if claim.votes_against >= params.quorum {
                ClaimOutcome::Rejected
            } else if now > claim.attestation_deadline {
                ClaimOutcome::Expired
            } else {
                return Err(Error::QuorumNotReached);
            }
        }
        _ => return Err(Error::ClaimNotOpen),
    };
    let mut commitment = storage::commitment(env, claim.commitment_id)?;
    commitment.stake_reserved = commitment
        .stake_reserved
        .checked_sub(claim.reserved_amount)
        .ok_or(Error::ArithmeticOverflow)?;
    commitment.open_claims = commitment
        .open_claims
        .checked_sub(1)
        .ok_or(Error::ArithmeticOverflow)?;
    let amount_paid = if outcome == ClaimOutcome::Upheld {
        commitment.stake_total = commitment
            .stake_total
            .checked_sub(claim.reserved_amount)
            .ok_or(Error::ArithmeticOverflow)?;
        claim.status = ClaimStatus::Paid;
        claim.reserved_amount
    } else {
        claim.status = if outcome == ClaimOutcome::Rejected {
            ClaimStatus::Rejected
        } else {
            ClaimStatus::Expired
        };
        0
    };
    // Persist the final state before any token or scoreboard call.
    storage::put_commitment(env, &commitment);
    claims::put_claim(env, &claim);
    let token = token::Client::new(env, &commitment.stake_asset);
    let contract = env.current_contract_address();
    let bond_refunded = outcome != ClaimOutcome::Rejected;
    if outcome == ClaimOutcome::Upheld && amount_paid > 0 {
        token.transfer(&contract, &claim.beneficiary, &amount_paid);
    }
    if bond_refunded {
        if claim.claim_bond > 0 {
            token.transfer(&contract, &claim.bond_payer, &claim.claim_bond);
        }
    } else {
        let rejecting = disputes::votes(env, id);
        let count = rejecting.iter().filter(|(_, uphold)| !uphold).count();
        let (base, share, dust) = vaeltrix_verdict::split_rejected_bond(
            claim.claim_bond,
            params.rejected_bond_provider_bps,
            u32::try_from(count).map_err(|_| Error::ArithmeticOverflow)?,
        )
        .ok_or(Error::ArithmeticOverflow)?;
        let provider_share = base.checked_add(dust).ok_or(Error::ArithmeticOverflow)?;
        let provider = registry.get_provider(&claim.provider_id);
        if provider_share > 0 {
            token.transfer(&contract, &provider.admin, &provider_share);
        }
        for (observer, uphold) in rejecting.iter() {
            if !uphold && share > 0 {
                token.transfer(&contract, &observer, &share);
            }
        }
    }
    ScoreboardClient::new(env, &storage::address(env, &DataKey::Scoreboard)?)
        .record_claim_outcome(&claim, &outcome);
    events::ClaimResolved {
        claim_id: id,
        outcome,
        amount_paid,
        bond_refunded,
    }
    .publish(env);
    Ok(())
}
