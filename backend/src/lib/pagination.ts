import type { Collection, Document, Filter, Sort, WithId } from "mongodb";
import { ApiError } from "./errors.ts";

export const MAX_OFFSET = 10000;

export function readPagination(url: URL, defaultLimit: number, maxLimit: number) {
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = url.searchParams.get(key);
    const value = raw === null ? fallback : Number(raw);
    if ((raw !== null && !/^\d+$/.test(raw)) || !Number.isSafeInteger(value) || value < min || value > max) {
      throw new ApiError(400, "INVALID_PAGINATION", `Use limit 1-${maxLimit} and offset 0-${MAX_OFFSET}.`);
    }
    return value;
  };
  return { limit: number("limit", Math.min(defaultLimit, maxLimit), 1, maxLimit), offset: number("offset", 0, 0, MAX_OFFSET) };
}

// Reject unknown parameters instead of silently implying a filter was applied.
export function rejectUnknownQuery(url: URL, allowed: readonly string[]) {
  const unknown = [...url.searchParams.keys()].filter(key => !allowed.includes(key));
  if (unknown.length) throw new ApiError(400, "UNSUPPORTED_QUERY", `Supported query parameters: ${allowed.join(", ")}.`);
}

// One page of a collection plus the total match count, in the common
// `{ items, total, limit, offset }` response shape.
export async function findPage<T extends Document, V>(collection: Collection<T>, filter: Filter<T>, sort: Sort,
  page: { limit: number; offset: number }, view: (record: WithId<T>) => V) {
  const [records, total] = await Promise.all([
    collection.find(filter).sort(sort).skip(page.offset).limit(page.limit).toArray(),
    collection.countDocuments(filter),
  ]);
  return { items: records.map(view), total, limit: page.limit, offset: page.offset };
}

// An optional exact-match filter value with a length bound.
export function filterValue(url: URL, key: string, maxLength: number): string | undefined {
  const value = url.searchParams.get(key);
  if (value === null) return undefined;
  if (!value || value.length > maxLength) throw new ApiError(400, "INVALID_FILTER", `Filter values must contain 1–${maxLength} characters.`);
  return value;
}
