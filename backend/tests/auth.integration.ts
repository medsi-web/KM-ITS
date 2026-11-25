import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { bootstrapSuperAdmin } from "../src/modules/auth/identity.ts";
import { hashPassword } from "../src/modules/auth/password.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import type { AuthStore } from "../src/modules/auth/store.ts";
import { issuePasswordSession, requireAdmin, endSession } from "../src/modules/auth/session.ts";
import { changePassword, limitLogin } from "../src/modules/auth/credentials.ts";
import { csrfForSession, opaqueToken, SESSION_SECONDS } from "../src/modules/auth/security.ts";
import { createAccount, resetPassword, updateAccount } from "../src/modules/accounts/service.ts";
import { authLogin, authMe, authPassword, authLogout } from "../src/modules/auth/handlers.ts";
import { accountsResetPassword } from "../src/modules/accounts/handlers.ts";
import { migrateAuth } from "../src/modules/auth/migration.ts";

let replica: MongoMemoryReplSet;
let store: AuthStore;
const originalEnvironment = { ...process.env };
const secret = "owner permanent password";
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "kmits_auth_integration";
  process.env.APP_ORIGIN = "http://localhost:3000";
  const database = await getDatabase();
  await initializeAuth(database);
  store = authCollections(database);
});
beforeEach(async () => {
  for (const collection of [store.accounts, store.sessions, store.rates, store.audit]) await collection.deleteMany({});
  await store.control.updateOne({ _id: "access" }, { $set: { revision: 0, authSchema: "local-password-v1" }, $unset: { bootstrapAccountId: "" } });
});
after(async () => {
  if (replica) { await (await getMongoClient()).close(); await replica.stop(); }
  process.env = originalEnvironment;
});
function request(token: string, path = "/api/auth/me", body?: unknown, csrf = true) {
  return new Request(`http://localhost:3000${path}`, { method: body === undefined ? "GET" : "POST", headers: {
    cookie: `kmits_session=${token}`, "content-type": "application/json",
    ...(csrf ? { origin: "http://localhost:3000", "x-csrf-token": csrfForSession(token) } : {}),
  }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function ownerContext() {
  await bootstrapSuperAdmin(store, "owner", await hashPassword(secret));
  return issuePasswordSession(store, "OWNER", secret);
}
async function permanentAccount(owner: Awaited<ReturnType<typeof ownerContext>>, role = "ADMIN") {
  const created = await createAccount(store, owner, { username: "second", name: "Second", role });
  const initial = await issuePasswordSession(store, "second", created.temporaryPassword);
  await changePassword(store, initial, created.temporaryPassword, secret);
  return issuePasswordSession(store, "second", secret);
}
const isStatus = (status: number) => (error: unknown) => error instanceof ApiError && error.status === status;

test("generic credential failures, exact login origin, JSON and failed-attempt browser cookie", async () => {
  await ownerContext();
  for (const body of [{ username: "missing", password: secret }, { username: "owner", password: "wrong-password" }]) {
    const response = await authLogin(request("", "/api/auth/login", body));
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { error: { code: string } }).error.code, "INVALID_CREDENTIALS");
    assert.match(response.headers.get("set-cookie")!, /kmits_browser=/);
  }
  assert.equal((await authLogin(request("", "/api/auth/login", { username: "owner", password: secret }, false))).status, 403);
  const invalidType = new Request("http://localhost:3000/api/auth/login", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "text/plain" }, body: "{}" });
  assert.equal((await authLogin(invalidType)).status, 415);
});

test("temporary sessions allow only me/password/logout including internal actor checks", async () => {
  const owner = await ownerContext();
  const created = await createAccount(store, owner, { username: "second", name: "Second", role: "SUPER_ADMIN" });
  assert.equal(created.account.requirePasswordChange, true);
  const temporary = await issuePasswordSession(store, "second", created.temporaryPassword);
  assert.equal((await authMe(request(temporary.token))).status, 200);
  await assert.rejects(requireAdmin(request(temporary.token)), isStatus(403));
  await assert.rejects(createAccount(store, temporary, { username: "third", name: "Third" }), isStatus(403));
  await assert.rejects(updateAccount(store, owner, owner.account._id, { active: false }), error => error instanceof ApiError && error.code === "LAST_SUPER_ADMIN");
  assert.equal((await authPassword(request(temporary.token, "/api/auth/password", { oldPassword: created.temporaryPassword, newPassword: secret }, false))).status, 403);
  const changed = await authPassword(request(temporary.token, "/api/auth/password", { oldPassword: created.temporaryPassword, newPassword: secret }));
  assert.equal(changed.status, 200);
  assert.equal((await changed.json() as { data: { reloginRequired: boolean } }).data.reloginRequired, true);
  await assert.rejects(requireAdmin(request(temporary.token)), isStatus(401));
  const ready = await issuePasswordSession(store, "second", secret);
  await requireAdmin(request(ready.token), "SUPER_ADMIN");
  const reset = await resetPassword(store, owner, ready.account._id);
  const resetSession = await issuePasswordSession(store, "second", reset.temporaryPassword);
  assert.equal((await authLogout(request(resetSession.token, "/api/auth/logout", {}))).status, 200);
});

