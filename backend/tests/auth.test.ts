import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { ApiError } from "../src/lib/http.ts";
import { hashPassword, normalizedUsername, verifyPassword, validPassword, validPasswordHash } from "../src/modules/auth/password.ts";
import { appOrigin, authCookie, cookieName, csrfForSession, opaqueToken, readCookie, requireCsrf, SESSION_SECONDS, tokenHash } from "../src/modules/auth/security.ts";

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; mock.restoreAll(); });

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

test("usernames normalize case and reject ambiguous or invalid identifiers", () => {
  assert.equal(normalizedUsername(" Owner.Name "), "owner.name");
  for (const value of ["ab", "a b", "@owner", "?clair", "a".repeat(65), null]) assert.throws(() => normalizedUsername(value), ApiError);
});
test("Argon2id hashes have the configured cost, independent salts and bounded inputs", async () => {
  const password = "a strong password 123";
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.match(first, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(first, second);
  assert.equal(await verifyPassword(first, password), true);
  assert.equal(await verifyPassword(first, "wrong-password"), false);
  assert.equal(await verifyPassword(undefined, password), false);
  assert.equal(validPassword("a".repeat(11)), false);
  assert.equal(validPassword("a".repeat(129)), false);
  await assert.rejects(hashPassword("short"), ApiError);
});

test("bootstrap accepts only Argon2id hashes with at least the configured cost", async () => {
  const hash = await hashPassword("a strong password 123");
  assert.equal(validPasswordHash(hash), true);
  assert.equal(validPasswordHash(`  ${hash}
`), true, "surrounding whitespace from an env file is tolerated");
  const weaker = hash.replace("m=19456", "m=4096");
  for (const value of ["a strong password 123", "", undefined, weaker, hash.replace("t=2", "t=1"), hash.replace("argon2id", "argon2i"), `${hash}$extra`]) {
    assert.equal(validPasswordHash(value), false, String(value));
  }
});
