/** Reproducible PDF text and issue-catalogue export (VX-904). Requires Poppler. */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
export const pdfPath = fileURLToPath(new URL("../docs/implementation-guide.pdf", import.meta.url));
export const guidePath = fileURLToPath(new URL("../docs/implementation-guide.md", import.meta.url));
export function exportGuide(text: string, pdf: Uint8Array): string {
  const clean = text
    .replace(/\r/g, "")
    .replace(/\f/g, "")
    .replace(/^Vaeltrix V0 Implementation Guide[ \t]*$/gm, "")
    .replace(/^[ \t]*Page \d+ of \d+[ \t]*$/gm, "")
    .trim();
  const start = clean.indexOf("Epic 1: Foundations");
  const end = clean.indexOf("17. Agent operating rules", start);
  if (start < 0 || end < 0) throw new Error("Cannot locate guide issue catalogue");
  const catalogue = clean.slice(start, end);
  const blocks = [
    ...catalogue.matchAll(/^ {2}(VX-\d{3} · [^\n]+)\n([\s\S]*?)(?=^ {2}VX-\d{3} · |$(?![\s\S]))/gm),
  ];
  if (blocks.length === 0) throw new Error("No guide issues found");
  const issues = blocks
    .map((match) => {
      const title = match[1]?.trim();
      const raw = (match[2] ?? "")
        .replace(/^\s*Epic \d+:.*$/gm, "")
        .replace(/\s+/g, " ")
        .replace(/VX-\s+(\d)/g, "VX-$1")
        .trim();
      const labels = /^Labels:\s*(.*?)\s+Depends on:/.exec(raw)?.[1];
      if (!title || !labels) throw new Error("Missing issue title or labels");
      const body = raw
        .slice(raw.indexOf("Depends on:"))
        .replace(
          /\b(Depends on|Spec|Context|Tasks|Acceptance criteria|Out of scope):/g,
          "\n\n**$1:**",
        )
        .trim();
      return `### ${title}\n\n**Labels:** ${labels}\n\n${body}\n`;
    })
    .join("\n");
  const digest = createHash("sha256").update(pdf).digest("hex");
  return `# Vaeltrix V0 Implementation Guide\n\nSource: [implementation-guide.pdf](implementation-guide.pdf). The PDF is authoritative; see [toolchain notes](toolchain.md) for repository version updates.\n\nPDF SHA-256: ${digest}\n\nReproduce with \`pnpm guide:export\` (Poppler \`pdftotext\` required).\nThe layout-preserving source text retains tables and code verbatim. The issue catalogue below is extracted from §16 for \`scripts/issues.ts\`.\n\n## Source text\n\n\`\`\`text\n${clean}\n\`\`\`\n\n## Issue catalogue\n\n${issues}`.replace(
    /[ \t]+$/gm,
    "",
  );
}
export function main(): void {
  const pdf = readFileSync(pdfPath);
  const text = execFileSync("pdftotext", ["-layout", pdfPath, "-"], {
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  writeFileSync(guidePath, exportGuide(text, pdf));
  console.log(`Exported ${guidePath}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
