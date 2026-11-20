# vaeltrix-iso

Read-only bridge that translates `vaeltrix_bond` contract events into ISO
20022 messages for provider treasuries and beneficiary institutions
(Vaeltrix × Stellar Go integration plan, Phase 1 — `docs/stellar-go-integration.md`).

This PR adds the event substrate: it tails `getEvents` over Soroban RPC,
decodes the six bond topics into typed events and emits them as JSONL on
stdout. camt.054/053 emission lands next; the service signs nothing and
holds no keys.

## Run

```sh
cd services/vaeltrix-iso
go run ./cmd/vaeltrix-iso --manifest ../../deployments/testnet.json --commitment-id 1
# follow mode
go run ./cmd/vaeltrix-iso --manifest ../../deployments/testnet.json --follow
```

| Flag | Default | Purpose |
|---|---|---|
| `--manifest` | `deployments/testnet.json` | Contract IDs + start ledger |
| `--rpc-url` | manifest `rpcUrl` | Soroban RPC override |
| `--state` | `.vaeltrix-iso/cursor` | Persisted getEvents cursor |
| `--follow` | off | Poll forever vs drain-and-exit |
| `--poll-interval` | `5s` | Delay between `--follow` polls |
| `--commitment-id` | `0` (all) | Filter to one commitment |

## Retention caveat

Soroban RPC keeps a bounded event history — the stock retention window is
120,960 ledgers, about 7 days (inspect it via the `getHealth` method).
Consequences:

- On a cold start the service clamps the manifest `startLedger` to the
  node's `oldestLedger` and logs a warning, instead of failing on a range
  error. Events older than the window are unreachable over RPC.
- A cursor older than the window is equally unresumable: an outage longer
  than retention loses the gap. `--follow` is fail-fast — a supervisor or
  the future indexer path owns recovery.
- Commitment 1's `commit` event (Oct 21) is already outside the window, so
  a live run today drains nothing. `internal/events` carries the real
  topic/value XDR from the seed transactions as fixtures; to demo the live
  path end-to-end, emit a fresh bond event on testnet first (e.g. a new
  `commit` or `pause`/`resume` pair).

Once the indexer and REST API (VX-701) ship, the event source switches to
reading them, with this RPC path kept as fallback.
