import { createHash, timingSafeEqual } from "node:crypto";
import { ApiError } from "../lib/http.ts";

export function requireIngestionSecret(request: Request): void {
  const secret = process.env.APPS_SCRIPT_INGESTION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new ApiError(503, "INTEGRATION_NOT_CONFIGURED", "Apps Script ingestion is not configured.");
  }
  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!supplied || !timingSafeEqual(hash(supplied), hash(secret))) {
    throw new ApiError(401, "UNAUTHORIZED_INTEGRATION", "A valid integration credential is required.");
  }
}
