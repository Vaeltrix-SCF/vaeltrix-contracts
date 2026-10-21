import { expect, it, vi } from "vitest";
import { assertDemoTemplate, demoTemplate, parseArgs, waitUntil } from "./seed.js";
import { server } from "./lib/usdc.js";
it("seeds exact guide demo economics with decimal integer amounts", () => {
  const t = demoTemplate("asset");
  expect(t.id).toBe(901);
  expect(t.target_ms).toBe(120000);
  expect(t.grace_ms).toBe(10000);
  expect(t.penalty.PerBreachBps).toEqual({ bps: 500, cap: "1000000000" });
  expect(t.scope.max_amount).toBe("100000000000");
  expect(t.claim_window_secs).toBe(600);
  expect(t.max_hold_ms).toBe(60000);
  expect(() => parseArgs(["--network", "other"])).toThrow();
});
it("waits on ledger time rather than local clock", async () => {
  vi.useFakeTimers();
  type Ledger = Awaited<ReturnType<typeof server.getLatestLedger>>;
  const read = vi
    .spyOn(server, "getLatestLedger")
    .mockResolvedValueOnce({ closeTime: "99" } as Ledger)
    .mockResolvedValueOnce({ closeTime: "100" } as Ledger);
  try {
    const done = waitUntil(100n);
    await vi.advanceTimersByTimeAsync(5000);
    await done;
    expect(read).toHaveBeenCalledTimes(2);
  } finally {
    read.mockRestore();
    vi.useRealTimers();
  }
});

it("rejects active templates with altered economics or a later version", () => {
  const t = { ...demoTemplate("asset"), status: "Active" };
  expect(() => assertDemoTemplate(t, "asset", "Active")).not.toThrow();
  for (const changed of [
    { ...t, target_ms: 1 },
    { ...t, version: 2 },
    { ...t, claim_window_secs: 1 },
    { ...t, penalty: { PerBreachBps: { bps: 1, cap: "1" } } },
    { ...t, scope: { ...t.scope, asset: "other" } },
  ])
    expect(() => assertDemoTemplate(changed, "asset", "Active")).toThrow("required demo terms");
});
