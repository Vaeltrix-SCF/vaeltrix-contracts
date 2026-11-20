# Vaeltrix × Stellar Go Integration

Vaeltrix adds a Go layer, built on the Stellar Go CLI library, that translates Vaeltrix contract events into ISO 20022 messages, W3C credentials and a Go SDK, so banks, payout rails and Go-based anchors can use Vaeltrix without reading Soroban. The contracts, verdict crate, observer and TypeScript SDK in the technical specification (sections 9, 10 and 18) stay unchanged. The Go layer only reads their outputs, plus a narrow write path for anchors.

## Overview

The specification makes Vaeltrix legible to Stellar-native parties: anchors, wallets and observers. It says nothing about the institutions behind them. A bank funding a SEP-31 sender, or the payout rail crediting the beneficiary, speaks ISO 20022, not Soroban events. Stellar Go already ships the pieces to close that gap.

| Stellar Go package | What it already does | Vaeltrix use |
|---|---|---|
| `pkg/iso20022` | Builds and parses pacs.002/004/008/009, pain.001/002, camt.053/054; validates against the official XSDs; `ReconcileInstructions` matches instructions to status reports | Outbound verdict and penalty reports; inbound payout-rail evidence |
| `pkg/soroban` | Pure-Go Soroban RPC client: simulate, assemble, submit, deploy, invoke | Go anchor SDK over the registry and bond contracts |
| `pkg/vc` | DID documents (`did:web`, `did:key`) and W3C Verifiable Credential issue and verify, including from a Stellar seed | Signed provider reliability credentials |
| MCP server, `pkg/x402` | Exposes tools to AI assistants; pay-per-request HTTP | Scoreboard tools; paid bulk data API (later) |

The result is one new service, `vaeltrix-iso`, and one new library, `vaeltrix-go`, both owned by Olvis E. Gil Ríos as maintainer of Stellar Go.

## What exists today

As of commit `c585242` (22 October 2026), the three contracts are deployed on testnet but the claim flow and the offchain services are not built yet. The Go layer is designed against that state.

Two consequences shape the plan. Until the indexer ships, `vaeltrix-iso` reads Soroban events directly over RPC, which makes the `getEvents` work in Stellar Go a prerequisite. Messages that depend on claims (verdicts, penalty payouts) wait for the bond claim flow; stake and statement messages can ship now.

| Part | Status | What the Go layer can use now |
|---|---|---|
| `vaeltrix_registry` | Built, deployed | `register_provider`, signer and metadata updates, domain verify, templates, timelocked observer set; events `prov_*`, `tmpl_*`, `obs_add`, `obs_rm` |
| `vaeltrix_bond` | Commitments, stake, pause, exit built; claims not yet | `commit`, `add_stake`, `withdraw_excess`, `pause`, `resume`, `request_exit`, `finalize_exit`; reads `commitment`, `available_stake`, `max_penalty`, `is_covered`; events `commit`, `stake_chg`, `cmt_pause`, `cmt_resum`, `exit_req`, `exit_fin` |
| `vaeltrix_scoreboard` | Built, deployed | `anchor_batch` (event `batch` with full `PeriodStats`), `record_claim_outcome` (event `claim_out`); reads `stats`, `lifetime`, `batch`, `periods` |
| Observer, indexer, mock anchor | Scaffolded only (VX-601, VX-701, VX-802) | Nothing yet |
| REST API | Server skeleton and OpenAPI only | No resource routes yet |
| Playground | Live at vaeltrix-testnet.vercel.app | Reference for reading contract state |

## Architecture

The three Go components sit below the existing stack: they read what the indexer and REST API already publish, and face outward to parties the TypeScript stack does not serve. `vaeltrix-iso` and the credential issuer only read; `vaeltrix-go` is the one component that writes to the contracts (commit, stake, pause, exit), on behalf of the anchor using it. The rail status arrow is the inbound evidence path described in the ISO 20022 bridge section. The observer, indexer and REST API are still scaffolds, so until they ship the Go components read contract events directly over RPC.

