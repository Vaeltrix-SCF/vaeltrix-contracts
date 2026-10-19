# Migrations

Plain SQL, numbered `NNNN_name.sql`, applied in order and never edited after merge
(guide §11.2, VX-107). The core SQL follows the guide's SQL block exactly; layout
and wrapped comments are normalized.

## Local development

1. Copy `.env.example` to `.env` and retain the local `DATABASE_URL`.
2. Run `docker compose up -d --wait postgres` (Postgres 16, persistent named volume,
   port bound to localhost). Set `POSTGRES_PORT` if 5432 is already in use and
   adjust `DATABASE_URL` accordingly.
3. Run `pnpm db:migrate`. Repeat safely: applied files are checksummed and skipped.
4. Run `pnpm db:reset` to **delete the public schema and all its data** in the local
   development database, then reapply migrations. Reset refuses remote hosts.

The runner loads `.env` without overriding existing environment variables. It
serializes runners with an advisory lock and commits each migration and its
`schema_migrations` entry together. Changed or missing applied migrations fail;
add a new numbered file instead of editing history. Connection details are never
printed by the CLI. Reset is destructive; use only a disposable local database.

## Verification

Create a dedicated local database, then run:

```sh
DATABASE_TEST_URL=postgres://vaeltrix:vaeltrix@127.0.0.1:5432/vaeltrix_migrations_test pnpm exec vitest run scripts/db.test.ts
```

This test database's public schema is deleted. Tests intentionally use
`DATABASE_TEST_URL`, never the application's `DATABASE_URL`. Without the test URL,
only the remote-reset guard test runs. CI provisions Postgres 16 and runs the full
suite, including two consecutive CLI reset/migrate cycles, atomic rollback,
checksummed history, exact i128 precision and job uniqueness.
