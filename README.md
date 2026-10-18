# Vaeltrix

SLA-backed staking for Stellar payment providers. Providers stake USDC against a delivery-time SLA. When a payment completes late, or never, the client is paid a penalty from that stake automatically, and every outcome feeds a public reliability scoreboard.

This monorepo holds the three Soroban contracts plus the off-chain observer, indexer, API, SDK and mock anchor. One pull request can change a type and every consumer of it.

- **Build contract:** [`docs/implementation-guide.pdf`](docs/implementation-guide.pdf) (V0 Implementation Guide, 17 Oct 2026). It is the source of truth for every name, type, error code, event, storage key and API shape.
- **Toolchain and integration notes:** [`docs/toolchain.md`](docs/toolchain.md). Read this first: the network is on Protocol 29 and several tools moved past what the guide pins.
- **Agent rules:** [`AGENTS.md`](AGENTS.md)

## Status

This repo is scaffolded, not implemented. VX-101 (monorepo scaffold) and VX-102 (CI) are done. Every other file is a compiling shell or stub that names the issue that fills it.

| Area | Path | First issue |
| --- | --- | --- |
| Shared types | `crates/vaeltrix-types` | VX-103 |
| Verdict rules | `crates/vaeltrix-verdict` | VX-104 |
| Test vectors | `test-vectors/` | VX-105 |
| Off-chain core | `packages/core` | VX-106 |
| Postgres and migrations | `db/`, `scripts/db.ts` | VX-107 |
| Registry contract | `contracts/registry` | VX-201 |
| Bond contract | `contracts/bond` | VX-301 |
| Scoreboard contract | `contracts/scoreboard` | VX-401 |
| Deploy and seed | `scripts/`, `config/`, `deployments/` | VX-501 to VX-506 |
| Observer | `services/observer` | VX-601 |
| Indexer and API | `services/indexer`, `services/api` | VX-701, VX-704 |
| SDK and mock anchor | `packages/sdk`, `services/mock-anchor` | VX-801, VX-802 |
| Demo | `scripts/demo/` | VX-901 |

## Layout

```
.
├── Cargo.toml                Rust workspace (crates/*, contracts/*)
├── rust-toolchain.toml       Rust 1.97.0 + wasm32v1-none
├── package.json              pnpm workspace root and every §3.4 script
├── pnpm-workspace.yaml
├── crates/
│   ├── vaeltrix-types/       #[contracttype] structs, enums, Error, client traits
│   └── vaeltrix-verdict/     pure no_std breach / penalty / bond rules
├── contracts/
│   ├── registry/             vaeltrix_registry
│   ├── bond/                 vaeltrix_bond
│   └── scoreboard/           vaeltrix_scoreboard
├── test-vectors/             shared by Rust and TypeScript suites
├── packages/
│   ├── core/                 @vaeltrix/core
│   ├── bindings/             generated contract clients (never hand-edit)
│   └── sdk/                  @vaeltrix/sdk
├── services/
│   ├── observer/             :4001
│   ├── indexer/              :4002
│   ├── api/                  :4000
│   └── mock-anchor/          :4100
├── scripts/                  deploy, seed, smoke, bindings, demo, labels
├── db/migrations/
├── config/                   registry params per network
├── deployments/              <network>.json written by deploy
└── docs/
```

## Prerequisites

| Tool | Version | Install |
| --- | --- | --- |
| Rust | 1.97.0 | [rustup](https://rustup.rs). The toolchain file installs the version, the wasm target and components on first `cargo` run. |
| Stellar CLI | 28.1.0 | `cargo install --locked stellar-cli --version 28.1.0`, or a release binary |
| Node.js | 24 LTS | `nvm use` reads `.nvmrc` |
| pnpm | 12.14.0 | `npm install -g pnpm@12`. Corepack cannot install pnpm 11+. |
| Docker | any recent | for Postgres once VX-107 lands |

On Windows, use Git Bash or WSL for the `.sh` scripts.

## Quickstart

```sh
pnpm install

# Contracts
pnpm contracts:lint      # fmt --check + clippy -D warnings
pnpm contracts:test      # cargo test --workspace
pnpm contracts:build     # stellar contract build -> target/wasm32v1-none/release/vaeltrix_*.wasm

# TypeScript
pnpm build               # every package and service
pnpm typecheck
pnpm lint
pnpm test                # Vitest across packages and services
pnpm test:vectors        # Rust + TS vector suites, same as the CI vectors job
```

Testnet scripts (`deploy:testnet`, `seed:testnet`, `bindings`, `demo:breach`, …) are wired in `package.json` but exit with "not implemented (VX-xxx)" until their issue lands.

## Conventions (guide §0.2, §17)

- **Money and time are integers:** `i128` / `u64` in Rust, `bigint` in TypeScript. Amounts are in the asset's smallest unit (1 USDC = `10_000_000`).
- **Error handling:** no `unwrap`, `expect` or `panic!` in contract code. The workspace lints deny them, and tests are exempt via `clippy.toml`.
- **Branches and commits:** branches are `type/short-description`. Commit titles are conventional (`feat(bond): resolve upheld claims`). Pull requests are squash-merged.
- **Pull requests:** one issue per PR, using `.github/pull_request_template.md`. An interface change updates the guide in the same PR.
- **Done means:**
  - `cargo clippy -- -D warnings` and `tsc --noEmit` are clean.
  - The issue's named tests exist and pass in CI.

## GitHub setup

1. Push the repo, then run `scripts/labels.sh` (needs the authenticated `gh` CLI) to create the §16.1 labels.
2. Protect `main`, requiring the `rust`, `ts` and `vectors` checks.
3. Open issues from the §16 backlog using the **VX task** template. VX-904 automates bulk creation.
