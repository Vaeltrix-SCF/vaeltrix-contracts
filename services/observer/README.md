# @vaeltrix/observer

Turns payment reality into claims: event API, ledger watcher, breach detector, claim filer, keeper (guide §12).

Port `4001`. First issue: **VX-601**.

## Planned layout

```
index.ts            boots config, db, chain client, http, loops
config.ts           zod-validated env + deployments file
chain/client.ts     bindings clients + keypair signer
chain/submit.ts     serialized submission queue (§12.10)
chain/ledger.ts     latestLedgerCloseMs, getTx, Horizon fallback
http/auth.ts        signed-request auth (§12.3)
http/payments.ts    POST /v1/payments
http/events.ts      POST /v1/events
http/delegate.ts    POST /v1/claims/delegate
http/evidence.ts    POST /v1/counter-evidence, GET /v1/evidence/:hash
loops/settlement.ts, sep31Poller.ts, breachDetector.ts, jobRunner.ts, keeper.ts, attester.ts, batchPublisher.ts
evidence/bundle.ts, evidence/attestation.ts
```
