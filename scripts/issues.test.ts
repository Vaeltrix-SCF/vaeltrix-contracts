import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { describe, expect, it, vi } from "vitest";
import { exportGuide, guidePath, pdfPath } from "./export-guide.js";
import { importIssues, parseIssues } from "./issues.js";
import type { Issue } from "./issues.js";
const source = readFileSync(guidePath, "utf8");
const issues = parseIssues(source);
const first = issues[0];
if (!first) throw new Error("Missing guide issues");

it("exports all 63 issue definitions from the exact committed PDF", () => {
  expect(issues).toHaveLength(63);
  expect(issues[0]?.title).toBe("VX-101 · Scaffold the monorepo");
  expect(issues.at(-1)?.title).toBe("VX-913 · Fuzz claim and resolve");
  expect(source).toContain(createHash("sha256").update(readFileSync(pdfPath)).digest("hex"));
  for (const issue of issues) {
    expect(issue.labels).toContainEqual(expect.stringMatching(/^epic:/));
    expect(issue.labels).toContainEqual(expect.stringMatching(/^area:/));
    expect(issue.labels).toContainEqual(expect.stringMatching(/^size:/));
    expect(issue.body).toContain("**Acceptance criteria:**");
    expect(issue.body).not.toMatch(/Page \d+ of \d+|Vaeltrix V0 Implementation Guide|Epic \d+:/);
  }
});
it("keeps page-spanning issues and removes PDF running headers", () => {
  const text = `Vaeltrix V0 Implementation Guide
  Epic 1: Foundations
  VX-101 · First
  Labels: epic:foundations, area:tooling, size:S Depends on: none Spec: §3
  Acceptance criteria: Must preserve
       Page 1 of 2
\fVaeltrix V0 Implementation Guide
  the rest of the criterion.
  VX-102 · Second
  Labels: epic:foundations, area:tooling, size:S Depends on: VX-
  101 Spec: §3 Acceptance criteria: Must pass.
  17. Agent operating rules
  Rules remain in the full source.
`;
  const exported = exportGuide(text, new Uint8Array([1, 2]));
  const parsed = parseIssues(exported);
  expect(parsed).toHaveLength(2);
  expect(parsed[0]?.body).toContain("Must preserve the rest of the criterion.");
  expect(parsed[1]?.body).toContain("Depends on:** VX-101");
  expect(exported).toContain("Rules remain in the full source.");
});
it("rejects missing metadata, empty guides and duplicate issue IDs", () => {
  expect(() => parseIssues("# Empty")).toThrow("No VX");
  expect(() => parseIssues("### VX-101 · Missing\n\nBody")).toThrow("Missing labels");
  expect(() =>
    parseIssues(`### ${first.title}\n${first.body}\n### VX-101 · Renamed\n${first.body}`),
  ).toThrow("Duplicate");
});
it("dry run prints every title, label and body without invoking gh", () => {
  const run = vi.fn(() => {
    throw new Error("Network forbidden");
  });
  const lines: string[] = [];
  expect(importIssues(issues, "owner/repo", run, (line) => lines.push(line), true)).toBe(0);
  expect(run).not.toHaveBeenCalled();
  expect(lines).toHaveLength(63);
  expect(lines[0]).toContain(first.body);
  expect(lines[0]).toContain(first.labels.join(", "));
});
describe("live import orchestration", () => {
  it("reads every page including closed issues, skips renamed IDs, and sends literal bodies via stdin", () => {
    const second = issues[1];
    const third = issues[2];
    if (!second || !third) throw new Error("Missing fixtures");
    const calls: Array<{ args: string[]; input?: string }> = [];
    const run = (args: string[], input?: string) => {
      calls.push(input === undefined ? { args } : { args, input });
      if (args[0] === "api")
        return JSON.stringify([
          [{ title: "VX-101 · Renamed", state: "closed" }],
          [{ title: second.title }, { title: third.title, pull_request: {} }],
        ]);
      return "https://github.com/owner/repo/issues/1\n";
    };
    const hostile: Issue = {
      ...third,
      body: `${third.body}\nLiteral $() and backticks: \`touch file\`\n`,
    };
    expect(importIssues([first, second, hostile], "owner/repo", run, () => {}, false)).toBe(1);
    expect(calls[0]?.args).toEqual([
      "api",
      "--paginate",
      "--slurp",
      "repos/owner/repo/issues?state=all&per_page=100",
    ]);
    expect(calls[1]?.args).toEqual([
      "issue",
      "create",
      "--repo",
      "owner/repo",
      "--title",
      third.title,
      "--body-file",
      "-",
      ...third.labels.flatMap((label) => ["--label", label]),
    ]);
    expect(calls[1]?.input).toBe(hostile.body);
  });
  it("aborts on malformed listing before creating anything", () => {
    const run = vi.fn(() => '{"unexpected":true}');
    expect(() => importIssues([first], "owner/repo", run, () => {}, false)).toThrow(
      "Invalid issue listing",
    );
    expect(run).toHaveBeenCalledTimes(1);
  });
});
it("CLI dry run is executable offline and rejects unknown flags", () => {
  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/issues.ts", "--dry-run"], {
    encoding: "utf8",
  });
  expect(run.status, run.stderr).toBe(0);
  expect(run.stdout.match(/^DRY RUN VX-/gm)).toHaveLength(63);
  const bad = spawnSync(process.execPath, ["--import", "tsx", "scripts/issues.ts", "--unknown"], {
    encoding: "utf8",
  });
  expect(bad.status).toBe(1);
  expect(bad.stderr).toContain("Usage:");
});
