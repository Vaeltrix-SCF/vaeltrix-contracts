import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { amountFields, page, pagination, paginationSchema } from "../src/conventions.js";
import { readonlyPool } from "../src/database.js";

it("formats full i128 amounts with exact seven-place displays", () => {
  expect(amountFields("stake_total", 10000000000n)).toEqual({
    stake_total: "10000000000",
    stake_total_display: "1000.0000000",
  });
  expect(amountFields("amount", -1n).amount_display).toBe("-0.0000001");
  expect(amountFields("amount", (1n << 127n) - 1n).amount).toBe(
    "170141183460469231731687303715884105727",
  );
});
it("roundtrips opaque cursors and enforces list limits", () => {
  expect(pagination({})).toEqual({ limit: 50, after: null });
  const first = page([{ id: "a" }], "a");
  expect(pagination({ limit: 200, cursor: first.next_cursor })).toEqual({ limit: 200, after: "a" });
  expect(page([], null)).toEqual({ items: [], next_cursor: null });
  for (const query of [
    { limit: 0 },
    { limit: 201 },
    { limit: 1.5 },
    { limit: true },
    { cursor: "!" },
    { cursor: "e30" },
  ])
    expect(() => pagination(query)).toThrow();
});
it("rejects URL overrides that could disable database safeguards", () => {
  for (const url of [
    "https://localhost/db",
    "postgres://localhost/db?options=-c%20role%3Dadmin",
    "postgres://localhost/db?%6fptions=bad",
  ])
    expect(() => readonlyPool(url)).toThrow();
});
describe("HTTP conventions", () => {
  it("validates schema, generates OpenAPI, caches 5 seconds and returns safe errors", async () => {
    let now = 0;
    let count = 0;
    const app = buildApp({ now: () => now });
    app.get(
      "/v1/probe",
      {
        schema: {
          querystring: paginationSchema,
          response: { 200: { type: "object", properties: { count: { type: "integer" } } } },
        },
      },
      async () => ({ count: ++count }),
    );
    app.get("/v1/broken", async () => {
      throw new Error("postgres://secret:password@db/internal");
    });
    app.get("/v1/conflict", async () => {
      throw Object.assign(new Error("private detail"), { statusCode: 409 });
    });
    try {
      const conflict = await app.inject("/v1/conflict");
      expect(conflict.statusCode).toBe(409);
      expect(conflict.json()).toEqual({ error: { code: "conflict", message: "Request failed" } });
      expect((await app.inject("/healthz")).json()).toEqual({ status: "ok" });
      const one = await app.inject({
        url: "/v1/probe",
        headers: { origin: "https://example.com" },
      });
      expect(one.headers["access-control-allow-origin"]).toBe("*");
      expect(one.json().count).toBe(1);
      now = 4999;
      expect((await app.inject("/v1/probe")).json().count).toBe(1);
      now = 5000;
      expect((await app.inject("/v1/probe")).json().count).toBe(2);
      expect((await app.inject("/v1/probe?limit=201")).statusCode).toBe(400);
      expect((await app.inject("/missing")).json()).toEqual({
        error: { code: "not_found", message: "Route not found" },
      });
      const broken = await app.inject("/v1/broken");
      expect(broken.statusCode).toBe(500);
      expect(broken.body).not.toContain("password");
      const document = (await app.inject("/v1/openapi.json")).json();
      expect(document.openapi).toBe("3.1.0");
      expect(document.paths["/v1/probe"].get.parameters[0].name).toBe("limit");
      expect(
        document.paths["/v1/probe"].get.responses["200"].content["application/json"].schema
          .properties.count.type,
      ).toBe("integer");
    } finally {
      await app.close();
    }
  });
});