```
Onchain, Stellar testnet (unchanged)
┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐
│ vaeltrix_registry│  │  vaeltrix_bond   │  │ vaeltrix_scoreboard  │
└────────┬─────────┘  └────────┬─────────┘  └──────────────────────┘
         │ events              │ events
         ▼                     ▼
Offchain stack (scaffolded, not built yet)
┌───────────┐            ┌──────────┐        ┌──────────┐
│ Observer  │            │ Indexer  │───────▶│ REST API │
└───────────┘            └────┬─────┘        └────┬─────┘
                             │                   │ reads
┌────────────────────────────┼───────────────────┼────────────────┐
│ New: Go layer built on Stellar Go                            │
│ ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐ │
│ │ vaeltrix-go  │  │ Credential issuer│  │  vaeltrix-iso    │ │
│ │ Go SDK,      │  │ pkg/vc, did:web  │  │ pkg/iso20022     │ │
│ │ pkg/soroban  │  │                  │  │ bridge           │ │
│ └──────┬───────┘  └────────┬─────────┘  └───────┬────▲─────┘ │
└────────┼───────────────────┼────────────────────┼────┼───────┘
      Go calls           credentials      pacs.002, │  rail status
         │                   │              camt.054 │
         ▼                   ▼                  ▼     │
┌─────────────────┐  ┌──────────────────┐  ┌───────────────────┐
│ Go-based anchors│  │ Wallets,         │  │ Banks, payout     │
│                 │  │ institutions     │  │ rails             │
└─────────────────┘  └──────────────────┘  └───────────────────┘
```

## ISO 20022 bridge

`vaeltrix-iso` turns each Vaeltrix outcome into the bank message an institution already processes, and accepts the payout rail's own status message as a second proof of completion. It is the main reason to integrate Stellar Go.

### Outbound: Vaeltrix events to bank messages

In Phase 1 the service subscribes to the contracts' Soroban events over RPC. Once the indexer (VX-701) and REST API ship, it switches to reading them instead, with RPC as the fallback. Each message is built with `pkg/iso20022` and validated against its XSD before it is sent. Event names below are the topics in the deployed contracts.

| Contract event | Message | Recipient | Available |
|---|---|---|---|
| bond `commit` | camt.054 debit notification (stake locked) | Provider's treasury | Now |
| bond `stake_chg` | camt.054 debit or credit, with delta and new total | Provider's treasury | Now |
| bond `exit_fin` | camt.054 credit (stake returned) | Provider's treasury | Now |
| bond `cmt_pause`, `cmt_resum` | No message; marks the coverage gap in the statement | Provider's treasury | Now |
| End of period, from the events above | camt.053 stake statement | Provider's treasury | Now |
| Payment verdict (OnTime, Late, NoCompletion) | pacs.002 status report | Sending anchor and its funding bank | With the observer (VX-601) |
| Claim resolved as upheld | camt.054 credit notification | Beneficiary's institution | With the bond claim flow |
| Claim resolved as upheld | camt.054 debit notification | Provider's treasury | With the bond claim flow |

The scoreboard's `claim_out` event already exists and carries the claim ID, provider and outcome, so penalty notices can key off it as soon as the bond contract starts calling `record_claim_outcome`.

Status mapping for pacs.002:

| Vaeltrix verdict | pacs.002 status | Reason info |
|---|---|---|
| OnTime | ACSC (settlement completed) | `VX-ONTIME latency_ms=<n>` |
| Late | ACSC | `VX-BREACH latency_ms=<n> target_ms=<n>` |
| NoCompletion | RJCT or PDNG, set per template | `VX-NOCOMPLETION deadline=<rfc3339>` |
| Carve-out applied (spec 7.5) | PDNG while paused | carve-out reason code |

The exact reason-code namespace is an open question for the pilot banks. The `VX-` prefix keeps it out of the ISO external code lists until it is agreed.

### Inbound: payout-rail evidence

The spec's signed completion event already carries a `rail_ref` (section 7.7, for example a NIBSS NIP session ID) and lists rail-signed evidence as out of MVP scope (section 19.1). `vaeltrix-iso` is how that scope is filled:

1. The receiving anchor forwards the pacs.002 its payout bank returns, or the bank pushes it directly, to `POST /v1/evidence/iso` (SEP-10 or SEP-45 authenticated, like the planned `POST /v1/events`).
2. `ParsePacs002` reads it. The service checks the message signature, if the bank signs, and that the original transaction reference matches the `rail_ref` on the anchor's signed `receiver_credit_confirmed` event.
3. The parsed acceptance time becomes an extra field in the evidence bundle the observer hashes (section 13.3). The verdict still uses the anchor's signed t1; the rail time is the independent cross-check.
4. If the rail time and the signed t1 differ by more than the template's `grace_ms`, the observer flags the payment. That turns a later dispute into a document check, as section 7.4 intends.

