/** VX-701: append contract events and advance the durable cursor atomically. */
import type { Pool, PoolClient } from "pg";
import { scValToNative, type rpc } from "@stellar/stellar-sdk";
import type { Project, ProjectionEvent } from "./projections.js";

export const cursorName = "indexer:events";
const pageLimit = 200;
export const contractNames = ["registry", "bond", "scoreboard"] as const;
export type ContractName = (typeof contractNames)[number];
export type Contracts = Record<ContractName, string>;
type EventRpc = Pick<rpc.Server, "getEvents" | "getHealth">;

export interface Cursor {
  ledger: number;
  paging_token: string | null;
}
type CursorRow = { ledger: string; paging_token: string | null };
type StoredEvent = {
  id: string;
  ledger: number;
  closedAt: string;
  hash: string;
  contract: ContractName;
  topic: string;
  key: string | null;
  data: string;
};

export class RetentionGap extends Error {
  constructor(cursor: number, oldest: number) {
    super(
      `Indexer checkpoint ${cursor} is outside RPC history (oldest ${oldest}); reconcile required (VX-703)`,
    );
  }
}

function ledger(value: string | number): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 0xffff_ffff) {
    throw new Error("Invalid indexer ledger sequence");
  }
  return n;
}

async function readCursor(
  db: Pool | PoolClient,
  startLedger: number,
  lock = false,
): Promise<Cursor> {
  const { rows } = await db.query<CursorRow>(
    `select ledger, paging_token from cursors where name = $1${lock ? " for update" : ""}`,
    [cursorName],
  );
  const row = rows[0];
  return row
    ? { ledger: ledger(row.ledger), paging_token: row.paging_token }
    : { ledger: startLedger, paging_token: null };
}

function jsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString("hex");
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, jsonSafe(v)]));
  }
  return value ?? null;
}

function decode(event: rpc.Api.EventResponse, contracts: Contracts): StoredEvent | null {
  if (event.inSuccessfulContractCall === false) return null;
  const id = event.contractId?.contractId();
  const contract = contractNames.find((name) => contracts[name] === id);
  if (!contract || event.type !== "contract") {
    throw new Error("RPC returned an event outside the requested contract filter");
  }
  const [rawTopic, rawKey] = event.topic;
  const topic = rawTopic ? (scValToNative(rawTopic) as unknown) : null;
  const key = rawKey ? jsonSafe(scValToNative(rawKey)) : null;
  const closeTime = new Date(event.ledgerClosedAt);
  if (!event.id || !/^[a-f0-9]{64}$/i.test(event.txHash) || Number.isNaN(closeTime.valueOf())) {
    throw new Error("RPC returned an invalid contract event");
  }
  return {
    id: event.id,
    ledger: ledger(event.ledger),
    closedAt: closeTime.toISOString(),
    hash: event.txHash,
    contract,
    topic: typeof topic === "string" ? topic : "unknown",
    key: typeof key === "string" ? key : key === null ? null : JSON.stringify(key),
    data: JSON.stringify(jsonSafe(scValToNative(event.value))),
  };
}

async function transaction<T>(pool: Pool, run: (db: PoolClient) => Promise<T>): Promise<T> {
  const db = await pool.connect();
  try {
    await db.query("begin");
    const result = await run(db);
    await db.query("commit");
    return result;
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

async function projectPending(db: PoolClient, project: Project): Promise<number> {
  const { rows } = await db.query<ProjectionEvent>(
    `select id, ledger, ledger_closed_at, tx_hash, contract, topic, key, data
     from chain_events where not processed order by id limit $1`,
    [pageLimit],
  );
  for (const event of rows) {
    await project(db, event);
    await db.query("update chain_events set processed = true where id = $1", [event.id]);
  }
  return rows.length;
}

async function replayPending(pool: Pool, startLedger: number, project: Project): Promise<number> {
  const { rows } = await pool.query<{ pending: boolean }>(
    "select exists (select 1 from chain_events where not processed) as pending",
  );
  if (!rows[0]?.pending) return 0;
  return transaction(pool, async (db) => {
    // The cursor row also serializes page writes. Existing events and their cursor
    // always committed together, including events stored before VX-702.
    await readCursor(db, startLedger, true);
    return projectPending(db, project);
  });
}

async function storePage(
  pool: Pool,
  startLedger: number,
  expected: Cursor,
  next: Cursor,
  events: StoredEvent[],
  project?: Project,
): Promise<void> {
  await transaction(pool, async (db) => {
    await db.query(
      "insert into cursors (name, ledger) values ($1, $2) on conflict (name) do nothing",
      [cursorName, startLedger],
    );
    const current = await readCursor(db, startLedger, true);
    if (current.ledger !== expected.ledger || current.paging_token !== expected.paging_token)
      return;
    for (const e of events) {
      await db.query(
        `insert into chain_events (id, ledger, ledger_closed_at, tx_hash, contract, topic, key, data)
         values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb) on conflict (id) do nothing`,
        [e.id, e.ledger, e.closedAt, e.hash, e.contract, e.topic, e.key, e.data],
      );
    }
    if (project) await projectPending(db, project);
    await db.query(
      "update cursors set ledger = $2, paging_token = $3, updated_at = now() where name = $1",
      [cursorName, next.ledger, next.paging_token],
    );
  });
}

export async function pollOnce(
  pool: Pool,
  server: EventRpc,
  contracts: Contracts,
  startLedger: number,
  project?: Project,
): Promise<number> {
  if (project) {
    const replayed = await replayPending(pool, startLedger, project);
    if (replayed > 0) return replayed;
  }
  const cursor = await readCursor(pool, startLedger);
  const filters: rpc.Api.EventFilter[] = [
    { type: "contract", contractIds: contractNames.map((name) => contracts[name]) },
  ];
  let page: rpc.Api.GetEventsResponse;
  try {
    page = await server.getEvents(
      cursor.paging_token
        ? { cursor: cursor.paging_token, filters, limit: pageLimit }
        : { startLedger: cursor.ledger, filters, limit: pageLimit },
    );
  } catch (error) {
    const health = await server.getHealth().catch(() => null);
    if (health && cursor.ledger < health.oldestLedger) {
      throw new RetentionGap(cursor.ledger, health.oldestLedger);
    }
    throw error;
  }
  if (!page.cursor) {
    if (page.events.length === 0) return 0;
    throw new Error("RPC returned an event page without a cursor");
  }
  if (page.events.length === 0 && page.cursor === cursor.paging_token) return 0;
  if (page.events.length > 0 && page.cursor === cursor.paging_token) {
    throw new Error("RPC event cursor did not advance");
  }
  const events = page.events.flatMap((event) => {
    const row = decode(event, contracts);
    return row ? [row] : [];
  });
  const next: Cursor = {
    ledger: ledger(page.events.at(-1)?.ledger ?? page.latestLedger),
    paging_token: page.cursor,
  };
  if (next.ledger < cursor.ledger) throw new Error("RPC event cursor moved backwards");
  await storePage(pool, startLedger, cursor, next, events, project);
  return page.events.length;
}
