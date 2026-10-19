-- 0001_core.sql

create table cursors (
  name text primary key,                              -- 'indexer:events', 'observer:ledger'
  ledger bigint not null,
  paging_token text,
  updated_at timestamptz not null default now()
);

create table chain_events (
  id text primary key,                             -- RPC event id, unique and ordered
  ledger bigint not null,
  ledger_closed_at timestamptz not null,
  tx_hash text not null,
  contract text not null,                          -- 'registry' | 'bond' | 'scoreboard'
  topic text not null,
  key text,
  data jsonb not null,
  processed boolean not null default false
);
create index on chain_events (contract, topic);
create index on chain_events (processed) where not processed;

create table providers (
  provider_id text primary key,          -- hex
  admin text not null,
  home_domain text not null,
  metadata_uri text,
  signers text[] not null,               -- hex ed25519 pubkeys
  verified boolean not null default false,
  status text not null,                  -- active | suspended | exited
  registered_at timestamptz not null
);

create table templates (
  template_id int not null,
  version int not null,
  body jsonb not null,                   -- full SlaTemplate as JSON (spec 6.2 shape)
  status text not null,
  activates_at timestamptz,
  primary key (template_id, version)
);

create table commitments (
  commitment_id bigint primary key,
  provider_id text not null references providers,
  template_id int not null,
  template_version int not null,
  stake_asset text not null,
  stake_total numeric(39,0) not null,
  stake_reserved numeric(39,0) not null default 0,
  status text not null,
  effective_from timestamptz not null,
  exit_requested_at timestamptz,
  updated_ledger bigint not null
);

create table payments (
  payment_id text primary key,           -- hex, D4
  sep31_tx_id text not null,
  provider_id text not null references providers,
  commitment_id bigint references commitments,    -- null = accepted without coverage
  client_account text,                     -- G... of the sender side, if registered
  beneficiary text,                     -- address that receives penalties
  amount numeric(39,0) not null,
  asset text not null,
  sender_country text, receiver_country text, payout_rail text,
  stellar_tx_hash text,
  t0_ms bigint,                         -- ledger close of settlement
  t1_ms bigint,                         -- signed completion
  pause_ms bigint not null default 0,
  status text not null,                  -- tagged | settled | completed | breached | carved_out | out_of_scope | claimed | resolved
  verdict text,                         -- pending | on_time | late | no_completion
  latency_ms bigint,
  evidence_hash text,
  claim_id bigint,
  delegated boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on payments (status);
create index on payments (commitment_id, t0_ms);
create unique index on payments (provider_id, sep31_tx_id);

create table signed_events (
  id bigserial primary key,
  payment_id text not null references payments,
  event text not null,                  -- receiver_credit_confirmed, compliance_hold_declared, ...
  ts_ms bigint not null,
  signer text not null,                 -- hex pubkey
  body jsonb not null,                  -- full signed event as received
  body_hash text not null,              -- JCS sha256 without sig
  verified boolean not null,
  received_at timestamptz not null default now()
);

create table evidence_bundles (
  evidence_hash text primary key,
  payment_id text not null references payments,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create table claims (
  claim_id bigint primary key,
  commitment_id bigint not null,
  payment_id text not null,
  breach text not null,
  claimant text not null, beneficiary text not null,
  penalty numeric(39,0) not null, reserved numeric(39,0) not null,
  shortfall numeric(39,0) not null, bond numeric(39,0) not null,
  status text not null,                  -- filed | challenged | paid | rejected | expired
  outcome text,
  filed_at timestamptz not null,
  challenge_deadline timestamptz not null,
  attestation_deadline timestamptz,
  counter_evidence_hash text,
  amount_paid numeric(39,0),
  resolved_at timestamptz,
  filed_tx text not null,
  resolved_tx text
);
create index on claims (status, challenge_deadline);

create table claim_votes (
  claim_id bigint not null references claims,
  observer text not null,
  uphold boolean not null,
  attestation_hash text not null,
  primary key (claim_id, observer)
);

create table attestations (                 -- observer's own published log (spec 13.3)
  attestation_hash text primary key,
  claim_id bigint,
  body jsonb not null,
  created_at timestamptz not null default now()
);

create table batches (
  commitment_id bigint not null,
  period bigint not null,                  -- day index, D14
  observer text not null,
  merkle_root text not null,
  stats jsonb not null,
  records_uri text,                           -- where the full record set is downloadable
  anchored_tx text,
  primary key (commitment_id, period)
);

create table delegations (
  client_account text not null,
  provider_id text,                        -- null = all providers
  beneficiary text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (client_account, beneficiary)
);

create table observer_jobs (
  id bigserial primary key,
  kind text not null,                      -- file_claim | resolve | attest | anchor_batch | extend_ttl
  ref text not null,                       -- payment_id, claim_id, ...
  status text not null,                    -- queued | running | submitted | confirmed | failed
  attempts int not null default 0,
  last_error text,
  tx_hash text,
  run_after timestamptz not null default now(),
  unique (kind, ref)
);
