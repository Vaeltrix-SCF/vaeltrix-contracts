# @vaeltrix/mock-anchor

SEP-31-shaped receiving anchor for demos. Test infrastructure only; refuses to start on the public network (guide §14.3).

Port `4100`. First issue: **VX-802**.

## Planned layout

```
index.ts        GET /info, POST /transactions, GET /transactions/:id,
                /.well-known/stellar.toml, /vaeltrix.json
watcher.ts      Horizon payments stream, memo matching
behaviours.ts   on_time | late | never | hold | backdate | invalid_beneficiary
```
