/** VX-703: refresh the demo and known contract IDs without skipping missing history. */
import { pathToFileURL } from "node:url";
import {
  Client as RegistryClient,
  type Provider,
  type SlaTemplate,
} from "@vaeltrix/bindings-registry";
import { Client as BondClient, type Commitment, type Claim } from "@vaeltrix/bindings-bond";
import { Networks, rpc } from "@stellar/stellar-sdk";
import pg from "pg";
import { readConfig } from "./config.js";
import { snapshotName } from "./ingest.js";
import { templateBody, timestamp } from "./projections.js";

type Views = {
  provider(id: Uint8Array): Promise<Provider>;
  commitments(id: Uint8Array): Promise<bigint[]>;
  commitment(id: bigint): Promise<Commitment>;
  template(id: number, version: number): Promise<SlaTemplate>;
  claim(id: bigint): Promise<Claim>;
};

const hex = (bytes: Uint8Array) => Buffer.from(bytes).toString("hex");

export async function reconcile(pool: pg.Pool, views: Views, ledger: number, seed?: string) {
  const db = await pool.connect();
  try {
    await db.query("begin");
    await db.query("lock table cursors in share row exclusive mode");
    const providerKeys = await db.query<{ id: string }>(
      `select provider_id as id from providers
       union select key from chain_events where contract = 'registry' and topic = 'prov_reg' and key is not null`,
    );
    const ids = new Set(providerKeys.rows.map(({ id }) => id));
    if (seed) ids.add(seed);
    if (!ids.size)
      throw new Error("No known provider IDs; a seeded manifest or retained history is required");
    const knownTemplates = await db.query<{ id: number; version: number }>(
      `select template_id as id, version from templates
       union select key::integer, (data->>'version')::integer from chain_events
       where contract = 'registry' and topic in ('tmpl_prop','tmpl_act','tmpl_canc','tmpl_dep')`,
    );
    const templates = new Map(knownTemplates.rows.map((t) => [`${t.id}:${t.version}`, t]));
    let commitments = 0;
    for (const id of ids) {
      if (!/^[a-f0-9]{64}$/.test(id)) throw new Error("Invalid known provider ID");
      const bytes = Buffer.from(id, "hex");
      const p = await views.provider(bytes);
      if (hex(p.id) !== id) throw new Error("Provider view returned a different ID");
      await db.query(
        `insert into providers (provider_id,admin,home_domain,metadata_uri,signers,verified,status,registered_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (provider_id) do update
         set admin=excluded.admin,home_domain=excluded.home_domain,metadata_uri=excluded.metadata_uri,
             signers=excluded.signers,verified=excluded.verified,status=excluded.status,registered_at=excluded.registered_at`,
        [
          id,
          p.admin,
          p.home_domain,
          p.metadata_uri || null,
          p.signers.map(hex),
          p.verified,
          p.status.tag.toLowerCase(),
          timestamp(p.registered_at),
        ],
      );
      for (const idOnChain of await views.commitments(bytes)) {
        const c = await views.commitment(idOnChain);
        if (c.id !== idOnChain || hex(c.provider_id) !== id)
          throw new Error("Commitment view returned a different identity");
        templates.set(`${c.template_id}:${c.template_version}`, {
          id: c.template_id,
          version: c.template_version,
        });
        await db.query(
          `insert into commitments (commitment_id,provider_id,template_id,template_version,stake_asset,stake_total,
              stake_reserved,status,effective_from,exit_requested_at,updated_ledger)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (commitment_id) do update
           set provider_id=excluded.provider_id,template_id=excluded.template_id,template_version=excluded.template_version,
               stake_asset=excluded.stake_asset,stake_total=excluded.stake_total,stake_reserved=excluded.stake_reserved,
               status=excluded.status,effective_from=excluded.effective_from,exit_requested_at=excluded.exit_requested_at,
               updated_ledger=excluded.updated_ledger`,
          [
            c.id,
            id,
            c.template_id,
            c.template_version,
            c.stake_asset,
            c.stake_total,
            c.stake_reserved,
            c.status.tag.toLowerCase(),
            timestamp(c.effective_from),
            c.exit_requested_at === null ? null : timestamp(c.exit_requested_at),
            ledger,
          ],
        );
        commitments++;
      }
    }
    for (const { id, version } of templates.values()) {
      const t = await views.template(id, version);
      if (t.id !== id || t.version !== version)
        throw new Error("Template view returned a different version");
      await db.query(
        `insert into templates (template_id,version,body,status,activates_at) values ($1,$2,$3::jsonb,$4,$5)
         on conflict (template_id,version) do update set body=excluded.body,status=excluded.status,activates_at=excluded.activates_at`,
        [
          id,
          version,
          templateBody(t, t.status.tag),
          t.status.tag.toLowerCase(),
          timestamp(t.activates_at),
        ],
      );
    }
    const claims = await db.query<{ claim_id: string }>(
      "select claim_id from claims where status in ('filed','challenged')",
    );
    for (const row of claims.rows) {
      const c = await views.claim(BigInt(row.claim_id));
      if (c.id !== BigInt(row.claim_id)) throw new Error("Claim view returned a different ID");
      // A view cannot supply missing settlement or attestation transaction history.
      await db.query(
        `update claims set status=$2,challenge_deadline=$3,attestation_deadline=$4,counter_evidence_hash=$5,
           votes_for=$6,votes_against=$7 where claim_id=$1`,
        [
          c.id,
          c.status.tag.toLowerCase(),
          timestamp(c.challenge_deadline),
          c.attestation_deadline === 0n ? null : timestamp(c.attestation_deadline),
          c.counter_evidence_hash ? hex(c.counter_evidence_hash) : null,
          c.votes_for,
          c.votes_against,
        ],
      );
    }
    await db.query(
      `insert into cursors (name,ledger) values ($1,$2) on conflict (name) do update
       set ledger=excluded.ledger,updated_at=now()`,
      [snapshotName, ledger],
    );
    await db.query("commit");
    return {
      providers: ids.size,
      commitments,
      templates: templates.size,
      claims: claims.rows.length,
    };
  } catch (error) {
    await db.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    db.release();
  }
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--apply") {
    console.error(
      "Usage: pnpm indexer:reconcile --apply (installs a partial snapshot and pauses replay)",
    );
    process.exitCode = 1;
    return;
  }
  const { config, env } = await readConfig();
  const server = new rpc.Server(config.rpcUrl, { timeout: 10_000 });
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET)
    throw new Error("Indexer RPC network mismatch");
  const options = { server, rpcUrl: config.rpcUrl, networkPassphrase: Networks.TESTNET };
  const registry = new RegistryClient({ ...options, contractId: config.contracts.registry });
  const bond = new BondClient({ ...options, contractId: config.contracts.bond });
  const pool = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000 });
  try {
    const { sequence } = await server.getLatestLedger();
    const result = await reconcile(
      pool,
      {
        provider: async (id) => (await registry.get_provider({ id })).result.unwrap(),
        commitments: async (provider_id) =>
          (await bond.commitments_by_provider({ provider_id })).result,
        commitment: async (id) => (await bond.commitment({ id })).result.unwrap(),
        template: async (id, version) =>
          (await registry.get_template_version({ id, version })).result.unwrap(),
        claim: async (id) => (await bond.claim({ id })).result.unwrap(),
      },
      sequence,
      config.seed?.providerId,
    );
    console.log("Partial snapshot refreshed; the event checkpoint is unchanged.", result);
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error(
      "Reconciliation failed; no partial changes were committed. Check the Testnet manifest, RPC, and database.",
    );
    process.exitCode = 1;
  });
}
