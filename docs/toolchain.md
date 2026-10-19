# Toolchain and integrations

Checked on **18 Oct 2026** against the official release pages listed under Sources. The guide (§3.2) pins `soroban-sdk` / `stellar-cli` 27.x but tells us to confirm against the live testnet protocol before pinning. The network has moved on twice since the guide was written, so this file records what was pinned and why.

Re-check this file whenever Stellar announces a protocol upgrade.

## Pinned versions

| Tool | Guide §3.2 | Pinned here | Where |
| --- | --- | --- | --- |
| Network protocol | 27 (assumed) | **29** (testnet since 29 Sep, mainnet since 1 Oct 2026) | n/a |
| `soroban-sdk` | 27.x | **29.0.1** | `Cargo.toml` `[workspace.dependencies]` |
| Rust | stable | **1.97.0** (SDK MSRV is 1.91) | `rust-toolchain.toml` |
| Contract target | `wasm32v1-none` | `wasm32v1-none` (unchanged) | `rust-toolchain.toml` |
| `stellar-cli` | 27.x | **28.1.0** (recommended CLI for Protocol 29) | CI action `stellar/stellar-cli@v28.1.0` |
| `proptest` | 1.x | 1.x | bond dev-dependency |
| Node.js | 22 LTS | **24 LTS** (22 still works; JS SDK needs ≥ 22.12) | `.nvmrc`, `engines` |
| pnpm | 9.x | **12.14.0** | `packageManager` in `package.json` |
| TypeScript | 5.x | **6.0.x** (see below) | root `devDependencies` |
| `@stellar/stellar-sdk` | latest | **17.2.1** | packages, services, scripts |
| Fastify | 5.x | 5.12 | services |
| Kysely | latest | 0.29 | services |
| Vitest | latest | 5.0 | root |
| ESLint | n/a | 10 with `typescript-eslint` 8.71 | root |
| zod | n/a | 4.x | packages, services |
| Postgres | 16 | not pinned yet (VX-107) | `docker-compose.yml` (VX-107) |

## Changes that affect this codebase

### Soroban Rust SDK 28 to 29 (contracts)

- **Build only with `stellar contract build`, from CLI ≥ 25.2.** Since SDK 28, spec shaking v2 is always on: the SDK emits spec entries for every type and the CLI strips the unused ones after compilation. A plain `cargo build --target wasm32v1-none` produces a contract with a bloated spec. Native builds and unit tests are unaffected.
- **No `export = ...` or `lib = ...` arguments** on `#[contracttype]`, `#[contracterror]` or `#[contractevent]`. They are compile errors now. Shared types in `vaeltrix-types` need no special arguments to appear in each contract's spec.
- **Events omit unset fields.** In a `#[contractevent]` with `data_format = "map"`, a field that is `None` or void is left out of the published map instead of written with a void value. The indexer's projection handlers (§13.2) must tolerate missing keys, for example `attestation_deadline` before a challenge.
- **Migration-friendly storage.** Unpacking a `#[contracttype]` struct now uses the Protocol 28 sparse-map host functions (CAP-86), so an `Option` field can be added later without migrating stored entries. Removing or renaming fields still needs care.
- **Upgrade API:** `update_current_contract_wasm` is deprecated in SDK 29. Use `env.deployer().update_current_contract(ContractExecutable::Wasm(hash))`; this selects the same underlying Wasm upgrade host operation while preserving the guide's public Upgrade action.
- **Protocol 29 is a security release with no new CAPs.** SDK 29 only moves the env crates to 29, so test environments can load post-upgrade ledger snapshots. Nothing in §4 to §8 of the guide changes.

### Stellar CLI 28

- `stellar contract build` optimises wasm by default (since 27.x); no `--optimize` flag needed.
- `stellar contract bindings typescript` is **deprecated**. Use the generator that ships with the JS SDK. `scripts/bindings.sh` (VX-504) should call:

  ```sh
  pnpm --filter @vaeltrix/scripts exec stellar-js generate \
    --contract-id <C...> --network testnet \
    --contract-name registry --output-dir packages/bindings/registry --overwrite
  ```

  It also installs as the `stellar-contract-bindings-typescript` CLI plugin and will take over the old command name once the CLI drops its native version.
