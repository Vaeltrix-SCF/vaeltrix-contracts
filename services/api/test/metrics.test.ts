import { expect, it } from "vitest";
import { metrics } from "../src/metrics.js";

const base = {
  tagged: 100n,
  payments: 100n,
  onTime: 76n,
  carvedOut: 5n,
  available: 75n,
  risk: 100n,
  missingRisk: false,
  source: "batches" as const,
};

it("uses exact ratios for the hand-computed score and caps carve-out and coverage factors", () => {
  // 100 × 76/95 × (1 − .05/.2) × (.75/1.5) = 30.
  expect(metrics(base)).toMatchObject({
    score: 30,
    score_version: "0.1",
    source: "batches",
    on_time_rate_30d: 0.8,
    carve_out_rate: 0.05,
    coverage_ratio: 0.75,
  });
  expect(metrics({ ...base, onTime: 80n, carvedOut: 20n, risk: 0n })).toMatchObject({
    score: 50,
    coverage_ratio: 1.5,
  });
});

it("withholds scores when the sample or collateral inputs are incomplete", () => {
  expect(metrics({ ...base, tagged: 99n })).toMatchObject({
    score: null,
    score_status: "insufficient_data",
  });
  expect(metrics({ ...base, payments: 100n, onTime: 0n, carvedOut: 100n })).toMatchObject({
    score: null,
  });
  expect(metrics({ ...base, missingRisk: true })).toMatchObject({
    score: null,
    coverage_ratio: null,
    score_status: "unavailable",
  });
});
