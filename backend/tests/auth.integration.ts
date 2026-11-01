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
