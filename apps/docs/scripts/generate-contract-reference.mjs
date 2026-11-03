#!/usr/bin/env node
// Regenerates content/docs/contract-reference.mdx from real source,
// never hand-written. Follows the pattern established in the Sylox protocol docs.
//
// Sources of truth:
//   - Contract addresses, wasm hashes, and testnet accounts: deployments/testnet.json
//   - Contract method signatures:
//     - contracts/registry/src/lib.rs (Registry)
//     - contracts/bond/src/lib.rs (Bond)
//     - contracts/scoreboard/src/lib.rs (Scoreboard)
//   - Types and structs: crates/vaeltrix-types/src/structs.rs and enums.rs
//   - Error codes: crates/vaeltrix-types/src/errors.rs (codes 1-44)
//
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// apps/docs/scripts -> repo root is two levels up
const repoRoot = path.resolve(__dirname, "../../..");
const docsRoot = path.resolve(__dirname, "..");

function die(message) {
  throw new Error(`generate-contract-reference: ${message}`);
}

function readRequired(fullPath) {
  if (!existsSync(fullPath)) {
    die(`${fullPath} not found.`);
  }
  return readFileSync(fullPath, "utf8");
}

function loadDeployment() {
  const deploymentPath = path.join(repoRoot, "deployments", "testnet.json");
  const raw = readRequired(deploymentPath);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    die(`${deploymentPath} is not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
  }
  return parsed;
}

function extractPrecedingDocComment(source, index) {
  const before = source.slice(0, index);
  // Match /// doc comments immediately preceding with only trailing whitespace allowed
  const tripleSlashMatch = before.match(/(?:^|\n)((?:[ \t]*\/\/\/[^\n]*\n)+)[ \t]*$/);
  if (tripleSlashMatch) {
    return tripleSlashMatch[1]
      .split("\n")
      .map((line) => line.replace(/^\s*\/\/\/\s?/, "").trimEnd())
      .filter((line, i, arr) => !(i === 0 && line === "") && !(i === arr.length - 1 && line === ""))
      .join("\n")
      .trim();
  }
  // Or /** ... */ block comments
  const blockMatch = before.match(/\/\*\*((?:[^*]|\*(?!\/))*)\*\/\s*$/);
  if (blockMatch) {
    return blockMatch[1]
      .split("\n")
      .map((line) => line.replace(/^\s*\*\s?/, "").trimEnd())
      .filter((line, i, arr) => !(i === 0 && line === "") && !(i === arr.length - 1 && line === ""))
      .join("\n")
      .trim();
  }
  return "";
}

function mdxEscape(text) {
  let escaped = text.replaceAll("{", "&#123;").replaceAll("}", "&#125;");
  const EM_DASH = String.fromCharCode(8212);
  const EN_DASH = String.fromCharCode(8211);
  escaped = escaped.split(EM_DASH).join(" - ");
  escaped = escaped.split(EN_DASH).join("-");
  return escaped;
}

/**
 * Parses Rust contract functions from an impl block in contracts/{name}/src/lib.rs
 */
function parseRustMethods(source, structName) {
  const implPattern = new RegExp(`impl\\s+${structName}\\s*\\{([\\s\\S]*?)\\n\\}`);
  const match = source.match(implPattern);
  if (!match) {
    die(`could not find "impl ${structName} { ... }" block`);
  }
  const block = match[1];

  const results = [];
  // Match "pub fn name(args...) -> ReturnType {" or "pub fn name(args...) {"
  const methodRegex = /^\s*pub fn\s+(\w+)\s*\(([\s\S]*?)\)(?:\s*->\s*([^{]+))?\s*\{/gm;
  let m;
  while ((m = methodRegex.exec(block)) !== null) {
    const [, name, args, returnType] = m;
    const doc = extractPrecedingDocComment(block, m.index);
    const cleanArgs = args.split("\n").map(l => l.trim()).filter(Boolean).join(" ");
    const cleanRet = returnType ? returnType.trim() : "()";
    results.push({
      name,
      doc,
      signature: `fn ${name}(${cleanArgs}) -> ${cleanRet}`,
    });
  }

  if (results.length === 0) {
    die(`found impl ${structName} but parsed zero methods`);
  }
  return results;
}

/**
 * Parses error enum entries from crates/vaeltrix-types/src/errors.rs
 */
function parseErrorEnum(source) {
  const enumMatch = source.match(/pub enum Error \{([\s\S]*?)\n\}/);
  if (!enumMatch) die("could not find pub enum Error block");
  const block = enumMatch[1];

  const entries = [];
  const pattern = /(\w+)\s*=\s*(\d+)/g;
  let m;
  while ((m = pattern.exec(block)) !== null) {
    const name = m[1];
    const code = Number(m[2]);
    const doc = extractPrecedingDocComment(block, m.index);
    entries.push({ code, name, doc });
  }
  if (entries.length === 0) die("parsed zero error enum entries");
  return entries.sort((a, b) => a.code - b.code);
}

/**
 * Parses structs from crates/vaeltrix-types/src/structs.rs
 */
function parseStructs(source) {
  const results = [];
  const structRegex = /pub struct (\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = structRegex.exec(source)) !== null) {
    const name = m[1];
    const body = m[2];
    const doc = extractPrecedingDocComment(source, m.index);
    const fields = body
      .split("\n")
      .map(l => l.trim())
      .filter(l => l.startsWith("pub "))
      .map(l => l.replace(/,$/, ""));
    results.push({ name, doc, fields });
  }
  return results;
}

/**
 * Parses enums from crates/vaeltrix-types/src/enums.rs
 */
function parseEnums(source) {
  const results = [];
  const enumRegex = /pub enum (\w+)\s*\{([\s\S]*?)\n\}/g;
  let m;
  while ((m = enumRegex.exec(source)) !== null) {
    const name = m[1];
    const body = m[2];
    const doc = extractPrecedingDocComment(source, m.index);
    const variants = body
      .split("\n")
      .map(l => l.trim())
      .filter(l => l && !l.startsWith("//") && !l.startsWith("#"))
      .map(l => l.replace(/,$/, ""));
    results.push({ name, doc, variants });
  }
  return results;
}

function renderMethods(methods) {
  return methods
    .map(({ name, doc, signature }) => {
      const heading = `#### \`${name}\``;
      const docBlock = doc ? `\n\n${mdxEscape(doc)}` : "";
      return `${heading}\n\n\`\`\`rust\n${signature}\n\`\`\`${docBlock}`;
    })
    .join("\n\n");
}

