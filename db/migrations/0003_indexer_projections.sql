-- VX-702: observer membership and claim vote counts projected from chain events.
create table observers (
  address text primary key,
  key text,
  active boolean not null,
  added_at timestamptz
);

alter table claims
  add column votes_for integer not null default 0,
  add column votes_against integer not null default 0;

update claims c
set votes_for = (select count(*) from claim_votes v where v.claim_id = c.claim_id and v.uphold),
    votes_against = (select count(*) from claim_votes v where v.claim_id = c.claim_id and not v.uphold);
