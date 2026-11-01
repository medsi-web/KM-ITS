import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { bootstrapSuperAdmin, findGoogleAccount } from "../src/modules/auth/identity.ts";
import { accessTransaction, authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import type { AuthStore } from "../src/modules/auth/store.ts";
import { completeGoogleLogin, startGoogleLogin } from "../src/modules/auth/oauth.ts";
import { endSession, issueGoogleSession, requireAdmin } from "../src/modules/auth/session.ts";
import { csrfForSession, opaqueToken, SESSION_SECONDS, tokenHash } from "../src/modules/auth/security.ts";
import { createAccount, listAccounts, updateAccount } from "../src/modules/accounts/service.ts";
import { accountsCreate } from "../src/modules/accounts/handlers.ts";
import { reservedEndpoint } from "../src/lib/reserved-endpoint.ts";

let replica: MongoMemoryReplSet;
let store: AuthStore;
const originalEnvironment = { ...process.env };
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "kmits_auth_integration";
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.GOOGLE_CLIENT_ID = "integration-client";
  process.env.GOOGLE_CLIENT_SECRET = "integration-secret";
  const database = await getDatabase();
  await initializeAuth(database);
  store = authCollections(database);
});
beforeEach(async () => {
  for (const collection of [store.accounts, store.sessions, store.attempts, store.rates, store.audit]) await collection.deleteMany({});
  await store.control.updateOne({ _id: "access" }, { $set: { revision: 0 }, $unset: { bootstrapAccountId: "" } });
});

async function ownerFixture() {
  const owner = await bootstrapSuperAdmin(store, "owner@gmail.com");
  await accessTransaction(store, (session) => findGoogleAccount(store, {
    sub: "owner-google-sub", email: owner.email, emailVerified: true,
  }, session));
  return owner;
}

async function ownerContext() {
  const owner = await ownerFixture();
  const issued = await issueGoogleSession(store, { sub: "owner-google-sub", email: owner.email, emailVerified: true });
  return requireAdmin(new Request("http://localhost:3000", { headers: { cookie: `kmits_session=${issued.token}` } }));
}

test("only a super admin can manage invitations, and pending invitations cannot be promoted", async () => {
  const owner = await ownerContext();
  const invited = await createAccount(store, owner, { email: "successor@gmail.com", name: "Organization" });
  assert.equal(invited.role, "ADMIN");
  assert.equal(invited.linked, false);
  await assert.rejects(updateAccount(store, owner, invited.id, { role: "SUPER_ADMIN" }), (error: unknown) => error instanceof ApiError && error.code === "SUCCESSOR_NOT_READY");
  const signedIn = await issueGoogleSession(store, { sub: "successor-sub", email: invited.email, emailVerified: true });
  const request = new Request("http://localhost:3000/api/admin/accounts", { headers: { cookie: `kmits_session=${signedIn.token}` } });
  await assert.rejects(requireAdmin(request, "SUPER_ADMIN"), (error: unknown) => error instanceof ApiError && error.status === 403);
  const admin = await requireAdmin(request);
  await assert.rejects(createAccount(store, admin, { email: "attacker@gmail.com", name: "Attacker" }), (error: unknown) => error instanceof ApiError && error.status === 403);
  const listed = await listAccounts(store, new URL("http://localhost?limit=1&offset=0"));
  assert.equal(listed.items.length, 1);
  assert.ok(!JSON.stringify(listed).includes("googleSub"));
  assert.ok(!JSON.stringify(listed).includes("authVersion"));
});

test("account mutations require CSRF and reject identity/email reassignment", async () => {
  const owner = await ownerContext();
  const response = await accountsCreate(new Request("http://localhost:3000/api/admin/accounts", {
    method: "POST", headers: { cookie: `kmits_session=${owner.token}`, "content-type": "application/json" },
    body: JSON.stringify({ email: "new@gmail.com", name: "New" }),
  }));
  assert.equal(response.status, 403);
  assert.equal(await store.accounts.countDocuments({ email: "new@gmail.com" }), 0);
  await assert.rejects(updateAccount(store, owner, owner.account._id, { email: "other@gmail.com" }), (error: unknown) => error instanceof ApiError && error.code === "INVALID_ACCOUNT_INPUT");
  await assert.rejects(createAccount(store, owner, { email: "new@gmail.com", name: "New", role: "SUPER_ADMIN" }), ApiError);
});

