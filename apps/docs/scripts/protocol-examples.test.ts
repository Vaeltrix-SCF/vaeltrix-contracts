import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { evaluateVerdict } from "../content-examples/integration-guides.examples";
import { fromStroops, toStroops } from "../content-examples/sdk-reference.examples";

const input = {
  t0Ms: 1000n,
  t1Ms: null,
  nowMs: 1000n,
  targetMs: 120000n,
  graceMs: 10000n,
  pauseMs: 0n,
};
describe("documented verdict matches protocol deadlines", () => {
  it("keeps missing completion pending through the deadline", () => {
    expect(evaluateVerdict(input)).toBe("Pending");
    expect(evaluateVerdict({ ...input, nowMs: 131000n })).toBe("Pending");
    expect(evaluateVerdict({ ...input, nowMs: 131001n })).toBe("NoCompletion");
  });
  it("rejects invalid timelines and overflow", () => {
    expect(() => evaluateVerdict({ ...input, t1Ms: 500n })).toThrow();
    expect(() => evaluateVerdict({ ...input, t1Ms: 1100n, pauseMs: 101n })).toThrow();
    expect(() => evaluateVerdict({ ...input, t0Ms: (1n << 64n) - 1n })).toThrow();
  });
  it("matches shared completed-payment verdict vectors", () => {
    const vectors = JSON.parse(
      readFileSync(
        fileURLToPath(new URL("../../../test-vectors/verdict.json", import.meta.url)),
        "utf8",
      ),
    ) as Array<{
      fn: string;
      input: {
        t0_ms: number;
        t1_ms: number | null;
        now_ms: number;
        target_ms: number;
        grace_ms: number;
        pause_ms: number;
      };
      expect: { verdict: string } | null;
    }>;
    for (const vector of vectors.filter((v) => v.fn === "evaluate")) {
      const v = vector.input;
      const call = () =>
        evaluateVerdict({
          t0Ms: BigInt(v.t0_ms),
          t1Ms: v.t1_ms === null ? null : BigInt(v.t1_ms),
          nowMs: BigInt(v.now_ms),
          targetMs: BigInt(v.target_ms),
          graceMs: BigInt(v.grace_ms),
          pauseMs: BigInt(v.pause_ms),
        });
      if (vector.expect === null) expect(call).toThrow();
      else
        expect(call()).toBe(
          vector.expect.verdict === "Late" ? "LateCompletion" : vector.expect.verdict,
        );
    }
  });
  it("includes grace and pauses in completed-payment verdicts", () => {
    expect(evaluateVerdict({ ...input, t1Ms: 131000n })).toBe("OnTime");
    expect(evaluateVerdict({ ...input, t1Ms: 131001n })).toBe("LateCompletion");
    expect(evaluateVerdict({ ...input, t1Ms: 131001n, pauseMs: 1n })).toBe("OnTime");
  });
});
describe("documented decimal conversion", () => {
  it.each(["1.00000009", "1.2.3", "", "1e3", "1."])(
    "rejects malformed or excessive precision: %s",
    (value) => {
      expect(() => toStroops(value)).toThrow();
    },
  );
  it.each([0n, 1n, -1n, 10005000000n, -(1n << 127n), (1n << 127n) - 1n])(
    "round trips %s exactly",
    (value) => {
      expect(toStroops(fromStroops(value))).toBe(value);
    },
  );
  it("rejects i128 overflow", () => {
    expect(() => toStroops(fromStroops(1n << 127n))).toThrow();
  });
});