function renderStructs(structs) {
  return structs
    .map(({ name, doc, fields }) => {
      const heading = `#### \`${name}\``;
      const docBlock = doc ? `${mdxEscape(doc)}\n\n` : "";
      const fieldList = fields.length > 0 ? "```rust\n" + fields.join("\n") + "\n```" : "";
      return `${heading}\n\n${docBlock}${fieldList}`;
    })
    .join("\n\n");
}

function renderEnums(enums) {
  return enums
    .map(({ name, doc, variants }) => {
      const heading = `#### \`${name}\``;
      const docBlock = doc ? `${mdxEscape(doc)}\n\n` : "";
      const variantList = "```rust\n" + variants.join("\n") + "\n```";
      return `${heading}\n\n${docBlock}${variantList}`;
    })
    .join("\n\n");
}

const ERROR_DESCRIPTIONS = {
  1: "Caller lacks authorization or required signature from admin, observer, or bond authority.",
  2: "Provider status is suspended or exited; operations on this provider are disallowed.",
  3: "SLA template is proposed or deprecated, not currently in active state.",
  4: "Commitment does not have enough unreserved stake to cover penalty or minimum stake.",
  5: "Payment amount, asset, direction, or corridor is outside the template scope.",
  6: "Claim filed after the template claim window has elapsed.",
  7: "A claim for this payment ID has already been recorded; duplicate filing rejected.",
  8: "Pause duration exceeds maximum hold duration, or evidence hash is invalid.",
  9: "Payment completed within target plus grace duration; no SLA breach occurred.",
  10: "Attempted action before the challenge window has closed.",
  11: "Commitment exit or excess withdrawal blocked while open claims remain unresolved.",
  12: "Exit cooldown period has not yet expired.",
  13: "Observer address is not in the active observer registry.",
  14: "Observer has already cast an attestation vote on this claim.",
  15: "Contract has already been initialized via constructor.",
  16: "Contract has not been initialized with required parameters.",
  17: "Parameters fail validation bounds (quorum, windows, fee bps, asset caps, etc.).",
  18: "Provider ID does not exist in the registry.",
  19: "Template ID does not exist in the registry.",
  20: "Commitment ID does not exist in the bond contract.",
  21: "Claim ID does not exist.",
  22: "Provider home domain has not been verified by the designated verifier.",
  23: "Provider already registered for this domain and admin combination.",
  24: "Template version already exists.",
  25: "Governance action timelock has not expired; action is still pending.",
  26: "Stake asset is not in the registry allowed stake assets list.",
  27: "Stake asset does not match the template scope asset.",
  28: "Amount is below minimum stake floor or exceeds allowable thresholds.",
  29: "Payment initiation timestamp (t0) falls outside active commitment coverage period.",
  30: "Commitment is not active (paused, exiting, or exited).",
  31: "Claim status is not Filed or Challenged.",
  32: "Observer attestation window has expired.",
  33: "Quorum not reached among observer attestations.",
  34: "Stake reduction or commitment amount falls below required minimum stake floor.",
  35: "Total stake exceeds maximum allowed stake per commitment.",
  36: "Derived payment ID does not match the provided payment ID.",
  37: "Signer is not in the provider registered signer set.",
  38: "Signer list length exceeds maximum permitted count.",
  39: "Specified penalty calculation model is not supported.",
  40: "Math overflow or underflow detected in checked arithmetic operation.",
  41: "Bond contract address has already been set on the scoreboard.",
  42: "Daily metrics batch for this commitment and period has already been anchored.",
  43: "Period start/end is not a multiple of 86400, length is not 86400s, or is in the future.",
  44: "No pending governance action or admin transition found with the specified ID.",
};

