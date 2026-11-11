import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { rpc } from "@stellar/stellar-sdk";
import pg from "pg";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cursorName, pollOnce, RetentionGap } from "../src/ingest.js";

const contracts = {
  // The fee events below are the recorded XDR sample from Stellar's getEvents docs.
  registry: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  bond: "CCYLDMTA4CTFF2VHULUCCBNCBMN3G7MA33EZ2OFYMIRSIKX3PYUHCUAI",
  scoreboard: "CD4TA5VDQUHF2LV5H5LWQSXRUSWTQYZN23MONYYUZQAJ5JBOEGYAP5EC",
};
const start = 3_729_796;
const common = {
  type: "contract",
  ledger: start,
  ledgerClosedAt: "2026-07-21T20:44:01Z",
  contractId: contracts.registry,
  transactionIndex: 0,
  operationIndex: 0,
};
const first = {
  ...common,
  id: "0016019351840751616-0000000000",
  topic: ["AAAADwAAAANmZWUA", "AAAAEgAAAAAAAAAAA+0oimKONzC713z+Cl8orRHR8/s0JY+JMothA0fY7bY="],
  value: "AAAACgAAAAAAAAAAAAAAAAAAAGQ=",
  txHash: "dd2f693c5d874ed09f2de0a4edbc453a0a74fe3e44a40e8a4017bd47a1708ffd",
};
const second = {
  ...common,
  id: "0016019351840751616-0000000001",
  topic: ["AAAADwAAAANmZWUA", "AAAAEgAAAAAAAAAAHvWJXEUjo0G/RW4K3B2oCbR8OHbnLlCyfD3iKAnjKPY="],
  value: "AAAACgAAAAAAAAAAAAAAAAAAASw=",
  txHash: "3fcd635d285c5b3a4d9b65a10f6c70c11132d8fafd32e82fea79103eb1a05924",
};

function fixture(...pages: { events: (typeof first)[]; cursor: string }[]) {
  const fetch = vi.fn(async (_url: unknown, init: RequestInit) => {
    const request = JSON.parse(String(init.body)) as { id: unknown; method: string };
    expect(request.method).toBe("getEvents");
    const page = pages.shift();
    if (!page) throw new Error("Unexpected RPC page request");
    return Response.json({
      jsonrpc: "2.0",
      id: request.id,
      result: { ...page, latestLedger: start, oldestLedger: start - 500 },
    });
  });
  vi.stubGlobal("fetch", fetch);
  const server = new rpc.Server("https://soroban-testnet.stellar.org");
  const params = (index: number) =>
    JSON.parse(String(fetch.mock.calls[index]?.[1].body)).params as unknown;
  return { server, params };
}

afterEach(() => vi.unstubAllGlobals());
const url = process.env.DATABASE_TEST_URL;
describe.skipIf(!url)("Indexer Postgres replay", () => {
  const schema = `indexer_test_${randomBytes(8).toString("hex")}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  const newPool = () => new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) {
      throw new Error("A disposable DATABASE_TEST_URL ending in _test is required");
    }
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = newPool();
    const migration = await readFile(
      new URL("../../../db/migrations/0001_core.sql", import.meta.url),
      "utf8",
    );
    await pool.query(migration);
  });

  beforeEach(async () => {
    await pool.query("truncate chain_events, cursors");
  });

  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });

  it("resumes inside a ledger without duplicate events or skipped rows", async () => {
    const { server, params } = fixture(
      { events: [first], cursor: first.id },
      { events: [first, second], cursor: second.id },
      { events: [], cursor: second.id },
    );
    await expect(pollOnce(pool, server, contracts, start)).resolves.toBe(1);
    expect(params(0)).toMatchObject({
      startLedger: start,
      pagination: { limit: 200 },
      filters: [{ type: "contract", contractIds: Object.values(contracts) }],
    });
    await pool.end();
    pool = newPool();

    await expect(pollOnce(pool, server, contracts, start)).resolves.toBe(2);
    await expect(pollOnce(pool, server, contracts, start)).resolves.toBe(0);
    expect(params(1)).toMatchObject({ pagination: { cursor: first.id } });
    expect(params(1)).not.toHaveProperty("startLedger");
    expect(params(2)).toMatchObject({ pagination: { cursor: second.id } });

    const events = await pool.query(
      "select id, contract, topic, data, processed from chain_events order by id",
    );
    expect(events.rows).toEqual([
      { id: first.id, contract: "registry", topic: "fee", data: "100", processed: false },
      { id: second.id, contract: "registry", topic: "fee", data: "300", processed: false },
    ]);
    const cursors = await pool.query("select name, ledger, paging_token from cursors");
    expect(cursors.rows).toEqual([
      { name: cursorName, ledger: String(start), paging_token: second.id },
    ]);
  });

  it("rolls back the page and cursor together when an insert fails", async () => {
    const page = { events: [first, second], cursor: second.id };
    const { server, params } = fixture(page, page);
    await pool.query(
      `alter table chain_events add constraint reject_fee check (data <> '"300"'::jsonb)`,
    );
    try {
      await expect(pollOnce(pool, server, contracts, start)).rejects.toThrow("reject_fee");
      expect((await pool.query("select id from chain_events")).rows).toEqual([]);
      expect((await pool.query("select name from cursors")).rows).toEqual([]);
    } finally {
      await pool.query("alter table chain_events drop constraint reject_fee");
    }

    await expect(pollOnce(pool, server, contracts, start)).resolves.toBe(2);
    expect(params(1)).toMatchObject({ startLedger: start });
  });

  it("discards an older page that returns after another poll advanced the cursor", async () => {
    const { server } = fixture(
      { events: [first], cursor: first.id },
      { events: [first, second], cursor: second.id },
    );
    const getEvents = server.getEvents.bind(server);
    const requested = Promise.withResolvers<undefined>();
    const release = Promise.withResolvers<undefined>();
    vi.spyOn(server, "getEvents").mockImplementationOnce(async (args) => {
      const page = await getEvents(args);
      requested.resolve(undefined);
      await release.promise;
      return page;
    });

    const older = pollOnce(pool, server, contracts, start);
    await requested.promise;
    try {
      await expect(pollOnce(pool, server, contracts, start)).resolves.toBe(2);
    } finally {
      release.resolve(undefined);
      await older;
    }
    expect((await pool.query("select paging_token from cursors")).rows).toEqual([
      { paging_token: second.id },
    ]);
  });

  it("keeps an expired checkpoint intact and reports a reconciliation gap", async () => {
    await pool.query("insert into cursors (name, ledger, paging_token) values ($1, $2, $3)", [
      cursorName,
      start,
      first.id,
    ]);
    const server = {
      getEvents: vi.fn().mockRejectedValue(new Error("out of range")),
      getHealth: vi.fn().mockResolvedValue({ oldestLedger: start + 1 }),
    };
    await expect(pollOnce(pool, server, contracts, start)).rejects.toBeInstanceOf(RetentionGap);
    expect((await pool.query("select paging_token from cursors")).rows).toEqual([
      { paging_token: first.id },
    ]);
  });
});
