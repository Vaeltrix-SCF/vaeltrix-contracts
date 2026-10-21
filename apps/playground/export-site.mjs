/** Export an allowlisted, credential-free standalone Site source for issue #86. */
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import console from "node:console";

const app = dirname(fileURLToPath(import.meta.url));
const repo = resolve(app, "../..");
const destination = process.argv[2];
if (!destination || !isAbsolute(destination) || existsSync(destination))
  throw new Error("Provide a new absolute destination directory.");
mkdirSync(join(destination, "apps/playground"), { recursive: true });
for (const file of ["index.html", "src", "tsconfig.json", "vite.config.ts"])
  cpSync(join(app, file), join(destination, "apps/playground", file), { recursive: true });
mkdirSync(join(destination, "deployments"));
cpSync(join(repo, "deployments/testnet.json"), join(destination, "deployments/testnet.json"));
cpSync(join(repo, "tsconfig.base.json"), join(destination, "tsconfig.base.json"));
const manifest = JSON.parse(readFileSync(join(app, "package.json"), "utf8"));
const root = JSON.parse(readFileSync(join(repo, "package.json"), "utf8"));
manifest.scripts = {
  build:
    "tsc --noEmit -p apps/playground/tsconfig.json && vite build apps/playground --config apps/playground/vite.config.ts --outDir ../../dist",
};
manifest.devDependencies.typescript = root.devDependencies.typescript;
manifest.devDependencies["@types/node"] = root.devDependencies["@types/node"];
writeFileSync(join(destination, "package.json"), JSON.stringify(manifest, null, 2) + "\n");
writeFileSync(join(destination, ".gitignore"), "node_modules/\ndist/\n*.tsbuildinfo\n");
console.log(`Exported playground source to ${destination}`);
