import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Contract, nativeToScVal, type rpc } from "@stellar/stellar-sdk";
import pg from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SlaTemplate } from "@vaeltrix/bindings-registry";
import { pollOnce, type ContractName } from "../src/ingest.js";
import { createProjector } from "../src/projections.js";

const contracts = {
  registry: "CBBZQ577QYKADNBAYBYN56Q3ZDTDQYCBOGREHBFEVOWOI5F27TJBE6MO",
  bond: "CCYLDMTA4CTFF2VHULUCCBNCBMN3G7MA33EZ2OFYMIRSIKX3PYUHCUAI",
  scoreboard: "CD4TA5VDQUHF2LV5H5LWQSXRUSWTQYZN23MONYYUZQAJ5JBOEGYAP5EC",
};
const provider = Buffer.alloc(32, 1);
const payment = Buffer.alloc(32, 2);
const key = Buffer.alloc(32, 3);
const account = "GAXN3KJT36RUDCOFGVUIUAD6IXWHGC5X3RIZQPV6A222GL4YZEYDG5UT";
const template: SlaTemplate = {
  id: 901,
  version: 1,
  activates_at: 100n,
  carve_outs: [],
  claim_window_secs: 600n,
  end_event: { tag: "ReceiverCreditConfirmed", values: undefined },
  evidence_mode: { tag: "ObserverOnly", values: undefined },
  grace_ms: 10_000n,
  max_hold_ms: 60_000n,
  metric: { tag: "TimeToCompletion", values: undefined },
  penalty: { tag: "PerBreachBps", values: [{ bps: 500, cap: 1_000_000_000n }] },
  scope: {
    asset: contracts.scoreboard,
    direction: { tag: "Inbound", values: undefined },
    max_amount: 100_000_000_000n,
    min_amount: 10_000_000n,
    payout_rail: null,
    receiver_country: null,
    sender_country: null,
  },
  start_event: { tag: "OnChainSettled", values: undefined },
  status: { tag: "Active", values: undefined },
  target_ms: 120_000n,
};

type EventInput = [ContractName, string, unknown?, unknown?];
function events(specs: EventInput[], offset = 0): rpc.Api.EventResponse[] {
  return specs.map(([contract, topic, keyValue, data], index) => ({
    id: String(offset + index + 1).padStart(4, "0"),
    type: "contract",
    contractId: new Contract(contracts[contract]),
    ledger: 100 + offset + index,
    ledgerClosedAt: "2026-10-22T11:00:00Z",
    transactionIndex: 1,
    operationIndex: 0,
    inSuccessfulContractCall: true,
    topic: [
      nativeToScVal(topic, { type: "symbol" }),
      ...(keyValue === undefined ? [] : [nativeToScVal(keyValue)]),
    ],
    value: nativeToScVal(data ?? null),
    txHash: "a".repeat(64),
  }));
}

function source(...pages: rpc.Api.EventResponse[][]) {
  return {
    getEvents: vi.fn<rpc.Server["getEvents"]>(async () => {
      const page = pages.shift();
      const last = page?.at(-1);
      if (!page || !last) throw new Error("Unexpected page request");
      return {
        events: page,
        cursor: last.id,
        latestLedger: last.ledger,
        oldestLedger: 100,
        latestLedgerCloseTime: "100",
        oldestLedgerCloseTime: "100",
      };
    }),
    getHealth: vi.fn<rpc.Server["getHealth"]>(),
  };
}

