import { describe, expect, it } from "vitest";
import {
  amount,
  apiOrigin,
  bytes,
  hex,
  homeDomain,
  id,
  json,
  units,
  submissionRejected,
  latestPeriods,
} from "../src/model";
describe("testnet input boundaries", () => {
  it("distinguishes unqueued submissions from accepted or duplicate ones", () => {
    expect(submissionRejected("TRY_AGAIN_LATER")).toBe(true);
    expect(submissionRejected("ERROR")).toBe(true);
    expect(submissionRejected("PENDING")).toBe(false);
    expect(submissionRejected("DUPLICATE")).toBe(false);
  });
  it("shows the seven newest periods even when historical batches arrive later", () => {
    const periods = [8n, 7n, 6n, 5n, 4n, 3n, 2n, 1n, 9n];
    expect(latestPeriods(periods)).toEqual([9n, 8n, 7n, 6n, 5n, 4n, 3n]);
    expect(periods[0]).toBe(8n);
  });
  it("keeps every stroop exact beyond Number's integer range", () => {
    expect(amount("9007199254740993.1234567")).toBe(90071992547409931234567n);
    expect(units(90071992547409931234567n)).toBe("9,007,199,254,740,993.1234567");
    expect(amount("0.0000001")).toBe(1n);
    expect(units(10000000000n)).toBe("1,000");
  });
  it.each([
    "0",
    "-1",
    "1e3",
    "1.12345678",
    " 1",
    "01",
    "NaN",
    "170141183460469231731687303715884105728",
  ])("rejects unsafe amount %s", (value) => expect(() => amount(value)).toThrow());
  it("bounds commitment IDs as u64", () => {
    expect(id("18446744073709551615")).toBe(18446744073709551615n);
    expect(() => id("18446744073709551616")).toThrow();
    expect(() => id("1.5")).toThrow();
  });
  it("validates canonical IDs and domains", () => {
    const input = "ab".repeat(32);
    expect(hex(bytes(input))).toBe(input);
    expect(() => bytes("GG".repeat(32))).toThrow();
    expect(homeDomain("anchor.example.com")).toBe("anchor.example.com");
    for (const value of ["HTTPS://a.com", "A.com", "a.com.", "", "a".repeat(254)])
      expect(() => homeDomain(value)).toThrow();
  });
  it("accepts only credential-free API origins", () => {
    expect(apiOrigin("https://api.example.com/")).toBe("https://api.example.com");
    expect(apiOrigin("http://localhost:3001")).toBe("http://localhost:3001");
    for (const value of [
      "javascript:alert(1)",
      "https://secret:password@api.example",
      "https://a.example/path",
      "https://a.example?secret=x",
    ])
      expect(() => apiOrigin(value)).toThrow();
  });
  it("renders on-chain integers and byte IDs without losing information", () => {
    expect(JSON.parse(json({ value: 9007199254740993n, id: bytes("ab".repeat(32)) }))).toEqual({
      value: "9007199254740993",
      id: "ab".repeat(32),
    });
  });
});
