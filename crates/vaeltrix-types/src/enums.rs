//! Frozen shared enums and penalty model (guide §4.1, VX-103).
use soroban_sdk::contracttype;

#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProviderStatus {
    Active,
    Suspended,
    Exited,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Metric {
    TimeToCompletion,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EventKind {
    SenderDebitConfirmed,
    OnChainSettled,
    ReceiverAccepted,
    ReceiverCreditConfirmed,
    RecipientAcknowledged,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Direction {
    Inbound,
    Outbound,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CarveOut {
    ReceiverBankHoliday,
    ComplianceHoldDeclared,
    InvalidBeneficiary,
    SenderInfoIncomplete,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EvidenceMode {
    DualSigned,
    ProviderSigned,
    ObserverOnly,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TemplateStatus {
    Proposed,
    Active,
    Deprecated,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CommitmentStatus {
    Active,
    Paused,
    Exiting,
    Exited,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClaimStatus {
    Filed,
    Challenged,
    Paid,
    Rejected,
    Expired,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BreachKind {
    LateCompletion,
    NoCompletion,
}
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ClaimOutcome {
    Upheld,
    Rejected,
    Expired,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PerBreachBps {
    pub bps: u32,
    pub cap: i128,
}
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PenaltyModel {
    PerBreachBps(PerBreachBps),
}
