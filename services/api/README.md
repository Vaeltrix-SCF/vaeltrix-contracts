# @vaeltrix/api

Fastify foundation for the read-only API (guide §13.3, VX-704).
Business endpoints are VX-705; the foundation serves `/healthz` and `/v1/openapi.json`.
OpenAPI 3.1 paths, query/path parameters and responses come from registered `/v1` route schemas.

## Run

Apply migrations with `pnpm db:migrate`. The migration administrator needs permission
to create the `vaeltrix_api_readonly` group role. Provision a dedicated login with your
normal database credential process, then grant it membership:

```sql
create role vaeltrix_api_login login;
grant vaeltrix_api_readonly to vaeltrix_api_login;
```

Set `API_DATABASE_URL` in `.env` for that login, then run `pnpm --filter @vaeltrix/api dev`.
The service binds to `127.0.0.1:4000`, verifies the effective SELECT-only role, and
sets that role and read-only transaction default on **every** pooled connection.
URL `options` overrides are rejected. Credentials and raw database errors are not logged.
The role has no writes or sequence privileges; new migration-owned tables receive SELECT automatically.

## Route conventions

- Use `paginationSchema` and `pagination(request.query)` for a default 50 / maximum 200 limit.
- Return `page(items, nextId)`; opaque cursors encode the last stable row ID.
- Use `amountFields(name, bigint)` for decimal stroops and exact seven-decimal `_display` siblings.
- Return timestamps as UTC ISO 8601 strings; retain `_ms` on raw millisecond fields.
- Errors use `{ "error": { "code": "...", "message": "..." } }` and matching HTTP status.
- GET responses under `/v1` are cached for five seconds, capped at 1,000 entries. GET CORS is open.

Run `pnpm test` for HTTP/helper tests. Set a disposable `DATABASE_TEST_URL` to enable
the migration tests, including SELECT success and write failures under the API role.
