/** REST wire conventions (guide §13.3, VX-704). */
export class BadRequest extends Error {
  readonly statusCode = 400;
}
export const paginationSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 200, default: 50 },
    cursor: { type: "string", minLength: 1, maxLength: 1024 },
  },
} as const;
export function pagination(query: { limit?: unknown; cursor?: unknown }): {
  limit: number;
  after: string | null;
} {
  if (
    query.limit !== undefined &&
    typeof query.limit !== "number" &&
    !(typeof query.limit === "string" && /^[0-9]+$/.test(query.limit))
  )
    throw new BadRequest("Invalid limit");
  const limit = query.limit === undefined ? 50 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new BadRequest("Invalid limit");
  if (query.cursor === undefined) return { limit, after: null };
  if (typeof query.cursor !== "string" || !/^[A-Za-z0-9_-]{1,1024}$/.test(query.cursor))
    throw new BadRequest("Invalid cursor");
  try {
    const bytes = Buffer.from(query.cursor, "base64url");
    if (bytes.toString("base64url") !== query.cursor) throw new Error("Noncanonical cursor");
    const value: unknown = JSON.parse(bytes.toString("utf8"));
    if (
      typeof value !== "object" ||
      value === null ||
      !("id" in value) ||
      typeof value.id !== "string" ||
      value.id.length === 0 ||
      value.id.length > 256 ||
      Object.keys(value).length !== 1
    )
      throw new Error("Invalid cursor payload");
    return { limit, after: value.id };
  } catch {
    throw new BadRequest("Invalid cursor");
  }
}
export function page<T>(
  items: T[],
  nextId: string | null,
): { items: T[]; next_cursor: string | null } {
  return {
    items,
    next_cursor:
      nextId === null ? null : Buffer.from(JSON.stringify({ id: nextId })).toString("base64url"),
  };
}
export function amountFields(name: string, amount: bigint): Record<string, string> {
  const value = amount < 0n ? -amount : amount;
  const display = `${amount < 0n ? "-" : ""}${value / 10_000_000n}.${(value % 10_000_000n).toString().padStart(7, "0")}`;
  return { [name]: amount.toString(), [`${name}_display`]: display };
}
