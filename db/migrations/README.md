# Migrations

Plain SQL, numbered `NNNN_name.sql`, applied in order by `pnpm db:migrate`, never edited after merge (guide §11.2).

`0001_core.sql`, the Docker Compose Postgres service and the migration runner (`scripts/db.ts`) are **VX-107**.
