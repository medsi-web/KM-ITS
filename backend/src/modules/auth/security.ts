import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { ApiError } from "../../lib/http.ts";

export const SESSION_SECONDS = 24 * 60 * 60;
export const OAUTH_SECONDS = 10 * 60;
export const opaqueToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
export const csrfForSession = (token: string) => createHmac("sha256", token).update("kmits-session-csrf-v1").digest("base64url");
export const sameSecret = (left: string, right: string) => timingSafeEqual(Buffer.from(tokenHash(left)), Buffer.from(tokenHash(right)));

export function appOrigin(): string {
  const configured = process.env.APP_ORIGIN;
  try {
    if (!configured) throw new Error();
    const url = new URL(configured);
    const localhost = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash ||
        (url.protocol !== "https:" && !(localhost && url.protocol === "http:"))) throw new Error();
    return url.origin;
  } catch {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Configure APP_ORIGIN with the website's HTTPS origin (HTTP localhost is allowed).");
  }
}

export function cookieName(kind: "session" | "oauth"): string {
  return `${process.env.APP_ORIGIN?.startsWith("https:") ? "__Host-" : ""}kmits_${kind}`;
}

export function readCookie(request: Request, name: string): string | undefined {
  const entries = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim());
  const matches = entries.filter((entry) => entry.startsWith(`${name}=`));
  if (matches.length !== 1) return undefined;
  const value = matches[0].slice(name.length + 1);
  return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
}

export function authCookie(kind: "session" | "oauth", value: string, seconds: number): string {
  const secure = new URL(appOrigin()).protocol === "https:";
  return `${cookieName(kind)}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure ? "; Secure" : ""}`;
}

export function requireCsrf(request: Request, token: string): void {
  if (request.headers.get("origin") !== appOrigin() || !sameSecret(request.headers.get("x-csrf-token") ?? "", csrfForSession(token))) {
    throw new ApiError(403, "CSRF_REJECTED", "A matching origin and session CSRF token are required.");
  }
}