test("reset route targets second-last segment, returns password once and revokes all sessions", async () => {
  const owner = await ownerContext();
  const second = await permanentAccount(owner);
  await issuePasswordSession(store, "second", secret);
  const response = await accountsResetPassword(request(owner.token, `/api/admin/accounts/${second.account._id}/reset-password`, {}));
  assert.equal(response.status, 200);
  const data = (await response.json() as { data: { account: { id: string }; temporaryPassword: string } }).data;
  assert.equal(data.account.id, second.account._id);
  assert.ok(data.temporaryPassword.length >= 32);
  assert.equal(await store.sessions.countDocuments({ accountId: second.account._id }), 0);
  assert.ok(!JSON.stringify(await store.accounts.findOne({ _id: second.account._id })).includes(data.temporaryPassword));
  assert.ok(!JSON.stringify(await store.audit.find({}).toArray()).includes(data.temporaryPassword));
  await assert.rejects(resetPassword(store, owner, owner.account._id), isStatus(400));
});

test("reset racing login never leaves a session authenticated by the old password", async () => {
  const owner = await ownerContext();
  const second = await permanentAccount(owner);
  const outcomes = await Promise.allSettled([issuePasswordSession(store, "second", secret), resetPassword(store, owner, second.account._id)]);
  assert.equal(outcomes[1].status, "fulfilled");
  if (outcomes[0].status === "fulfilled") await assert.rejects(requireAdmin(request(outcomes[0].value.token)), isStatus(401));
  await assert.rejects(issuePasswordSession(store, "second", secret), isStatus(401));
  assert.equal(await store.sessions.countDocuments({ accountId: second.account._id }), 0);
});

test("reset racing password change wins final credentials and old actor cannot resurrect them", async () => {
  const owner = await ownerContext();
  const second = await permanentAccount(owner);
  const outcomes = await Promise.allSettled([changePassword(store, second, secret, "replacement permanent password"), resetPassword(store, owner, second.account._id)]);
  assert.equal(outcomes[1].status, "fulfilled");
  await assert.rejects(issuePasswordSession(store, "second", secret), isStatus(401));
  await assert.rejects(issuePasswordSession(store, "second", "replacement permanent password"), isStatus(401));
  if (outcomes[1].status === "fulfilled") assert.equal((await issuePasswordSession(store, "second", outcomes[1].value.temporaryPassword)).account.requirePasswordChange, true);
});

test("concurrent cross-demotions preserve a ready super admin and invalidate stale actors", async () => {
  const owner = await ownerContext();
  const second = await permanentAccount(owner, "SUPER_ADMIN");
  const outcomes = await Promise.allSettled([updateAccount(store, owner, second.account._id, { role: "ADMIN" }), updateAccount(store, second, owner.account._id, { role: "ADMIN" })]);
  assert.equal(outcomes.filter(value => value.status === "fulfilled").length, 1);
  assert.equal(await store.accounts.countDocuments({ active: true, role: "SUPER_ADMIN", requirePasswordChange: false }), 1);
});

test("rate limits share normalized username across browsers, browser across usernames, and expire by window", async () => {
  const now = 1200000;
  for (let i = 0; i < 10; i++) await limitLogin(store, "OWNER", opaqueToken(), now);
  await assert.rejects(limitLogin(store, " owner ", opaqueToken(), now), isStatus(401));
  await limitLogin(store, "owner", opaqueToken(), now + 600000);
  const browser = opaqueToken();
  for (let i = 0; i < 20; i++) await limitLogin(store, `user${i}`, browser, now);
  await assert.rejects(limitLogin(store, "another", browser, now), isStatus(401));
});

test("fixed 24h hashed sessions rotate, expire, logout and bootstrap serialization", async () => {
  const secretHash = await hashPassword(secret);
  const results = await Promise.allSettled([bootstrapSuperAdmin(store, "owner", secretHash), bootstrapSuperAdmin(store, "other", secretHash)]);
  assert.equal(results.filter(value => value.status === "fulfilled").length, 1);
  const account = await store.accounts.findOne({});
  const initial = await issuePasswordSession(store, account!.username, secret);
  assert.equal(initial.session.expiresAt.getTime() - initial.session.createdAt.getTime(), SESSION_SECONDS * 1000);
  assert.equal(await store.sessions.countDocuments({ _id: initial.token }), 0);
  const next = await issuePasswordSession(store, account!.username, secret, initial.token);
  await assert.rejects(requireAdmin(request(initial.token)), isStatus(401));
  await endSession(store, next);
  await assert.rejects(requireAdmin(request(next.token)), isStatus(401));
});

test("explicit legacy migration preserves identity/history, revokes sessions, and retries without resetting passwords", async () => {
  const owner = await ownerContext();
  const id = owner.account._id;
  await store.accounts.updateOne({ _id: id }, { $unset: { username: "", passwordHash: "", requirePasswordChange: "" } });
  await store.control.updateOne({ _id: "access" }, { $unset: { authSchema: "" } });
  await store.accounts.createIndex({ email: 1 }, { unique: true });
  await assert.rejects(requireAdmin(request(owner.token)), isStatus(503));
  const mapping = [{ id, username: "migrated", password: secret }];
  await assert.rejects(migrateAuth(await getDatabase(), mapping, false), isStatus(400));
  await migrateAuth(await getDatabase(), mapping, true);
  const migrated = await store.accounts.findOne({ _id: id });
  assert.equal(migrated!.role, "SUPER_ADMIN");
  assert.equal(migrated!.createdAt.getTime(), owner.account.createdAt.getTime());
  assert.equal(await store.sessions.countDocuments({}), 0);
  const temporary = await issuePasswordSession(store, "migrated", secret);
  await changePassword(store, temporary, secret, "new migrated password");
  await migrateAuth(await getDatabase(), mapping, true);
  await issuePasswordSession(store, "migrated", "new migrated password");
  assert.equal(await store.audit.countDocuments({ action: "account.credentials_migrated" }), 1);
  assert.equal(await store.audit.countDocuments({ action: "auth.schema_migrated" }), 1);
});
