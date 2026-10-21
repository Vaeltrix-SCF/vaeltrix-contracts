import { afterEach, expect, it, vi } from "vitest";
import { assertTestnet, decimal, stroops } from "./usdc.js";
afterEach(() => vi.unstubAllEnvs());
it("preserves amounts above JavaScript integer precision exactly", () => {
  for (const value of [0n, 1n, 100_000n * 10_000_000n, (1n << 127n) - 1n])
    expect(stroops(decimal(value))).toBe(value);
  for (const value of ["-1", "1e7", "0.00000001", "NaN"]) expect(() => stroops(value)).toThrow();
});
it("rejects conflicting network configuration before invoking tools", () => {
  for (const name of [
    "STELLAR_NETWORK",
    "STELLAR_RPC_URL",
    "HORIZON_URL",
    "NETWORK_PASSPHRASE",
    "STELLAR_NETWORK_PASSPHRASE",
  ]) {
    vi.stubEnv(name, "wrong-network");
    expect(() => assertTestnet()).toThrow();
    vi.unstubAllEnvs();
  }
});
it("rejects unsupported Circle mode before generating identities", async () => {
  const { provision, server } = await import("./usdc.js");
  const network = vi.spyOn(server, "getNetwork").mockResolvedValue({
    passphrase: "Test SDF Network ; September 2015",
    protocolVersion: "29",
    friendbotUrl: "https://friendbot.stellar.org",
  });
  vi.stubEnv("USDC_SOURCE", "circle");
  try {
    await expect(provision()).rejects.toThrow("USDC_SOURCE=circle");
  } finally {
    network.mockRestore();
  }
});
