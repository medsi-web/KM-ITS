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

// The last path segment, or the one before a trailing action segment.
export function pathId(request: Request, action?: string): string | undefined {
  const parts = new URL(request.url).pathname.replace(/\/$/, "").split("/");
  return action && parts.at(-1) === action ? parts.at(-2) : parts.at(-1);
}

export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