Nothing here changes a contract interface. The evidence bundle is offchain, and only its hash goes onchain, exactly as today.

## Go anchor SDK

`vaeltrix-go` mirrors the provider-side half of `@vaeltrix/sdk` (spec 18.2) so an anchor whose SEP-31 server is written in Go integrates with a few calls instead of a TypeScript sidecar. It wraps `pkg/soroban` for contract calls and posts signed events to the existing ingestion API.

| Go call | Maps to | Kind |
|---|---|---|
| `Providers.Register(homeDomain, signers, metadataURI)` | registry `register_provider` | write |
| `Commitments.Create(providerID, templateID, amount)` | bond `commit` | write |
| `Commitments.AddStake`, `WithdrawExcess` | bond `add_stake`, `withdraw_excess` | write |
| `Commitments.Pause`, `Resume`, `RequestExit`, `FinalizeExit` | bond `pause`, `resume`, `request_exit`, `finalize_exit` | write |
| `Commitments.Get`, `AvailableStake`, `IsCovered` | bond `commitment`, `available_stake`, `max_penalty`, `is_covered` | read (simulate) |
| `Payments.Tag(commitmentID, sep31TxID, amount)` | `POST /v1/events` | offchain |
| `Events.SignCompletion(paymentID, railRef, ts)` | `POST /v1/events`, ed25519 over the spec 7.7 format | offchain |

Every contract call in the table exists in the deployed registry and bond contracts today, so the onchain half of `vaeltrix-go` can be built and tested against testnet now. `Payments.Tag` and `Events.SignCompletion` post to `POST /v1/events`, which the observer (VX-601) has not implemented yet; they ship once it does. The client-side calls (`claims.file`, `scoreboard.get`) stay TypeScript-only in V0, because no Go-based wallet has asked for them.

## Two gaps to close upstream in Stellar Go

1. **Structured values.** `pkg/soroban` has helpers for strings, numbers, addresses and bytes, but none for maps or vectors. Vaeltrix's `Params`, `SlaTemplate` and commitment structs are maps. Add `ScvMap`, `ScvVec` and a struct encoder, tested against the frozen `vaeltrix-types` test vectors so Go and Rust encode identically.
2. **Events.** There is no `getEvents` wrapper. `vaeltrix-go` needs it to confirm a commit or stake change landed, and `vaeltrix-iso` could use it as a fallback when the indexer lags.

Both changes are generic, so they land in Stellar Go itself and benefit every Go project on Soroban, not just Vaeltrix.

## Reliability credentials

At the end of each scoreboard period, Vaeltrix issues each scored commitment a W3C Verifiable Credential stating its on-time rate, breaches and penalties paid. A bank or wallet can then check a provider's record by verifying one signature, without querying Soroban.

- **Issuer.** A Vaeltrix issuer key published as `did:web:vaeltrix.xyz`, signing with `pkg/vc` (Ed25519Signature2020).
- **Subject.** The provider as `did:web:<home_domain>`. This is the same domain the registry already verifies through the `[VAELTRIX]` block in stellar.toml (spec 17.1), so one domain binds the onchain provider, its offchain identity and its credentials. Add one optional line to that block: `DID = "did:web:<home_domain>"`.

