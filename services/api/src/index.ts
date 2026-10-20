/** API entry point (VX-704). Configure API_DATABASE_URL with a dedicated login. */
import { pathToFileURL } from "node:url";
import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { buildApp } from "./app.js";
import { readonlyPool, verifyReadonly } from "./database.js";
export async function main(): Promise<void> {
  if (existsSync(".env")) loadEnvFile();
  const url = process.env.API_DATABASE_URL;
  if (!url) throw new Error("API_DATABASE_URL is required");
  const pool = readonlyPool(url);
  const app = buildApp();
  app.addHook("onClose", async () => {
    await pool.end();
  });
  try {
    await verifyReadonly(pool);
    await app.listen({ port: 4000, host: "127.0.0.1" });
  } catch (error) {
    await app.close();
    throw error;
  }
  const close = () => {
    void app.close();
  };
  process.once("SIGINT", close);
  process.once("SIGTERM", close);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("API startup failed; check API_DATABASE_URL, role grants and port 4000");
    process.exitCode = 1;
  });
}
