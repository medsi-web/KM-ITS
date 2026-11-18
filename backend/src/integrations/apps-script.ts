import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "../lib/http.ts";

// The server keeps only the SHA-256 of the connector's bearer secret
// (APPS_SCRIPT_INGESTION_SECRET_SHA256, from `pnpm integration:secret`). The
// plaintext secret lives only in the Apps Script project's properties.
export const MIN_INGESTION_SECRET_LENGTH = 32;
export const ingestionSecretHash = (secret: string) => createHash("sha256").update(secret, "utf8").digest("hex");

export function requireIngestionSecret(request: Request): void {
  const expected = process.env.APPS_SCRIPT_INGESTION_SECRET_SHA256?.trim().toLowerCase();
  if (!expected || !/^[0-9a-f]{64}$/.test(expected)) {
    throw new ApiError(503, "INTEGRATION_NOT_CONFIGURED", "Apps Script ingestion is not configured.");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const matches = supplied.length >= MIN_INGESTION_SECRET_LENGTH &&
    timingSafeEqual(Buffer.from(ingestionSecretHash(supplied), "hex"), Buffer.from(expected, "hex"));
  if (!matches) throw new ApiError(401, "UNAUTHORIZED_INTEGRATION", "A valid integration credential is required.");
}
