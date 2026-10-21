/** Fastify foundation and schema-derived OpenAPI (guide §13.3, VX-704). */
import Fastify from "fastify";
import cors from "@fastify/cors";
import type { FastifySchema } from "fastify";

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: {
      type: "object",
      required: ["code", "message"],
      properties: { code: { type: "string" }, message: { type: "string" } },
    },
  },
} as const;
type Schema = Record<string, unknown>;
export function buildApp(options: { now?: () => number } = {}) {
  const app = Fastify({ logger: false });
  const now = options.now ?? Date.now;
  const paths: Record<string, Record<string, unknown>> = {};
  app.addHook("onRoute", (route) => {
    if (!route.url.startsWith("/v1/") || route.url === "/v1/openapi.json") return;
    const path = route.url.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, "{$1}");
    const schema: FastifySchema = route.schema ?? {};
    const parameters: unknown[] = [];
    for (const [source, location] of [
      [schema.querystring, "query"],
      [schema.params, "path"],
    ] as const) {
      const object = source as
        { properties?: Record<string, Schema>; required?: string[] } | undefined;
      for (const [name, value] of Object.entries(object?.properties ?? {}))
        parameters.push({
          name,
          in: location,
          required: location === "path" || (object?.required?.includes(name) ?? false),
          schema: value,
        });
    }
    const responses = Object.fromEntries(
      Object.entries(schema.response ?? { 200: { type: "object" } }).map(([code, value]) => [
        code,
        {
          description: code.startsWith("2") ? "Success" : "Error",
          content: { "application/json": { schema: value } },
        },
      ]),
    );
    for (const method of Array.isArray(route.method) ? route.method : [route.method]) {
      if (method === "HEAD") continue;
      paths[path] ??= {};
      paths[path][method.toLowerCase()] = { parameters, responses };
    }
  });
  void app.register(cors, { origin: "*", methods: ["GET", "HEAD", "OPTIONS"] });
  const cache = new Map<string, { until: number; payload: string; type: string }>();
  app.addHook("onRequest", async (request, reply) => {
    if (request.method !== "GET" || !request.url.startsWith("/v1/")) return;
    const entry = cache.get(request.url);
    if (entry && entry.until > now()) return reply.type(entry.type).send(entry.payload);
    cache.delete(request.url);
  });
  app.addHook("onSend", async (request, reply, payload) => {
    if (
      request.method === "GET" &&
      request.url.startsWith("/v1/") &&
      reply.statusCode === 200 &&
      typeof payload === "string" &&
      !cache.has(request.url)
    ) {
      if (cache.size >= 1000) cache.delete(cache.keys().next().value ?? "");
      cache.set(request.url, {
        until: now() + 5000,
        payload,
        type: String(reply.getHeader("content-type") ?? "application/json"),
      });
    }
    return payload;
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: "not_found", message: "Route not found" } }),
  );
  app.setErrorHandler((error, _request, reply) => {
    const detail = error as { statusCode?: number; validation?: unknown };
    const status = detail.validation
      ? 400
      : typeof detail.statusCode === "number" &&
          Number.isInteger(detail.statusCode) &&
          detail.statusCode >= 400 &&
          detail.statusCode <= 599
        ? detail.statusCode
        : 500;
    const codes: Record<number, string> = {
      400: "bad_request",
      401: "unauthorized",
      403: "forbidden",
      404: "not_found",
      409: "conflict",
      429: "rate_limited",
    };
    return reply.code(status).send({
      error: {
        code: status >= 500 ? "internal_error" : (codes[status] ?? "request_error"),
        message:
          status >= 500
            ? "Internal server error"
            : status === 400
              ? "Invalid request"
              : "Request failed",
      },
    });
  });
  app.get(
    "/healthz",
    {
      schema: { response: { 200: { type: "object", properties: { status: { type: "string" } } } } },
    },
    async () => ({ status: "ok" }),
  );
  app.get(
    "/v1/openapi.json",
    {
      schema: {
        response: { 200: { type: "object", additionalProperties: true }, 500: errorSchema },
      },
    },
    async () => ({ openapi: "3.1.0", info: { title: "Vaeltrix API", version: "0.0.0" }, paths }),
  );
  return app;
}