test("handover requires a linked successor; promotion/deactivation revoke old sessions", async () => {
  const owner = await ownerContext();
  await assert.rejects(updateAccount(store, owner, owner.account._id, { active: false }), (error: unknown) => error instanceof ApiError && error.code === "LAST_SUPER_ADMIN");
  const invitation = await createAccount(store, owner, { email: "organization@gmail.com", name: "Organization" });
  const initial = await issueGoogleSession(store, { sub: "organization-sub", email: invitation.email, emailVerified: true });
  await updateAccount(store, owner, invitation.id, { role: "SUPER_ADMIN" });
  const oldRequest = new Request("http://localhost:3000", { headers: { cookie: `kmits_session=${initial.token}` } });
  await assert.rejects(requireAdmin(oldRequest), ApiError);
  const promoted = await issueGoogleSession(store, { sub: "organization-sub", email: invitation.email, emailVerified: true });
  const successor = await requireAdmin(new Request("http://localhost:3000", { headers: { cookie: `kmits_session=${promoted.token}` } }), "SUPER_ADMIN");
  await updateAccount(store, successor, owner.account._id, { active: false });
  assert.equal(await store.sessions.countDocuments({ accountId: owner.account._id }), 0);
  assert.equal((await store.accounts.findOne({ _id: owner.account._id }))?.active, false);
  await assert.rejects(issueGoogleSession(store, { sub: "owner-google-sub", email: owner.account.email, emailVerified: true }), (error: unknown) => error instanceof ApiError && error.status === 403);
  await assert.rejects(createAccount(store, owner, { email: "stale-actor@gmail.com", name: "Stale" }), (error: unknown) => error instanceof ApiError && error.status === 401);
});

