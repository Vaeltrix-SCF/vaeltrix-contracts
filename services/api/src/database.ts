/** Effective SELECT-only role on every pooled connection (VX-704). */
import pg from "pg";
export const readonlyRole = "vaeltrix_api_readonly";
export function readonlyPool(connectionString: string): pg.Pool {
  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol) || url.searchParams.has("options"))
    throw new Error("API_DATABASE_URL must be a PostgreSQL URL without options overrides");
  return new pg.Pool({
    connectionString,
    options: `-c role=${readonlyRole} -c default_transaction_read_only=on`,
    connectionTimeoutMillis: 10_000,
    max: 10,
  });
}
export async function verifyReadonly(pool: pg.Pool): Promise<void> {
  const { rows } = await pool.query<{ role: string; readonly: string; writes: boolean }>(`
    select current_user as role, current_setting('transaction_read_only') as readonly,
      coalesce((select bool_or(has_table_privilege(current_user, c.oid,
        'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'))
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind in ('r', 'p')), false) as writes
  `);
  const state = rows[0];
  if (!state || state.role !== readonlyRole || state.readonly !== "on" || state.writes)
    throw new Error("API requires the SELECT-only database role");
}
