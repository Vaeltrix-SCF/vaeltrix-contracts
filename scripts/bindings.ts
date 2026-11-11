/** VX-504: reproducible SDK-generated bindings; --check compares local WASM offline. */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { readDeployment, names } from "./lib/deployment.js";
const args = process.argv.slice(2);
if (args.some((arg) => !["testnet", "--check", "--local"].includes(arg)))
  throw new Error("Usage: bindings.sh testnet [--local | --check]");
const check = args.includes("--check");
const local = check || args.includes("--local");
const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), "vaeltrix-bindings-"));
const manifest = local ? null : readDeployment();
const sdkVersion = JSON.parse(
  readFileSync(resolve("scripts/node_modules/@stellar/stellar-sdk/package.json"), "utf8"),
) as { version: string };
function files(path: string, prefix = ""): string[] {
  return readdirSync(path, { withFileTypes: true })
    .flatMap((entry) => {
      if (["dist", "node_modules"].includes(entry.name)) return [];
      const name = join(prefix, entry.name);
      return entry.isDirectory() ? files(join(path, entry.name), name) : [name];
    })
    .sort();
}
try {
  for (const name of names) {
    const output = check ? join(temporary, name) : resolve("packages/bindings", name);
    const source = local
      ? ["--wasm", resolve(`target/wasm32v1-none/release/vaeltrix_${name}.wasm`)]
      : ["--contract-id", manifest?.contracts[name] ?? "", "--network", "testnet"];
    execFileSync(
      "pnpm",
      [
        "--filter",
        "@vaeltrix/scripts",
        "exec",
        "stellar-js",
        "generate",
        ...source,
        "--contract-name",
        `vaeltrix-bindings-${name}`,
        "--output-dir",
        output,
        "--overwrite",
      ],
      { stdio: "inherit" },
    );
    // SDK 17.2 generates a deploy method whose result is only a base Client.
    // Preserve SDK transaction assembly and restore the generated client when decoding.
    const clientPath = join(output, "src/client.ts");
    const client = readFileSync(clientPath, "utf8");
    const deploy = "    return ContractClient.deploy(args, options);";
    if (!client.includes(deploy)) {
      throw new Error(`Review the generated ${name} deploy method before regenerating bindings.`);
    }
    writeFileSync(
      clientPath,
      client
        .replace("static deploy<T = Client>", "static async deploy<T = Client>")
        .replace(
          deploy,
          [
            "    const tx = await ContractClient.deploy<T & ContractClient>(args, options);",
            "    const parse = tx.options.parseResultXdr;",
            "    tx.options.parseResultXdr = (result) => new Client(parse(result).options) as T & Client;",
            "    return tx;",
          ].join("\n"),
        ),
    );
    // Deterministic workspace metadata is part of the generator, never edited by hand.
    const packagePath = join(output, "package.json");
    const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as Record<string, unknown>;
    pkg.name = `@vaeltrix/bindings-${name}`;
    pkg.private = true;
    pkg.scripts = { build: "tsc", typecheck: "tsc --noEmit" };
    pkg.dependencies = { "@stellar/stellar-sdk": sdkVersion.version, buffer: "6.0.3" };
    delete pkg.devDependencies;
    writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + "\n");
    const tsconfigPath = join(output, "tsconfig.json");
    const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf8")) as {
      compilerOptions: Record<string, unknown>;
    };
    tsconfig.compilerOptions.rootDir = "./src";
    writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + "\n");
    if (check) {
      const committed = resolve("packages/bindings", name);
      const generatedFiles = files(output),
        committedFiles = files(committed);
      if (
        JSON.stringify(generatedFiles) !== JSON.stringify(committedFiles) ||
        generatedFiles.some(
          (file) => !readFileSync(join(output, file)).equals(readFileSync(join(committed, file))),
        )
      )
        throw new Error(
          `Stale ${name} bindings. Build contracts, run pnpm bindings --local, and commit the output.`,
        );
    }
  }
  if (!check) {
    execFileSync("pnpm", ["install"], { cwd: root, stdio: "inherit" });
    execFileSync("pnpm", ["-r", "--filter", "./packages/bindings/*", "build"], {
      cwd: root,
      stdio: "inherit",
    });
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
