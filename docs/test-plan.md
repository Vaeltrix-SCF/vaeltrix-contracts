# Test plan

This plan describes the code on `main` used for this documentation update and separates automated checks, recorded testnet evidence, and future coverage. Recounted on 31 October 2026.

## Scope and approach

[AGENTS.md](../AGENTS.md) requires test-first contract work: write each VX issue's named tests before implementation. The [implementation guide](implementation-guide.pdf), especially §2, §4 and §9.2, defines the interfaces and test requirements. Tests are evidence of specific checks, not an independent security audit.

## Contract unit tests

`pnpm contracts:test` runs `cargo test --workspace`. The current native unit-test results are:

| Contract | Passing | Ignored | Coverage |
| --- | --- | --- | --- |
| [Registry](../contracts/registry/src/test.rs) | 26 | 0 | Provider and observer independence, authorization, signer/domain validation, templates, governance timelocks, admin handover, events and TTL |
| [Bond](../contracts/bond/src/test.rs) | 19 | 1 | Commit authorization and validation, asset and stake limits, arithmetic overflow, stake transfers, pause/resume coverage, upgrade timelocks, frozen exit cooldown, minimum/reserved stake and open-claim exit locks |
| [Scoreboard](../contracts/scoreboard/src/test.rs) | 10 | 0 | Observer/bond authorization, daily period and aggregate validation, duplicate rejection, events, TTL and overflow |

Registry additionally has one passing [parameter-file validation integration test](../contracts/registry/tests/). Bond's `claim_against_exiting_commitment_still_pays` is explicitly ignored pending VX-307 (#22); the open-claim exit lock is tested using prepared storage, not a completed claim flow. Macro-generated tests are included in the counts above. Counting `#[test]` lines alone misses those cases.

Authorization checks target mutating entry points; the suites include explicit auth assertions and negative cases. The counts do not claim exhaustive proof of authorization correctness.

## Shared vector tests

[Test vectors](../test-vectors/) define verdicts, identifiers and receipt encodings/signatures. [Rust types](../crates/vaeltrix-types/tests/) and [Rust verdict](../crates/vaeltrix-verdict/tests/) suites consume them, as does the [TypeScript vector suite](../packages/core/test/vectors.test.ts). `pnpm test:vectors` requires both languages to agree. Property tests also check arithmetic and conservation rules.

## TypeScript tests

`pnpm test` currently reports **63 passing and five skipped tests across 10 files** without a database test URL. Tests cover deployment/seed orchestration, manifest validation, guide export, issue import, vectors, the database layer, API foundations, and playground wallet/transaction handling. Wallet tests cover network/account mismatch, missing/unresponsive extensions, simulation rejection, transaction expiry/integrity and confirmation polling; they do not approve real Freighter requests.

The five database tests require an isolated Postgres test database and `DATABASE_TEST_URL`. CI provisions Postgres 16 and sets this URL. See [migration instructions](../db/migrations/README.md); do not point reset/migration tests at a production database. A locally skipped test is not a pass.

## CI gates

[CI](../.github/workflows/ci.yml) runs on every pull request and on pushes to `main`:

- `rust`: formatting, clippy, workspace tests, contract build and three Wasm artifacts.
- `ts`: frozen dependency install, recursive build/typecheck, lint, formatting and Vitest with Postgres.
- `vectors`: Rust and TypeScript vector agreement.

A green run establishes these checks for its commit; it does not prove deployment freshness or future claim/payout functionality.

## Testnet verification

[Deployment evidence](../test-net-deployment.md) records deployment, commitment creation with 1,000 test USDC, pause, resume and empty daily batch anchoring. The [manifest](../deployments/testnet.json) records contract IDs and Wasm hashes. The public explorer capture in [UI prototypes](ui-prototypes.md) shows actual commitment 1 state. The empty batch is not proof of completed payments.

Stake additions and excess withdrawals are implemented and unit tested. The evidence list currently does **not** include transaction hashes proving those two operations in a live wallet session, so this plan does not label them verified on testnet. Capture and link their confirmed hashes during manual acceptance testing.

Manual acceptance flow: connect Freighter on Testnet, fund with free test XLM, add the deployment-specific USDC trustline, obtain test USDC from the operator, register and verify a provider, simulate/review/sign a commitment, inspect the confirmed balance and commitment, then simulate/review/sign add, excess withdrawal, pause and resume. Check state after each confirmation; never reuse an uncertain transaction. The [tester walkthrough](../apps/playground/README.md#tester-walkthrough) explains prerequisites and recovery. Operator verification is separate from public registration.

## Planned coverage by tranche

These are planned acceptance targets, not current pass results:

- **Tranche 1:** upheld, rejected and expired claim paths in unit tests and on testnet, including claims against exiting commitments.
- **Tranche 2:** challenges and all four carve-outs end to end; indexer reconciliation against contract reads; recomputation of batch roots from published records; formal STRIDE model and monitoring plan.
- **Tranche 3:** direct client claims and delegation; integration kit against an Anchor Platform testnet instance; expanded public explorer.

Pure carve-out rules already have vector coverage. This is distinct from the planned observer/claim integration. Tranche delivery groupings are separate from the specification's V0–V3 protocol phases.

## How to run

Use the versions in [toolchain.md](toolchain.md), then from the repository root:

```sh
pnpm install --frozen-lockfile
pnpm contracts:test
pnpm test
pnpm test:vectors
```

Read commitment 1 without project keys (the first command creates and funds a disposable reviewer identity; the second simulates a read and does not submit a transaction):

```sh
stellar keys generate vx-docs-reviewer --network testnet --fund
stellar contract invoke --network testnet --source vx-docs-reviewer --send no \
  --id CCYLDMTA4CTFF2VHULUCCBNCBMN3G7MA33EZ2OFYMIRSIKX3PYUHCUAI \
  -- available_stake --id 1
```

At the documentation capture, the result was `10000000000` smallest units (1,000 test USDC). Balances can change; testnet can reset. Compare against current [deployment records](../deployments/testnet.json). `scripts/smoke.ts` remains a VX-505 stub, so `pnpm smoke:testnet` is not a completed verification command.
