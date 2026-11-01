import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { bootstrapSuperAdmin, findGoogleAccount } from "../src/modules/auth/identity.ts";
import { accessTransaction, authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import type { AuthStore } from "../src/modules/auth/store.ts";

let replica: MongoMemoryReplSet;
let store: AuthStore;
const originalEnvironment = { ...process.env };
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "kmits_auth_integration";
  const database = await getDatabase();
  await initializeAuth(database);
  store = authCollections(database);
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
  const owner = await store.accounts.findOne({});
  assert.ok(owner);
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
