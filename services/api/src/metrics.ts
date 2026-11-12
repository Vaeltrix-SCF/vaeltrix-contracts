/** VX-706: guide §13.5, formula version 0.1. */
import type { Pool } from "pg";

const scale = 1_000_000n;
type Inputs = {
  tagged: bigint;
  payments: bigint;
  onTime: bigint;
  carvedOut: bigint;
  available: bigint;
  risk: bigint;
  missingRisk: boolean;
  source: "batches" | "observer_live";
};
const display = (n: bigint, d: bigint) => Number((n * scale) / d) / Number(scale);

export function metrics(input: Inputs) {
  const { tagged, payments, onTime, carvedOut, available, risk, missingRisk, source } = input;
  const eligible = payments - carvedOut;
  const capped = risk === 0n || available * 2n >= risk * 3n;
  const coverage = missingRisk ? null : capped ? 1.5 : display(available, risk);
  const base = {
    score_version: "0.1",
    source,
    on_time_rate_30d: eligible > 0n ? display(onTime, eligible) : null,
    carve_out_rate: payments > 0n ? display(carvedOut, payments) : null,
    coverage_ratio: coverage,
  };
  if (tagged < 100n || eligible <= 0n) {
    return { ...base, score: null, score_status: "insufficient_data" };
  }
  if (missingRisk) return { ...base, score: null, score_status: "unavailable" };
  const carveCapped = carvedOut * 10n >= payments;
  const carveN = carveCapped ? 1n : payments - 5n * carvedOut;
  const carveD = carveCapped ? 2n : payments;
  const coverageN = capped ? 1n : available * 2n;
  const coverageD = capped ? 1n : risk * 3n;
  return {
    ...base,
    score: display(100n * onTime * carveN * coverageN, eligible * carveD * coverageD),
    score_status: "scored",
  };
}

type MetricsRow = {
  provider_id: string;
  home_domain: string;
  verified: boolean;
  status: string;
  tagged: string;
  payments: string;
  on_time: string;
  carved_out: string;
  available: string;
  risk: string;
  missing_risk: boolean;
  source: Inputs["source"];
};

export async function providerMetrics(
  db: Pick<Pool, "query">,
  selection: { providers?: string[]; corridor?: readonly [string, string]; template?: number },
) {
  const { rows } = await db.query<MetricsRow>(
    `
    with selected as (
      select provider_id,home_domain,verified,status from providers where ($1::text[] is null or provider_id=any($1))
    ), commitments_in_scope as (
      select c.*, t.body, least(
        trunc((t.body#>>'{scope,max_amount}')::numeric * (t.body#>>'{penalty,PerBreachBps,bps}')::numeric / 10000),
        (t.body#>>'{penalty,PerBreachBps,cap}')::numeric
      ) as max_penalty
      from commitments c join selected s using (provider_id)
      left join templates t on (t.template_id,t.version)=(c.template_id,c.template_version)
      where ($4::integer is null or c.template_id=$4)
    ), observed as (
      select p.provider_id,count(*) as tagged,
        count(*) filter (where p.verdict in ('on_time','late','no_completion') or p.status='carved_out') as payments,
        count(*) filter (where p.verdict='on_time' and p.status<>'carved_out') as on_time,
        count(*) filter (where p.status='carved_out') as carved_out
      from payments p join selected s using (provider_id)
      left join commitments_in_scope c on p.commitment_id=c.commitment_id
      where p.commitment_id is not null and p.created_at >= now()-interval '30 days'
        and ($2::text is null or (p.sender_country=$2 and p.receiver_country=$3))
        and ($4::integer is null or c.commitment_id is not null)
      group by p.provider_id
    ), anchored as (
      select c.provider_id, sum((b.stats->>'payments')::numeric) as payments,
        sum((b.stats->>'on_time')::numeric) as on_time, sum((b.stats->>'carved_out')::numeric) as carved_out
      from batches b join commitments_in_scope c using (commitment_id)
      where $2::text is null and b.period >= floor(extract(epoch from now())/86400)-30
        and b.period < floor(extract(epoch from now())/86400)
      group by c.provider_id
    ), exposures as (
      select c.provider_id, greatest(c.stake_total-c.stake_reserved,0) as available,
        c.max_penalty, count(p.payment_id) as in_flight
      from commitments_in_scope c left join payments p on p.commitment_id=c.commitment_id
        and p.status in ('tagged','settled','completed','breached')
        and (p.t0_ms is null or c.body is null or p.t0_ms::numeric + p.pause_ms +
          (c.body->>'target_ms')::numeric + (c.body->>'grace_ms')::numeric +
          (c.body->>'claim_window_secs')::numeric*1000 >= extract(epoch from now())*1000)
      where c.status<>'exited'
      group by c.provider_id,c.commitment_id,c.stake_total,c.stake_reserved,c.max_penalty
    ), coverage as (
      select provider_id,sum(available) as available,sum(max_penalty*in_flight) as risk,
        bool_or(max_penalty is null and in_flight>0) as missing_risk
      from exposures group by provider_id
    )
    select s.*,coalesce(o.tagged,0)::text as tagged,
      coalesce(a.payments,o.payments,0)::text as payments,
      coalesce(a.on_time,o.on_time,0)::text as on_time,
      coalesce(a.carved_out,o.carved_out,0)::text as carved_out,
      coalesce(c.available,0)::text as available,coalesce(c.risk,0)::text as risk,
      coalesce(c.missing_risk,false) as missing_risk,
      case when a.payments is null then 'observer_live' else 'batches' end as source
    from selected s left join observed o using (provider_id)
    left join anchored a using (provider_id) left join coverage c using (provider_id)
    where $2::text is null or o.provider_id is not null
  `,
    [
      selection.providers ?? null,
      selection.corridor?.[0] ?? null,
      selection.corridor?.[1] ?? null,
      selection.template ?? null,
    ],
  );
  return rows.map((r) => ({
    provider_id: r.provider_id,
    home_domain: r.home_domain,
    verified: r.verified,
    status: r.status,
    ...metrics({
      tagged: BigInt(r.tagged),
      payments: BigInt(r.payments),
      onTime: BigInt(r.on_time),
      carvedOut: BigInt(r.carved_out),
      available: BigInt(r.available),
      risk: BigInt(r.risk),
      missingRisk: r.missing_risk,
      source: r.source,
    }),
  }));
}
