import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractSnippet, extractTsFences } from "./doc-examples.mjs";

const docsRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function mdx(name: string): string {
  return readFileSync(path.join(docsRoot, "content", "docs", name), "utf8");
}

function examples(name: string): string {
  return readFileSync(path.join(docsRoot, "content-examples", name), "utf8");
}

const PAGES: Array<{ mdxFile: string; examplesFile: string; snippets: string[] }> = [
  {
    mdxFile: "integration-guides.mdx",
    examplesFile: "integration-guides.examples.ts",
    snippets: [
      "derive-provider-id",
      "check-commitment-coverage",
      "build-completion-receipt",
      "evaluate-verdict",
      "calculate-penalty",
    ],
  },
  {
    mdxFile: "sdk-reference.mdx",
    examplesFile: "sdk-reference.examples.ts",
    snippets: [
      "amount-conversion",
      "payment-id-derivation",
      "verify-receipt",
      "merkle-leaf-hash",
      "error-handling",
    ],
  },
];

describe("doc code examples match their typechecked source", () => {
  for (const { mdxFile, examplesFile, snippets } of PAGES) {
    describe(mdxFile, () => {
      const pageSource = mdx(mdxFile);
      const exampleSource = examples(examplesFile);
      const fences = extractTsFences(pageSource);

      it(`has at least one fenced ts code block per expected snippet (${snippets.length} expected, found ${fences.length})`, () => {
        expect(fences.length).toBeGreaterThanOrEqual(snippets.length);
      });

      for (const name of snippets) {
        it(`"${name}" appears verbatim in a \`\`\`ts block on the page`, () => {
          const snippet = extractSnippet(exampleSource, name);
          const matchingFence = fences.find((fence) => fence.includes(snippet));
          expect(
            matchingFence,
            `No \`\`\`ts block in ${mdxFile} contains the "${name}" snippet from ${examplesFile}.\n\nExpected snippet:\n${snippet}`,
          ).toBeDefined();
        });
      }
    });
  }
});

describe("every exported snippet is checked", () => {
  for (const { examplesFile, snippets } of PAGES) {
    it(`${examplesFile}'s own START markers are all listed in PAGES`, () => {
      const source = examples(examplesFile);
      const starts = Array.from(source.matchAll(/\/\/ START (\S+)/g)).map((m) => m[1]);
      expect(new Set(starts)).toEqual(new Set(snippets));
    });
  }
});
