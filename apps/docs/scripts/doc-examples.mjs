import { readFileSync } from "node:fs";

/**
 * Extracts the exact text between a `// START <name>` line and the
 * next `// END <name>` line (both lines themselves excluded) from `source`.
 */
export function extractSnippet(source, name) {
  const startMarker = `// START ${name}`;
  const endMarker = `// END ${name}`;
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`doc-examples: could not find "${startMarker}"`);
  }
  const bodyStart = source.indexOf("\n", startIdx) + 1;
  const endIdx = source.indexOf(endMarker, bodyStart);
  if (endIdx === -1) {
    throw new Error(`doc-examples: could not find "${endMarker}" after "${startMarker}"`);
  }
  return source.slice(bodyStart, endIdx).replace(/\n$/, "");
}

/** Reads `path` relative to the repo convention used throughout this script (UTF-8 text). */
export function readText(path) {
  return readFileSync(path, "utf8");
}

/**
 * Finds every fenced ```ts ... ``` code block in MDX `source`, in
 * order, and returns their inner text (fence lines excluded).
 */
export function extractTsFences(source) {
  const fences = [];
  const pattern = /```ts\n([\s\S]*?)```/g;
  let match;
  while ((match = pattern.exec(source)) !== null) {
    fences.push(match[1].replace(/\n$/, ""));
  }
  return fences;
}
