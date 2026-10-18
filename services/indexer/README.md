# @vaeltrix/indexer

Replays contract events from startLedger into Postgres projections (guide §13.1-13.2).

Port `4002`. First issue: **VX-701**.

## Planned layout

```
index.ts        event loop + cursor (§13.1)
handlers/       one projection handler per event topic (§13.2, §8.4)
reconcile.ts    rebuild projections from contract view calls (VX-703)
```