test("concurrent cross-demotions cannot remove both remaining super admins", async () => {
  const owner = await ownerContext();
  const invitation = await createAccount(store, owner, { email: "second@gmail.com", name: "Second" });
  await issueGoogleSession(store, { sub: "second-sub", email: invitation.email, emailVerified: true });
  await updateAccount(store, owner, invitation.id, { role: "SUPER_ADMIN" });
  const issued = await issueGoogleSession(store, { sub: "second-sub", email: invitation.email, emailVerified: true });
  const second = await requireAdmin(new Request("http://localhost:3000", { headers: { cookie: `kmits_session=${issued.token}` } }), "SUPER_ADMIN");
  const results = await Promise.allSettled([
    updateAccount(store, owner, invitation.id, { role: "ADMIN" }),
    updateAccount(store, second, owner.account._id, { role: "ADMIN" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(await store.accounts.countDocuments({ active: true, role: "SUPER_ADMIN" }), 1);
  assert.equal(await store.audit.countDocuments({ action: "account.updated" }), 2); // Initial promotion + one committed demotion.
});

test("reserved admin features enforce sessions and CSRF before reporting not implemented", async () => {
  const owner = await ownerContext();
  const handler = reservedEndpoint("archives.approve");
  const anonymous = new Request("http://localhost:3000/api/admin/archives/id/approve", { method: "POST" });
  assert.equal((await handler(anonymous)).status, 401);
  const withoutCsrf = new Request(anonymous.url, { method: "POST", headers: { cookie: `kmits_session=${owner.token}` } });
  assert.equal((await handler(withoutCsrf)).status, 403);
  const valid = new Request(anonymous.url, { method: "POST", headers: {
    cookie: `kmits_session=${owner.token}`, origin: "http://localhost:3000", "x-csrf-token": csrfForSession(owner.token),
  } });
  assert.equal((await handler(valid)).status, 501);
});

test("OAuth attempts are browser-bound, expire strictly, and can be consumed only once", async () => {
  const provider = {
    authorizationUrl: (state: string) => `https://accounts.google.com/auth?state=${state}`,
    exchange: async () => ({ sub: "owner-google-sub", email: "ignored@gmail.com", emailVerified: true }),
  };
  const started = await startGoogleLogin(store, undefined, provider);
  const state = new URL(started.location).searchParams.get("state")!;
  const url = new URL(`http://localhost:3000/api/auth/callback/google?state=${state}&code=single-use-code`);
  await assert.rejects(completeGoogleLogin(store, url, opaqueToken(), provider), (error: unknown) => error instanceof ApiError && error.code === "INVALID_OAUTH_STATE");
  const identity = await completeGoogleLogin(store, url, started.browser, provider);
  assert.equal(identity.sub, "owner-google-sub");
  await assert.rejects(completeGoogleLogin(store, url, started.browser, provider), ApiError);
  const expired = await startGoogleLogin(store, undefined, provider);
  const expiredState = new URL(expired.location).searchParams.get("state")!;
  await store.attempts.updateOne({ _id: tokenHash(expiredState) }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(completeGoogleLogin(store, new URL(`http://localhost/callback?state=${expiredState}&code=code`), expired.browser, provider), ApiError);
});

test("login throttling is shared in MongoDB and limits repeated browser attempts", async () => {
  const browser = opaqueToken();
  const provider = { authorizationUrl: (state: string) => `https://accounts.google.com/auth?state=${state}`, exchange: async () => ({ sub: "test", email: "test@gmail.com", emailVerified: true }) };
  for (let attempt = 0; attempt < 10; attempt++) await startGoogleLogin(store, browser, provider);
  await assert.rejects(startGoogleLogin(store, browser, provider), (error: unknown) => error instanceof ApiError && error.status === 429);
});

test("session expiry is fixed at 24 hours, tokens are hashed, and logout revokes the session", async () => {
  const owner = await ownerFixture();
  const issued = await issueGoogleSession(store, { sub: "owner-google-sub", email: owner.email, emailVerified: true });
  assert.equal(issued.session.expiresAt.getTime() - issued.session.createdAt.getTime(), SESSION_SECONDS * 1000);
  assert.equal(await store.sessions.countDocuments({ _id: issued.token }), 0);
  const request = new Request("http://localhost:3000/api/auth/me", { headers: { cookie: `kmits_session=${issued.token}` } });
  const context = await requireAdmin(request);
  assert.equal(context.account._id, owner._id);
  const readAgain = await requireAdmin(request);
  assert.equal(readAgain.session.expiresAt.getTime(), issued.session.expiresAt.getTime());
  const mutation = new Request("http://localhost:3000/api/auth/logout", { method: "POST", headers: {
    cookie: `kmits_session=${issued.token}`, origin: "http://localhost:3000", "x-csrf-token": csrfForSession(issued.token),
  } });
  await requireAdmin(mutation, "ADMIN", true);
  await endSession(store, context);
  await assert.rejects(requireAdmin(request), (error: unknown) => error instanceof ApiError && error.status === 401);
  const second = await issueGoogleSession(store, { sub: "owner-google-sub", email: owner.email, emailVerified: true });
  await store.sessions.updateOne({ _id: second.session._id }, { $set: { expiresAt: new Date(0) } });
  await assert.rejects(requireAdmin(new Request("http://localhost:3000", { headers: { cookie: `kmits_session=${second.token}` } })), ApiError);
});
after(async () => {
  if (replica) {
    await (await getMongoClient()).close();
    await replica.stop();
  }
  process.env = originalEnvironment;
});

test("bootstrap is serialized and cannot provision two initial super admins", async () => {
  const outcomes = await Promise.allSettled([
    bootstrapSuperAdmin(store, "Owner@gmail.com"),
    bootstrapSuperAdmin(store, "other@gmail.com"),
  ]);
  assert.equal(outcomes.filter((outcome) => outcome.status === "fulfilled").length, 1);
  assert.equal(await store.accounts.countDocuments({ role: "SUPER_ADMIN" }), 1);
  assert.equal(await store.audit.countDocuments({ action: "account.bootstrap" }), 1);
  const account = await store.accounts.findOne({});
  assert.ok(account);
  assert.equal(account.email, account.email.toLowerCase());
  assert.equal(account.googleSub, undefined);
});

test("uninvited Google users cannot create accounts; binding uses stable sub, not name or later email", async () => {
  const owner = await bootstrapSuperAdmin(store, "owner@gmail.com");
  await assert.rejects(accessTransaction(store, (session) => findGoogleAccount(store, {
    sub: "uninvited", email: "uninvited@gmail.com", emailVerified: true,
  }, session)), (error: unknown) => error instanceof ApiError && error.status === 403);
  const first = await accessTransaction(store, (session) => findGoogleAccount(store, {
    sub: "owner-google-sub", email: owner.email, emailVerified: true,
  }, session));
  assert.equal(first._id, owner._id);
  const later = await accessTransaction(store, (session) => findGoogleAccount(store, {
    sub: "owner-google-sub", email: "changed@gmail.com", emailVerified: true,
  }, session));
  assert.equal(later._id, owner._id);
  await assert.rejects(accessTransaction(store, (session) => findGoogleAccount(store, {
    sub: "different-sub", email: owner.email, emailVerified: true,
  }, session)), (error: unknown) => error instanceof ApiError && error.status === 403);
});
