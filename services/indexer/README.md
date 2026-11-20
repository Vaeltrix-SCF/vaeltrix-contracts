# @vaeltrix/indexer

Stores Stellar Testnet events for the Registry, Bond and Scoreboard contracts
using the deployment manifest's contract IDs and starting ledger.

Apply the database migrations with `pnpm db:migrate`, set `DATABASE_URL`, and run
`pnpm --filter @vaeltrix/indexer dev` from the repository root. The indexer reads
`deployments/testnet.json` by default. Set `DEPLOYMENTS_FILE` to an absolute path
to use a different Testnet deployment, with a separate database for each deployment.
`GET /healthz` is available on port 4002 by default (`INDEXER_PORT`).

Each page and its opaque RPC cursor are stored in the same Postgres transaction.
After restart, the indexer resumes from `indexer:events`. It rejects expired
checkpoints and reports `reconcile_required` without dropping events or resetting
the cursor. Projection handlers update the database before the checkpoint advances.
Previously saved events are replayed in order before polling new pages. Unknown
topics are kept in the event log. See the reconciliation command below.

The Postgres integration suite replays XDR events from the
[Stellar getEvents reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getEvents).
Set `DATABASE_TEST_URL` to a disposable database whose name ends in `_test`
and run `pnpm exec vitest run services/indexer/test/ingest.test.ts`.


## Recover the demo and known IDs

With the correct Testnet manifest and database selected, run
`pnpm indexer:reconcile --apply`. The command refreshes providers known from
the seed, projections, or retained registration events; their commitments and
known template versions; and already indexed open claims. It does not invent
missing transaction hashes or reconstruct unknown providers and claims.

The refresh commits as one database transaction and leaves the event cursor
unchanged. It marks the database as a partial snapshot and stops replay there:
continuing over these balances could apply old stake changes twice. To resume
complete indexing, rebuild a fresh database from an archive covering the gap.
