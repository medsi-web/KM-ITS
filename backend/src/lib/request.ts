export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The last path segment, or the one before a trailing action segment
// such as `/publish`.
export function pathId(request: Request, action?: string): string | undefined {
  const parts = new URL(request.url).pathname.replace(/\/$/, "").split("/");
  return action && parts.at(-1) === action ? parts.at(-2) : parts.at(-1);
}
