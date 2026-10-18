import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Same files the Rust suites load (guide §4.6). VX-106 adds the per-function
// dispatch and assertions; this harness proves the files are wired in.
const vectorsDir = fileURLToPath(new URL("../../../test-vectors/", import.meta.url));
const load = (file: string): unknown => JSON.parse(readFileSync(vectorsDir + file, "utf8"));

describe("shared test vectors", () => {
  for (const file of ["verdict.json", "ids.json", "receipts.json"]) {
    it(`${file} is an array of case objects`, () => {
      const cases = load(file);
      expect(Array.isArray(cases)).toBe(true);
      for (const c of cases as unknown[]) expect(typeof c).toBe("object");
    });
  }
});
