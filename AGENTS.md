# Agent instructions

You are working in the Vaeltrix monorepo. The build contract is `docs/implementation-guide.pdf`. Its Section 17 is authoritative; this file is a condensed copy plus repo-specific notes.

## Before writing code

1. Take **one** VX issue per session.
2. Read guide §17, §2 (decisions), §3 (layout), §4 (types), then every section on the issue's **Spec** line.
3. Read `docs/toolchain.md`. The repo pins `soroban-sdk` 29 and `stellar-cli` 28, not the 27.x in guide §3.2, and a few APIs changed (event field omission, deprecated bindings command, pnpm build allowlist).

## Rules (guide §17.1)

1. **Interfaces are frozen.** Function names, argument order, struct fields, error codes, event topics and JSON field names come from the guide. To change one, stop and propose the edit under "Guide change" in the PR.
2. **Never weaken a check to pass a test.** If the guide seems wrong, say so in the PR.
3. **Contracts are test-first.** Write the §9.2 named tests, watch them fail, then implement.
4. **Money and time are integers:** `i128` / `u64` in Rust, `bigint` in TypeScript. No floats, no `Number()` on amounts.
5. **Testnet only.** No mainnet passphrase, mainnet RPC URL or real secret anywhere.
6. **No secrets in code or logs.** Read them from env and redact them.
7. **Branch and commit naming:** branch `type/short-description`, conventional commit titles.
8. **No AI attribution** in commits, PRs, comments or code.
9. **No TODO without a linked VX issue number.**
10. **Stop and ask** when:
    - the guide is silent,
    - two sections contradict,
    - a dependency issue isn't merged, or
    - a command needs network access you lack.

## Verify before opening a PR (guide §17.2)

| Area | Commands |
| --- | --- |
| Rust | `cargo fmt --all`, `cargo clippy --workspace --all-targets -- -D warnings`, `cargo test --workspace`, `stellar contract build` |
| TypeScript | `pnpm -r build`, `pnpm -r typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test` |
| Vectors | `pnpm test:vectors` |
| Deploy scripts | `pnpm deploy:testnet --fresh && pnpm seed:testnet && pnpm smoke:testnet` on a throwaway deployments file |

## Repo-specific notes

- Shell modules carry a doc comment naming the issue that fills them. Keep that pointer accurate.
- Workspace clippy lints deny `unwrap_used`, `expect_used` and `panic` outside tests, and warn on `arithmetic_side_effects` (an error in CI). Use `checked_*` and map overflow to `Error::ArithmeticOverflow`.
- Build contracts with `stellar contract build`, not raw `cargo build --target`, so spec shaking runs.
- `packages/bindings/*` is generated. Never hand-edit it; regenerate with `pnpm bindings`.
- Soroban pitfalls are listed in guide §17.5.