const url = process.env.DATABASE_TEST_URL;
describe.skipIf(!url)("Indexer projections on PostgreSQL", () => {
  const schema = `projection_test_${randomBytes(8).toString("hex")}`;
  let admin: pg.Pool;
  let pool: pg.Pool;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) {
      throw new Error("A disposable DATABASE_TEST_URL ending in _test is required");
    }
    admin = new pg.Pool({ connectionString: url });
    await admin.query(`create schema ${schema}`);
    pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema}` });
    for (const name of ["0001_core.sql", "0003_indexer_projections.sql"]) {
      await pool.query(
        await readFile(new URL(`../../../db/migrations/${name}`, import.meta.url), "utf8"),
      );
    }
  });
  beforeEach(async () => {
    await pool.query(
      "truncate cursors, chain_events, providers, templates, observers, commitments, payments, claims, claim_votes, batches cascade",
    );
  });
  afterAll(async () => {
    await pool?.end();
    if (admin) {
      await admin.query(`drop schema if exists ${schema} cascade`);
      await admin.end();
    }
  });

  it("projects the catalog in order and replays without changing the resulting tables", async () => {
    const commit = {
      provider_id: provider,
      template_id: 901,
      version: 1,
      stake_asset: contracts.scoreboard,
      amount: 1_000n,
    };
    const setup = events([
      ["registry", "init"],
      ["registry", "adm_prop"],
      ["registry", "adm_set"],
      ["registry", "act_prop"],
      ["registry", "act_exec"],
      ["registry", "act_canc"],
      ["registry", "prov_reg", provider, { admin: account, home_domain: "anchor.example" }],
      ["registry", "prov_sig", provider, { new_value: [key] }],
      ["registry", "prov_meta", provider, { new_value: "https://anchor.example" }],
      ["registry", "prov_ver", provider],
      ["registry", "prov_unv", provider],
      ["registry", "prov_sus", provider],
      ["registry", "prov_rein", provider],
      ["registry", "prov_ver", provider],
      ["registry", "tmpl_prop", 901, { version: 1, activates_at: 100n }],
      ["registry", "tmpl_act", 901, { version: 1 }],
      ["registry", "tmpl_canc", 901, { version: 2 }],
      ["registry", "tmpl_dep", 901, { version: 2 }],
      ["registry", "obs_add", account, { key }],
      ["registry", "obs_rm", account],
      ["bond", "upg_prop"],
      ["bond", "upg_exec"],
      ["bond", "commit", 1n, commit],
      ["bond", "commit", 2n, commit],
      ["bond", "stake_chg", 1n, { new_total: 1_200n }],
      ["bond", "cmt_pause", 1n, { at: 100n }],
      ["bond", "cmt_resum", 1n, { at: 101n }],
      ["scoreboard", "bond_set"],
    ]);
    const filing = events(
      [
        [
          "bond",
          "claim_new",
          1n,
          {
            commitment_id: 1n,
            payment_id: payment,
            breach: ["LateCompletion"],
            claimant: account,
            beneficiary: account,
            penalty: 100n,
            reserved: 100n,
            shortfall: 0n,
            bond: 20n,
          },
        ],
        ["bond", "claim_chal", 1n, { counter_evidence_hash: key }],
        ["bond", "claim_att", 1n, { observer: account, uphold: true, attestation_hash: key }],
      ],
      setup.length,
    );
    const settlement = events(
      [
        ["bond", "claim_res", 1n, { outcome: ["Upheld"], amount_paid: 100n }],
        ["bond", "exit_req", 2n, { at: 200n }],
        ["bond", "exit_fin", 2n, { at: 300n, amount: 1_000n }],
        [
          "scoreboard",
          "batch",
          1n,
          { period: 99n, observer: account, merkle_root: key, stats: { volume: 123n } },
        ],
        ["scoreboard", "claim_out", 1n],
        ["scoreboard", "future_evt"],
      ],
      setup.length + filing.length,
    );
    const rpc = source(setup, filing, settlement, [...setup, ...filing, ...settlement]);
    const unknown = vi.fn();
    const project = createProjector(
      {
        provider: async () => ({ signers: [provider], metadata_uri: "" }),
        template: async (_id, version) => ({ ...template, version }),
        claim: async () => ({ challenge_deadline: 180n }),
      },
      unknown,
    );

    // Simulate upgrading from VX-701 with a raw backlog already committed.
    await pollOnce(pool, rpc, contracts, 100);
    expect((await pool.query("select count(*) from providers")).rows[0].count).toBe("0");
    await pollOnce(pool, rpc, contracts, 100, project);
    expect(rpc.getEvents).toHaveBeenCalledTimes(1);
    await pool.query(
      `insert into payments (payment_id, sep31_tx_id, provider_id, commitment_id, amount, asset, status)
       values ($1, 'pay-1', $2, 1, 100, $3, 'breached')`,
      [payment.toString("hex"), provider.toString("hex"), contracts.scoreboard],
    );

    await pollOnce(pool, rpc, contracts, 100, project);
    expect(
      (await pool.query("select stake_reserved from commitments where commitment_id = 1")).rows[0]
        .stake_reserved,
    ).toBe("100");
    expect((await pool.query("select status, claim_id from payments")).rows).toEqual([
      { status: "claimed", claim_id: "1" },
    ]);
    expect(
      (await pool.query("select status, votes_for, attestation_deadline from claims")).rows,
    ).toEqual([{ status: "challenged", votes_for: 1, attestation_deadline: null }]);

    await pollOnce(pool, rpc, contracts, 100, project);
    expect((await pool.query("select status, amount_paid from claims")).rows).toEqual([
      { status: "paid", amount_paid: "100" },
    ]);
    expect((await pool.query("select status from payments")).rows).toEqual([
      { status: "resolved" },
    ]);
    expect(
      (
        await pool.query(
          "select status, stake_total, stake_reserved from commitments order by commitment_id",
        )
      ).rows,
    ).toEqual([
      { status: "active", stake_total: "1100", stake_reserved: "0" },
      { status: "exited", stake_total: "0", stake_reserved: "0" },
    ]);
    expect((await pool.query("select verified, signers, status from providers")).rows).toEqual([
      { verified: true, signers: [key.toString("hex")], status: "active" },
    ]);
    expect((await pool.query("select status from templates order by version")).rows).toEqual([
      { status: "active" },
      { status: "deprecated" },
    ]);
    expect((await pool.query("select active from observers")).rows).toEqual([{ active: false }]);
    expect((await pool.query("select stats from batches")).rows).toEqual([
      { stats: { volume: "123" } },
    ]);
    expect(unknown).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ topic: "future_evt" }),
    );

    const dump = async () => {
      const tables = [
        "providers",
        "templates",
        "observers",
        "commitments",
        "payments",
        "claims",
        "claim_votes",
        "batches",
        "chain_events",
      ];
      return Promise.all(
        tables.map(async (t) => (await pool.query(`select * from ${t} order by 1`)).rows),
      );
    };
    const before = await dump();
    await pool.query("delete from cursors");
    await pollOnce(pool, rpc, contracts, 100, project);
    expect(await dump()).toEqual(before);
    expect(unknown).toHaveBeenCalledTimes(1);
  });

  it("does not advance the cursor when a projection fails after inserting the page", async () => {
    const rpc = source(
      events([
        ["registry", "prov_reg", provider, { admin: account, home_domain: "anchor.example" }],
      ]),
    );
    const project = createProjector(
      {
        provider: async () => {
          throw new Error("view unavailable");
        },
        template: async () => template,
        claim: async () => ({ challenge_deadline: 180n }),
      },
      vi.fn(),
    );
    await expect(pollOnce(pool, rpc, contracts, 100, project)).rejects.toThrow("view unavailable");
    expect((await pool.query("select id from chain_events")).rows).toEqual([]);
    expect((await pool.query("select name from cursors")).rows).toEqual([]);
  });
});
