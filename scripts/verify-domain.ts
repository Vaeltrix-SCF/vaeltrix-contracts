/** VX-207: verify a registry provider against its Testnet stellar.toml (guide §5.3). */
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";
import { StellarToml } from "@stellar/stellar-sdk";
import { invoke, readDeployment } from "./lib/deployment.js";
import { verifyNetwork, type Role } from "./lib/usdc.js";

interface DomainProvider {
  home_domain: string;
  verified: boolean;
}

interface Verifier {
  getProvider(id: string): DomainProvider;
  readToml(domain: string): Promise<unknown>;
  setVerified(id: string, verified: boolean): void;
}

export function parseArgs(args: readonly string[]): { id: string; source: Role } {
  const [providerId, option, source] = args;
  if (
    !providerId ||
    !/^[0-9a-fA-F]{64}$/.test(providerId) ||
    !(
      args.length === 1 ||
      (args.length === 3 &&
        option === "--source" &&
        (source === "deployer" || source === "verifier"))
    )
  ) {
    throw new Error(
      "Usage: pnpm verify:domain <64-character provider ID> [--source deployer|verifier]",
    );
  }
  return { id: providerId.toLowerCase(), source: source === "verifier" ? source : "deployer" };
}

function assertHostname(domain: string): void {
  const labels = domain.split(".");
  if (
    domain.length > 253 ||
    isIP(domain) !== 0 ||
    labels.length < 2 ||
    !/^[a-z]/.test(labels.at(-1) ?? "") ||
    /\.(?:localhost|local|internal)$/.test(domain) ||
    labels.some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
  ) {
    throw new Error("Provider home domain must be a DNS hostname");
  }
}

export function readStellarToml(domain: string): Promise<unknown> {
  return StellarToml.Resolver.resolve(domain, {
    allowHttp: false,
    allowedRedirects: 0,
    timeout: 10_000,
  });
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export async function verifyDomain(
  id: string,
  registry: string,
  verifier: Verifier,
): Promise<"verified" | "already verified"> {
  const provider = verifier.getProvider(id);
  if (typeof provider?.home_domain !== "string" || typeof provider.verified !== "boolean") {
    throw new Error("Registry returned an invalid provider");
  }
  assertHostname(provider.home_domain);
  let toml: unknown;
  try {
    toml = await verifier.readToml(provider.home_domain);
  } catch {
    throw new Error(
      `Could not read https://${provider.home_domain}/.well-known/stellar.toml; verification unchanged`,
    );
  }
  const block = object(object(toml).VAELTRIX);
  const mismatches = [
    ...(block.PROVIDER_ID === id ? [] : ["PROVIDER_ID"]),
    ...(block.REGISTRY_CONTRACT === registry ? [] : ["REGISTRY_CONTRACT"]),
  ];
  if (mismatches.length > 0) {
    if (provider.verified) verifier.setVerified(id, false);
    throw new Error(
      `[VAELTRIX] ${mismatches.join(" and ")} did not match the registry for ${provider.home_domain}; ${provider.verified ? "verification revoked" : "provider was not verified"}`,
    );
  }
  if (provider.verified) return "already verified";
  verifier.setVerified(id, true);
  return "verified";
}

export async function main(args = process.argv.slice(2)): Promise<void> {
  const { id, source } = parseArgs(args);
  const { contracts } = readDeployment();
  await verifyNetwork();
  const result = await verifyDomain(id, contracts.registry, {
    getProvider: (providerId) =>
      invoke<DomainProvider>(contracts.registry, "get_provider", { id: providerId }, source),
    readToml: readStellarToml,
    setVerified: (providerId, verified) =>
      invoke<null>(
        contracts.registry,
        verified ? "verify_domain" : "unverify_domain",
        { provider_id: providerId },
        source,
        true,
      ),
  });
  console.log(`Provider ${id} ${result} on Stellar Testnet`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Domain verification failed");
    process.exitCode = 1;
  });
}
