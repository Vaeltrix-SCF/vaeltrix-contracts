# @vaeltrix/api

Read-only REST API over indexer and observer projections (guide §13.3-13.5).

Port `4000`. First issue: **VX-704**.

## Planned layout

```
index.ts        Fastify app, route schemas, OpenAPI at /v1/openapi.json
routes/         providers, commitments, templates, claims, payments, evidence, network
metrics.ts      derived metrics and score (§13.5)
```