Claims in the credential (the stats object is copied field for field from the `PeriodStats` that the scoreboard's `batch` event emits; only `reliability_score` is computed offchain, per spec 14.3):

```json
{
  "type": ["VerifiableCredential", "VaeltrixReliabilityCredential"],
  "issuer": "did:web:vaeltrix.xyz",
  "validFrom": "2026-12-01T00:00:00Z",
  "validUntil": "2027-01-01T00:00:00Z",
  "credentialSubject": {
    "id": "did:web:anchor.example",
    "provider_id": "7c2e...41",
    "commitment_id": 42,
    "template_id": 1,
    "period_start": 1793491200,
    "period_end": 1796169600,
    "stats": {
      "payments": 1840,
      "on_time": 1823,
      "breaches": 17,
      "carved_out": 26,
      "p50_ms": 1260000,
      "p95_ms": 3180000,
      "p99_ms": 4410000,
      "volume": "912400.0000000",
      "penalties_paid": "412.5000000"
    },
    "reliability_score": 93,
    "merkle_root": "e91c...07",
    "batch_observer": "GOBS..."
  }
}
```

The numbers above are illustrative. Including the batch's `merkle_root` and observer ties the credential to the observer's published batch (spec 14.2), so the credential cannot claim better figures than the onchain record. Providers below 100 tagged payments in the period receive no credential, matching the scoreboard's "insufficient data" rule.

The same `pkg/vc` service can later give each observer a `did:web` identity, which supports the independence rule in spec 13.4 (one observer per organisation).

## Extras

Two smaller uses come almost for free once the bridge exists. Neither is needed for the V0 to V1 gate.

- **MCP scoreboard tools.** The Stellar Go MCP server gains three read-only tools that call the public REST API (spec 18.3): `vaeltrix_rankings(corridor, template)`, `vaeltrix_provider(id)` and `vaeltrix_claim(id)`. An assistant can then answer "which anchor is fastest for US to Nigeria bank payouts this month?" from verified data.
- **x402 bulk data API.** The scoreboard REST API stays free. A separate bulk endpoint for full record sets and historical exports can charge per request through `pkg/x402`. That gives the protocol a revenue line that is independent of penalties, and it can be added after V1 without touching contracts.

## Security and boundaries

The Go layer never decides a verdict and never holds funds, so a bug in it can misreport an outcome but cannot move stake or change a claim.

- **Read-only by default.** `vaeltrix-iso` only reads the indexer and API. Its single write path, `POST /v1/evidence/iso`, adds a field to an offchain evidence bundle; the verdict function in the shared Rust crate is unchanged.
- **One source of truth.** Every number in an ISO message or credential comes from an indexed onchain event or a Merkle-committed batch. The service signs nothing the chain does not already show.
- **Inbound evidence is untrusted.** A forwarded pacs.002 is accepted only from an authenticated provider or a registered rail endpoint, and only when its reference matches the signed `rail_ref`. A mismatch flags the payment; it never upholds or rejects a claim by itself.
- **No personal data.** ISO messages can carry debtor and creditor names. `vaeltrix-iso` fills only institution identifiers and Vaeltrix IDs, keeping the spec 14.4 rule that records carry no personal data.
- **Keys.** The credential issuer key and any message-signing key live in the same secret store as the observer keys, are read from the environment, and are never logged (repo rule 6).

Out of scope for the Go layer: contract deployment (stays on the official stellar CLI), the core observer, claim filing and attestation, and anything that signs a Soroban transaction for a party other than the SDK's own user.

## Milestones and acceptance

The work runs in three phases, each tied to a gate the specification already defines (section 19.3), so no phase needs its own date. Olvis E. Gil Ríos owns all three; the contracts team reviews any change that touches the event ingestion API.

**Phase 1: outbound reporting** (alongside claims and payouts, before the V0 to V1 gate)

- Upstream: `ScvMap`, `ScvVec` and `getEvents` merged into Stellar Go, passing the vaeltrix-types vectors
- `vaeltrix-iso` reads bond events over RPC and emits camt.054 for every `commit`, `stake_chg` and `exit_fin` on testnet, starting with commitment 1
- camt.053 stake statement generated for commitment 1, showing the coverage gap between `cmt_pause` and `cmt_resum`
- Every generated message validates against its official XSD in CI
- Once the bond claim flow lands: pacs.002 per verdict and a camt.054 pair per upheld claim, produced by the scripted breach demo (spec 19.2)

**Phase 2: Go SDK and rail evidence** (by the V0 to V1 gate)

- `vaeltrix-go` published with every call in the SDK table, tested against the testnet deployment
- `POST /v1/evidence/iso` live; one pilot anchor's payout bank pacs.002 attached to real testnet evidence bundles
- Rail time versus signed t1 mismatch flagged in the observer log
- camt.053 monthly stake statement delivered to one pilot provider

**Phase 3: credentials and assistants** (by the V1 to V2 gate)

- `did:web:vaeltrix.xyz` issuer live; credentials issued for every commitment with 100 or more tagged payments
- A wallet verifies a credential and its `merkle_root` against the scoreboard's `batch` read
- MCP scoreboard tools shipped in Stellar Go

## Open questions

- Which reason-code namespace will the pilot banks accept in pacs.002?
- Will the payout banks for the two pilot anchors expose pacs.002 directly, or only through the anchor?
- Should `vaeltrix-iso` live in this monorepo under `services/` or in the Stellar Go organisation?
More details about the Stellar Go organisation can be found in the [Stellar Go repository](https://github.com/stellar-go-cli/stellar-go-cli) and https://www.ogtechnologies.co/portfolio/stellar-go-cli/
