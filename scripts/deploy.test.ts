import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { parseArgs } from "./deploy.js";
import { assertFresh, maximumTtl } from "./lib/deployment.js";
import { server } from "./lib/usdc.js";
import { vi } from "vitest";
it("refuses implicit overwrite and unsupported networks", () => {
  const dir = mkdtempSync(join(tmpdir(), "vx-deploy-"));
  try {
    const path = join(dir, "testnet.json");
    assertFresh(path, false);
    writeFileSync(path, "{}");
    expect(() => assertFresh(path, false)).toThrow("--fresh");
    assertFresh(path, true);
  } finally {
    rmSync(dir, { recursive: true });
  }
  expect(parseArgs(["--network", "testnet", "--fresh"])).toBe(true);
  expect(() => parseArgs(["--network", "wrong"])).toThrow();
  expect(() => parseArgs(["--unknown"])).toThrow();
});
it("fails closed when network TTL configuration is missing", async () => {
  const read = vi
    .spyOn(server, "getLedgerEntries")
    .mockResolvedValue({ entries: [], latestLedger: 1 });
  try {
    await expect(maximumTtl()).rejects.toThrow("Missing network TTL");
  } finally {
    read.mockRestore();
  }
});
it("records the transaction returning this contract, skipping an unrelated newer transaction", async () => {
  const { confirmDeployment } = await import("./lib/deployment.js");
  const { horizon } = await import("./lib/usdc.js");
  const { Address, nativeToScVal } = await import("@stellar/stellar-sdk");
  const id = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  const builder = {
    forAccount() {
      return this;
    },
    order() {
      return this;
    },
    limit() {
      return this;
    },
    async call() {
      return { records: [{ hash: "unrelated" }, { hash: "deployment" }] };
    },
  };
  const history = vi
    .spyOn(horizon, "transactions")
    .mockReturnValue(builder as unknown as ReturnType<typeof horizon.transactions>);
  type Result = Awaited<ReturnType<typeof server.getTransaction>>;
  const read = vi
    .spyOn(server, "getTransaction")
    .mockResolvedValueOnce({
      status: "SUCCESS",
      ledger: 20,
      returnValue: nativeToScVal("different"),
    } as Result)
    .mockResolvedValueOnce({
      status: "SUCCESS",
      ledger: 19,
      returnValue: new Address(id).toScVal(),
    } as Result);
  try {
    await expect(confirmDeployment(id, "account")).resolves.toEqual({
      hash: "deployment",
      ledger: 19,
    });
  } finally {
    history.mockRestore();
    read.mockRestore();
  }
});
