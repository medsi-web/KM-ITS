import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError } from "../src/lib/http.ts";
import { googleAuthorizationUrl } from "../src/integrations/google-login.ts";
import { normalizedEmail } from "../src/modules/auth/identity.ts";
import { appOrigin, authCookie, cookieName, csrfForSession, opaqueToken, readCookie, requireCsrf, SESSION_SECONDS, tokenHash } from "../src/modules/auth/security.ts";

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; });

test("sessions are exactly 24 hours and production cookies restrict browser access", () => {
  assert.equal(SESSION_SECONDS, 86400);
  process.env.APP_ORIGIN = "https://kmits.example";
  const cookie = authCookie("session", opaqueToken(), SESSION_SECONDS);
  for (const part of ["__Host-kmits_session=", "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=86400", "Secure"]) assert.ok(cookie.includes(part));
  assert.ok(!cookie.includes("Domain="));
  process.env.APP_ORIGIN = "http://localhost:3000";
  assert.ok(!authCookie("session", opaqueToken(), 86400).includes("; Secure"));
});

test("origin configuration rejects insecure remote sites, paths, and credentials", () => {
  for (const value of ["", "http://kmits.example", "https://kmits.example/path", "https://user:pass@kmits.example", "https://kmits.example?query=1"]) {
    process.env.APP_ORIGIN = value;
    assert.throws(appOrigin, (error: unknown) => error instanceof ApiError && error.status === 503);
  }
});

test("CSRF requires both exact origin and token bound to the session", () => {
  process.env.APP_ORIGIN = "https://kmits.example";
  const token = opaqueToken();
  const valid = { origin: "https://kmits.example", "x-csrf-token": csrfForSession(token) };
  requireCsrf(new Request("https://kmits.example/api/auth/logout", { method: "POST", headers: valid }), token);
  for (const headers of [{}, { ...valid, origin: "https://kmits.example.attacker.test" }, { ...valid, "x-csrf-token": csrfForSession(opaqueToken()) }]) {
    assert.throws(() => requireCsrf(new Request("https://kmits.example/api/auth/logout", { method: "POST", headers }), token), (error: unknown) => error instanceof ApiError && error.code === "CSRF_REJECTED");
  }
});

test("ambiguous or malformed session cookies are not accepted", () => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  const token = opaqueToken();
  const name = cookieName("session");
  assert.equal(readCookie(new Request("http://localhost", { headers: { cookie: `${name}=${token}` } }), name), token);
  assert.equal(readCookie(new Request("http://localhost", { headers: { cookie: `${name}=${token}; ${name}=${token}` } }), name), undefined);
  assert.equal(readCookie(new Request("http://localhost", { headers: { cookie: `${name}=short` } }), name), undefined);
  assert.notEqual(tokenHash(token), token);
});

test("Google authorization requests use only login scopes and bind state, nonce, PKCE, and configured callback", () => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
  process.env.GOOGLE_CLIENT_SECRET = "test-client-secret";
  const state = opaqueToken();
  const verifier = opaqueToken();
  const nonce = opaqueToken();
  const url = new URL(googleAuthorizationUrl(state, verifier, nonce));
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("nonce"), nonce);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), Buffer.from(tokenHash(verifier), "hex").toString("base64url"));
  assert.equal(url.searchParams.get("redirect_uri"), "http://localhost:3000/api/auth/callback/google");
  assert.equal(url.searchParams.get("scope"), "openid email profile");
  assert.equal(url.searchParams.get("access_type"), "online");
  assert.ok(!url.toString().includes("test-client-secret"));
});

test("invitation email normalization does not merge plus-tags or dotted addresses", () => {
  assert.equal(normalizedEmail(" Owner.Name+admin@GMAIL.com "), "owner.name+admin@gmail.com");
  assert.throws(() => normalizedEmail("not-an-email"), ApiError);
});