- Failed transactions now print their diagnostic events, which helps when debugging `file_claim` simulations.

### JS Stellar SDK 17

- `@stellar/stellar-base` has been merged into `@stellar/stellar-sdk`. Import everything (XDR, `Keypair`, `StrKey`, contract client, RPC) from `@stellar/stellar-sdk` and never add `stellar-base` as a dependency.
- Protocol 27 introduced address-bound Soroban credentials (`SOROBAN_CREDENTIALS_ADDRESS_V2`), and the Protocol 27 upgrade guide said V2 replaces V1 at Protocol 28. SDK 17 handles this when signing auth entries; it is one more reason not to sign auth by hand.
- Default testnet RPC is `https://soroban-testnet.stellar.org` (unchanged).

### pnpm 12

- **Corepack cannot install pnpm 11+.** Those versions ship as standalone native executables. Install with `npm install -g pnpm@12` or the standalone installer from pnpm.io, then pnpm reads `packageManager` from `package.json`.
- **Dependency build scripts are blocked unless allowlisted.** An unapproved one fails the install (`ERR_PNPM_IGNORED_BUILDS`). `pnpm-workspace.yaml` allowlists `esbuild` (used by `tsx` and Vitest). Add new entries there deliberately, never with a blanket allow.

### TypeScript 6.0, not 7

TypeScript 7 (the native compiler) is the npm `latest`, but `typescript-eslint` 8.71 only supports TypeScript `< 6.1`. The repo pins `~6.0.3` so linting works. Revisit when `typescript-eslint` widens its peer range.

### Node 24

Node 24 is the active LTS. The JS SDK, Vitest 5 and pnpm 12 all support it. CI reads `.nvmrc`.

## CI actions

| Action | Version |
| --- | --- |
| `actions/checkout` | v7 |
| `actions-rust-lang/setup-rust-toolchain` | v2 (reads `rust-toolchain.toml`, caches with `Swatinem/rust-cache`, sets `RUSTFLAGS=-D warnings`) |
| `stellar/stellar-cli` | v28.1.0 (action tag = CLI version) |
| `pnpm/action-setup` | v6 (reads `packageManager`) |
| `actions/setup-node` | v7 |
| `actions/upload-artifact` | v7 |

## Local setup notes

- **Windows:** the repo works natively or under WSL. `.gitattributes` forces LF so shell scripts and the lockfile behave the same on Windows and CI. Run `scripts/*.sh` from Git Bash or WSL.
- **Missing wasm target:** `rustup` installs it automatically the first time you run `cargo` in the repo, because it is listed in `rust-toolchain.toml`. Otherwise run `rustup target add wasm32v1-none`.
- **Installing the CLI:** `cargo install --locked stellar-cli --version 28.1.0`, or download the binary for your platform from the GitHub release.

## Sources

- [Stellar software versions (per protocol)](https://developers.stellar.org/docs/networks/software-versions)
- [rs-soroban-sdk 28.0.0 release notes](https://github.com/stellar/rs-soroban-sdk/releases/tag/v28.0.0)
- [rs-soroban-sdk 29.0.0 release](https://github.com/stellar/rs-soroban-sdk/releases/tag/v29.0.0)
- [Soroban Rust SDK v28 announcement](https://stellar.org/blog/developers/soroban-rust-sdk-v28)
- [stellar-cli 28.0.0 release notes](https://github.com/stellar/stellar-cli/releases/tag/v28.0.0)
- [stellar-cli releases (27.x: build optimises by default)](https://github.com/stellar/stellar-cli/releases)
- [Adapter, Protocol 28 upgrade guide](https://stellar.org/blog/developers/adapter-protocol-28-upgrade-guide)
- [Zipper, Protocol 27 upgrade guide](https://stellar.org/blog/foundation-news/stellar-zipper-protocol-27-upgrade-guide)
- `@stellar/stellar-sdk` 17.2.1 README, "CLI" section (bundled in the npm package)
- `pnpm/action-setup` v6 README; `actions-rust-lang/setup-rust-toolchain` v2 README
