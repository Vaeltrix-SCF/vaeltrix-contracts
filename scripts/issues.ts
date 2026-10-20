/** Import guide §16 issue definitions; offline dry-run and idempotent live runs (VX-904). */
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { guidePath } from "./export-guide.js";
export interface Issue {
  title: string;
  labels: string[];
  body: string;
}
export type Runner = (args: string[], input?: string) => string;
const vxId = (title: string) => /^(VX-\d{3})\b/.exec(title)?.[1];
export function parseIssues(markdown: string): Issue[] {
  const headings = [...markdown.matchAll(/^### (VX-\d{3} · [^\r\n]+)\r?$/gm)];
  const seen = new Set<string>();
  if (headings.length === 0) throw new Error("No VX issues in guide");
  return headings.map((heading, index) => {
    const title = heading[1]?.trim();
    const id = title && vxId(title);
    if (!title || !id || seen.has(id)) throw new Error("Duplicate or invalid VX issue");
    seen.add(id);
    const body = markdown
      .slice(
        (heading.index ?? 0) + heading[0].length,
        headings[index + 1]?.index ?? markdown.length,
      )
      .trim();
    const line = /^\*\*Labels:\*\*\s*([^\r\n]+)/m.exec(body)?.[1];
    const labels =
      line
        ?.split(",")
        .map((label) => label.trim())
        .filter(Boolean) ?? [];
    if (labels.length === 0) throw new Error(`Missing labels: ${title}`);
    return { title, labels, body };
  });
}
export function importIssues(
  issues: Issue[],
  repo: string,
  run: Runner,
  print: (text: string) => void,
  dryRun: boolean,
): number {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo))
    throw new Error("Expected owner/repository");
  if (dryRun) {
    for (const issue of issues)
      print(`DRY RUN ${issue.title}\nLabels: ${issue.labels.join(", ")}\n${issue.body}\n`);
    return 0;
  }
  const data: unknown = JSON.parse(
    run(["api", "--paginate", "--slurp", `repos/${repo}/issues?state=all&per_page=100`]),
  );
  if (!Array.isArray(data) || !data.every(Array.isArray)) throw new Error("Invalid issue listing");
  const titles = new Set<string>();
  const ids = new Set<string>();
  for (const page of data as unknown[][])
    for (const entry of page) {
      if (
        typeof entry !== "object" ||
        entry === null ||
        !("title" in entry) ||
        typeof entry.title !== "string"
      )
        throw new Error("Invalid issue listing entry");
      if ("pull_request" in entry) continue;
      titles.add(entry.title);
      const id = vxId(entry.title);
      if (id) ids.add(id);
    }
  let created = 0;
  for (const issue of issues) {
    const id = vxId(issue.title);
    if (titles.has(issue.title) || (id && ids.has(id))) {
      print(`SKIP ${issue.title}`);
      continue;
    }
    const args = ["issue", "create", "--repo", repo, "--title", issue.title, "--body-file", "-"];
    for (const label of issue.labels) args.push("--label", label);
    print(run(args, issue.body).trim());
    titles.add(issue.title);
    if (id) ids.add(id);
    created += 1;
  }
  return created;
}
const gh: Runner = (args, input) => {
  const result = spawnSync("gh", args, { input, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr.trim() || "gh failed");
  return result.stdout;
};
export function main(argv = process.argv.slice(2)): void {
  let repo = "Vaeltrix-SCF/vaeltrix-contracts";
  let dryRun = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") dryRun = true;
    else if (arg === "--repo" && argv[i + 1]) repo = argv[++i] ?? repo;
    else throw new Error("Usage: pnpm issues:import [--dry-run] [--repo owner/repo]");
  }
  importIssues(parseIssues(readFileSync(guidePath, "utf8")), repo, gh, console.log, dryRun);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Issue import failed");
    process.exitCode = 1;
  }
}
