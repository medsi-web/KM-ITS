import { ApiError } from "../../lib/http.ts";
import { exchangeGoogleCode, googleAuthorizationUrl, googleLoginConfig } from "../../integrations/google-login.ts";
import type { AuthStore } from "./store.ts";
import { opaqueToken, OAUTH_SECONDS, sameSecret, tokenHash } from "./security.ts";

export const googleProvider = { authorizationUrl: googleAuthorizationUrl, exchange: exchangeGoogleCode };
export type GoogleProvider = typeof googleProvider;

async function limitLogin(store: AuthStore, scope: string, maximum: number) {
  const window = Math.floor(Date.now() / (10 * 60 * 1000));
  const _id = `${scope}:${window}`;
  const record = await store.rates.findOneAndUpdate({ _id }, {
    $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * 10 * 60 * 1000) },
  }, { upsert: true, returnDocument: "after" });
  if (!record || record.count > maximum) {
    throw new ApiError(429, "LOGIN_RATE_LIMITED", "Too many login attempts. Try again later.");
  }
}

export async function startGoogleLogin(store: AuthStore, previousBrowser?: string, provider: GoogleProvider = googleProvider) {
  googleLoginConfig();
  // No X-Forwarded-For trust. A global ceiling applies even when browser cookies
  // are reset; per-browser limits further reduce accidental repeated attempts.
  await limitLogin(store, "global", 120);
  const browser = previousBrowser ?? opaqueToken();
  await limitLogin(store, `browser:${tokenHash(browser)}`, 10);
  const state = opaqueToken();
  const verifier = opaqueToken();
  const nonce = opaqueToken();
  const location = provider.authorizationUrl(state, verifier, nonce);
  await store.attempts.insertOne({
    _id: tokenHash(state), browserHash: tokenHash(browser), verifier, nonce,
    expiresAt: new Date(Date.now() + OAUTH_SECONDS * 1000),
  });
  return { browser, location };
}

export async function completeGoogleLogin(store: AuthStore, url: URL, browser?: string, provider: GoogleProvider = googleProvider) {
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !/^[A-Za-z0-9_-]{43}$/.test(state) || !browser || url.searchParams.getAll("state").length !== 1 || url.searchParams.getAll("code").length > 1) {
    throw new ApiError(400, "INVALID_OAUTH_STATE", "Start a new Google login attempt.");
  }
  const attempt = await store.attempts.findOneAndDelete({
    _id: tokenHash(state), browserHash: tokenHash(browser), expiresAt: { $gt: new Date() },
  });
  if (!attempt || !sameSecret(attempt.browserHash, tokenHash(browser))) {
    throw new ApiError(400, "INVALID_OAUTH_STATE", "The login attempt is invalid, expired, or already used.");
  }
  if (url.searchParams.has("error") || !code || code.length > 4096) {
    throw new ApiError(401, "GOOGLE_LOGIN_CANCELLED", "Google login was cancelled or did not complete.");
  }
  return provider.exchange(code, attempt.verifier, attempt.nonce);
}
