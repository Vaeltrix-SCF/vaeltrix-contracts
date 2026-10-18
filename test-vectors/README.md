# Shared test vectors

Shared by the Rust and TypeScript suites so on-chain and off-chain logic can never drift (guide §4.6). CI's `vectors` job fails if either side disagrees with these files.

| File | Consumed by | Filled by |
| --- | --- | --- |
| `verdict.json` | `crates/vaeltrix-verdict/tests/vectors.rs`, `packages/core/test/vectors.test.ts` | VX-105 (≥ 40 cases) |
| `ids.json` | `crates/vaeltrix-types/tests/vectors.rs`, `packages/core/test/vectors.test.ts` | VX-105 (≥ 5 cases) |
| `receipts.json` | `crates/vaeltrix-verdict/tests/vectors.rs`, `packages/core/test/vectors.test.ts` | VX-105 (≥ 3 cases, §4.4 layout) |

Each file is a JSON array of objects. Case shape (from §4.6):

```json
{ "name": "late by one ms past grace", "fn": "evaluate",
  "input": { "t0_ms": 1760000000000, "t1_ms": 1760003720001, "now_ms": 1760010000000,
             "target_ms": 3600000, "grace_ms": 120000, "pause_ms": 0 },
  "expect": { "verdict": "Late", "latency_ms": 3720001 } }
```

Integers that can exceed 2^53 (amounts, i128) are written as decimal strings.
