//! VX-103: protect externally visible error codes and SDK serialization.
use soroban_sdk::{
    Address, BytesN, Env, IntoVal, String, TryFromVal, Val, Vec, testutils::Address as _,
};
use vaeltrix_types::{Error, Provider, ProviderStatus, provider_id};

#[test]
fn error_codes_remain_frozen() {
    let errors = [
        Error::NotAuthorized,
        Error::ProviderNotActive,
        Error::TemplateNotActive,
        Error::InsufficientStake,
        Error::OutOfScope,
        Error::ClaimWindowClosed,
        Error::DuplicateClaim,
        Error::InvalidEvidence,
        Error::NotInBreach,
        Error::ChallengeWindowOpen,
        Error::OpenClaimsExist,
        Error::CooldownActive,
        Error::UnknownObserver,
        Error::AlreadyAttested,
        Error::AlreadyInitialized,
        Error::NotInitialized,
        Error::InvalidParams,
        Error::UnknownProvider,
        Error::UnknownTemplate,
        Error::UnknownCommitment,
        Error::UnknownClaim,
        Error::ProviderNotVerified,
        Error::ProviderExists,
        Error::TemplateExists,
        Error::TimelockActive,
        Error::AssetNotAllowed,
        Error::AssetMismatch,
        Error::AmountOutOfRange,
        Error::NotCovered,
        Error::CommitmentNotActive,
        Error::ClaimNotOpen,
        Error::AttestationWindowClosed,
        Error::QuorumNotReached,
        Error::BelowMinStake,
        Error::StakeCapExceeded,
        Error::PaymentIdMismatch,
        Error::UnknownSigner,
        Error::TooManySigners,
        Error::UnsupportedPenaltyModel,
        Error::ArithmeticOverflow,
        Error::BondAlreadySet,
        Error::BatchExists,
        Error::InvalidPeriod,
        Error::NothingPending,
    ];
    for (error, code) in errors.into_iter().zip(1_u32..=44) {
        assert_eq!(error as u32, code);
        let sdk_error: soroban_sdk::Error = error.into();
        assert_eq!(sdk_error.get_code(), code);
    }
}

#[test]
fn provider_roundtrips_with_registered_signers_and_full_timestamp() {
    let env = Env::default();
    let admin = Address::generate(&env);
    let domain = String::from_str(&env, "anchor.example");
    let provider = Provider {
        id: provider_id(&env, &domain, &admin),
        admin,
        signers: Vec::from_array(&env, [BytesN::from_array(&env, &[7; 32])]),
        home_domain: domain,
        metadata_uri: String::from_str(&env, "https://anchor.example/vaeltrix.json"),
        verified: true,
        status: ProviderStatus::Suspended,
        registered_at: u64::MAX,
    };
    let encoded: Val = provider.clone().into_val(&env);
    assert_eq!(Provider::try_from_val(&env, &encoded), Ok(provider));
}

#[test]
fn domain_case_is_normalized_with_the_same_admin() {
    let env = Env::default();
    let admin = Address::generate(&env);
    assert_eq!(
        provider_id(&env, &String::from_str(&env, "ANCHOR.Example"), &admin),
        provider_id(&env, &String::from_str(&env, "anchor.example"), &admin),
    );
}
