import { afterEach, expect, it, vi } from "vitest";
import { parseArgs, readStellarToml, verifyDomain } from "./verify-domain.js";

const id = "ab".repeat(32);
const registry = "CBBZQ577QYKADNBAYBYN56Q3ZDTDQYCBOGREHBFEVOWOI5F27TJBE6MO";
const domain = "anchor.example";
const toml = (provider = id, contract = registry) =>
  `[VAELTRIX]\nPROVIDER_ID = "${provider}"\nREGISTRY_CONTRACT = "${contract}"\nCOMMITMENTS = [1]\n`;

function fixture(verified = false, home_domain = domain) {
  return {
    getProvider: vi.fn(() => ({ home_domain, verified })),
    readToml: readStellarToml,
    setVerified: vi.fn(),
  };
}

afterEach(() => vi.unstubAllGlobals());

it("reads the registered anchor's HTTPS TOML and verifies matching IDs", async () => {
  const verifier = fixture();
  const fetch = vi.fn(async () => new Response(toml()));
  vi.stubGlobal("fetch", fetch);

  await expect(verifyDomain(id, registry, verifier)).resolves.toBe("verified");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    `https://${domain}/.well-known/stellar.toml`,
    expect.objectContaining({ method: "GET", redirect: "manual" }),
  );
  expect(verifier.getProvider).toHaveBeenCalledWith(id);
  expect(verifier.setVerified).toHaveBeenCalledExactlyOnceWith(id, true);
});

it("leaves a matching verified provider unchanged", async () => {
  const verifier = fixture(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(toml())),
  );
  await expect(verifyDomain(id, registry, verifier)).resolves.toBe("already verified");
  expect(verifier.setVerified).not.toHaveBeenCalled();
});

it("refuses a different provider ID with a clear error", async () => {
  const verifier = fixture();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(toml("cd".repeat(32)))),
  );
  await expect(verifyDomain(id, registry, verifier)).rejects.toThrow("PROVIDER_ID did not match");
  expect(verifier.setVerified).not.toHaveBeenCalled();
});

it("revokes existing verification when TOML points to a different registry", async () => {
  const verifier = fixture(true);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(toml(id, "different-registry"))),
  );
  await expect(verifyDomain(id, registry, verifier)).rejects.toThrow(
    "REGISTRY_CONTRACT did not match",
  );
  expect(verifier.setVerified).toHaveBeenCalledExactlyOnceWith(id, false);
});

it.each([
  ["unavailable TOML", () => new Response("not found", { status: 404 })],
  ["invalid TOML", () => new Response("[broken")],
  ["a redirect", () => Response.redirect("https://another.example/stellar.toml")],
])("leaves verification unchanged on %s", async (_, response) => {
  const verifier = fixture(true);
  const fetch = vi.fn(async () => response());
  vi.stubGlobal("fetch", fetch);
  await expect(verifyDomain(id, registry, verifier)).rejects.toThrow("verification unchanged");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(verifier.setVerified).not.toHaveBeenCalled();
});

it.each(["127.0.0.1", "example.com:8080", "https://anchor.example", "anchor.local"])(
  "does not fetch an invalid provider hostname: %s",
  async (hostname) => {
    const verifier = fixture(false, hostname);
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(verifyDomain(id, registry, verifier)).rejects.toThrow("DNS hostname");
    expect(fetch).not.toHaveBeenCalled();
  },
);

it("validates the provider ID and accepts only configured verifier aliases", () => {
  expect(parseArgs([id.toUpperCase()])).toEqual({ id, source: "deployer" });
  expect(parseArgs([id, "--source", "verifier"])).toEqual({ id, source: "verifier" });
  expect(() => parseArgs(["invalid"])).toThrow("64-character provider ID");
  expect(() => parseArgs([id, "--source", "observer"])).toThrow("Usage");
});
