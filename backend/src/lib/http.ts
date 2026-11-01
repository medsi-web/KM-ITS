import { randomUUID } from "node:crypto";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function jsonResponse(
  requestId: string,
  status: number,
  result: { data: unknown } | { error: { code: string; message: string } },
): Response {
  return Response.json(
    { success: "data" in result, ...result, meta: { requestId, timestamp: new Date().toISOString() } },
    { status, headers: { "Cache-Control": "no-store", "X-Request-Id": requestId } },
  );
}

type Action = (request: Request) => Promise<unknown> | unknown;

export function defineHandler(operation: string, action: Action) {
  return async function handle(request: Request): Promise<Response> {
    const requestId = randomUUID();
    try {
      const result = await action(request);
      if (result instanceof Response) {
        result.headers.set("Cache-Control", "no-store");
        result.headers.set("X-Request-Id", requestId);
        return result;
      }
      return jsonResponse(requestId, 200, { data: result });
    } catch (error) {
      if (error instanceof ApiError) {
        return jsonResponse(requestId, error.status, {
          error: { code: error.code, message: error.message },
        });
      }
      // Never log request bodies, credentials, database URIs, or stacks.
      console.error(JSON.stringify({ level: "error", event: "api.unhandled", operation, requestId }));
      return jsonResponse(requestId, 500, {
        error: { code: "INTERNAL_ERROR", message: "An unexpected error occurred." },
      });
    }
  };
}

export const MAX_JSON_BYTES = 256 * 1024;

export async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const mediaType = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ApiError(415, "UNSUPPORTED_MEDIA_TYPE", "Use Content-Type: application/json.");
  }
  if (Number(request.headers.get("content-length")) > MAX_JSON_BYTES) {
    throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON payload exceeds 256 KiB.");
  }
  const reader = request.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_JSON_BYTES) {
          await reader.cancel();
          throw new ApiError(413, "PAYLOAD_TOO_LARGE", "JSON payload exceeds 256 KiB.");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must contain valid JSON.");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ApiError(400, "INVALID_BODY", "Request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}