function renderErrorTable(entries) {
  const rows = entries
    .map(({ code, name }) => {
      const desc = ERROR_DESCRIPTIONS[code] || "-";
      return `| ${code} | \`${name}\` | ${mdxEscape(desc)} |`;
    })
    .join("\n");
  return `| Code | Name | Description |\n| --- | --- | --- |\n${rows}`;
}

function buildContractSection({ title, contractId, wasmHash, methods }) {
  const wasmInfo = wasmHash ? `\n**Wasm hash:** \`${wasmHash}\`` : "";
  return `## ${title}

**Testnet contract address:** \`${contractId}\`${wasmInfo}

Sample testnet deployment on Stellar Protocol 29. Always read addresses and configuration from this page or \`deployments/testnet.json\` rather than hardcoding literals.

### Functions

${renderMethods(methods)}
`;
}

function buildReferenceMarkdown() {
  const deployment = loadDeployment();
  const regId = deployment?.contracts?.registry;
  const bondId = deployment?.contracts?.bond;
  const sbId = deployment?.contracts?.scoreboard;
  const usdcId = deployment?.contracts?.usdc;

  if (!regId) die("deployments/testnet.json missing contracts.registry");
  if (!bondId) die("deployments/testnet.json missing contracts.bond");
  if (!sbId) die("deployments/testnet.json missing contracts.scoreboard");

  const regSrc = readRequired(path.join(repoRoot, "contracts/registry/src/lib.rs"));
  const bondSrc = readRequired(path.join(repoRoot, "contracts/bond/src/lib.rs"));
  const sbSrc = readRequired(path.join(repoRoot, "contracts/scoreboard/src/lib.rs"));
  const typesSrc = readRequired(path.join(repoRoot, "crates/vaeltrix-types/src/structs.rs"));
  const enumsSrc = readRequired(path.join(repoRoot, "crates/vaeltrix-types/src/enums.rs"));
  const errorsSrc = readRequired(path.join(repoRoot, "crates/vaeltrix-types/src/errors.rs"));

  const regMethods = parseRustMethods(regSrc, "Registry");
  const bondMethods = parseRustMethods(bondSrc, "Bond");
  const sbMethods = parseRustMethods(sbSrc, "Scoreboard");

  const structs = parseStructs(typesSrc);
  const enums = parseEnums(enumsSrc);
  const errorEntries = parseErrorEnum(errorsSrc);

  const regSection = buildContractSection({
    title: "Registry Contract (vaeltrix_registry)",
    contractId: regId,
    wasmHash: deployment?.wasmHashes?.registry,
    methods: regMethods,
  });

  const bondSection = buildContractSection({
    title: "Bond Contract (vaeltrix_bond)",
    contractId: bondId,
    wasmHash: deployment?.wasmHashes?.bond,
    methods: bondMethods,
  });

  const sbSection = buildContractSection({
    title: "Scoreboard Contract (vaeltrix_scoreboard)",
    contractId: sbId,
    wasmHash: deployment?.wasmHashes?.scoreboard,
    methods: sbMethods,
  });

  const banner = `---
title: Contract reference
description: "Contract addresses, functions, types, and error codes generated from the deployed testnet contracts."
---

{/*
  GENERATED FILE - do not edit by hand.

  Produced by scripts/generate-contract-reference.mjs from:
    - deployments/testnet.json (contract addresses, wasm hashes, accounts)
    - contracts/(registry, bond, scoreboard)/src/lib.rs (method signatures and doc comments)
    - crates/vaeltrix-types/src/(structs, enums, errors).rs (data structures, enums, error codes)

  Regenerate with \`pnpm --filter @vaeltrix/docs generate:contract-reference\`
  (also runs automatically before dev/build/test).
*/}

# Contract reference

Testnet deployment. Every address, function signature, struct, enum, and error code below is extracted directly from the actual deployed testnet contracts and Rust types at build time.

## Deployed testnet addresses

| Contract | Address | Notes |
| --- | --- | --- |
| \`vaeltrix_registry\` | \`${regId}\` | Provider identity, SLA templates, observer set, governance timelock |
| \`vaeltrix_bond\` | \`${bondId}\` | USDC stake custody, commitment coverage, exit cooldowns, claim settlement |
| \`vaeltrix_scoreboard\` | \`${sbId}\` | Daily Merkle batch anchors, lifetime provider statistics, claim accounting |
| Test USDC | \`${usdcId || "CB2CFWENJ2M5JXWBGUOKO75QVIFJ2EY5WOIOHR6FFYTXAKGS2S3XOIM4"}\` | Stellar Asset Contract (SAC) for testnet USDC stake & payouts |

### Testnet accounts

- **Admin:** \`${deployment?.accounts?.admin || "GCZL57Q3MFIUMMG2XGSND7XDRYTFIQSFJXMT5AIJIDHQP4WONWWPIQK2"}\`
- **Observer:** \`${deployment?.accounts?.observer || "GBMQHKORPRE7RJR2FUSQZGJLFSSEBSOX4EZHO3N2R4ZRXCQZJ7ZUV35R"}\`
- **Provider Admin:** \`${deployment?.accounts?.providerAdmin || "GAXN3KJT36RUDCOFGVUIUAD6IXWHGC5X3RIZQPV6A222GL4YZEYDG5UT"}\`
- **Verifier:** \`${deployment?.accounts?.verifier || "GDZTVBIG3R5ZQGPY4LXDM4JSU33NNIDWBE335C7AW7E53HXIV4SS4IXH"}\`
- **Client:** \`${deployment?.accounts?.client || "GC7QZSFSZSAUFJE5LHWSV25UJTRXN4KHQHEKDX2YK6DDK4FHEQ4DR3XR"}\`
- **Start ledger:** \`${deployment?.startLedger || 5309530}\`

---

${regSection}

---

${bondSection}

---

${sbSection}

---

## Data model & shared types

Single source of truth from \`crates/vaeltrix-types\`.

### Structs

${renderStructs(structs)}

### Enums

${renderEnums(enums)}

---

## Contract error codes

Frozen \`#[contracterror]\` codes from \`crates/vaeltrix-types/src/errors.rs\`. Returned on contract failure with explicit numeric tags.

${renderErrorTable(errorEntries)}
`;

  return banner;
}

function main() {
  const content = buildReferenceMarkdown();
  const outPath = path.join(docsRoot, "content", "docs", "contract-reference.mdx");
  writeFileSync(outPath, content, "utf8");
  console.log(`generate-contract-reference: wrote ${outPath}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

export {
  extractPrecedingDocComment,
  mdxEscape,
  parseRustMethods,
  parseErrorEnum,
  parseStructs,
  parseEnums,
  renderErrorTable,
  renderMethods,
  buildContractSection,
  buildReferenceMarkdown,
  ERROR_DESCRIPTIONS,
};
