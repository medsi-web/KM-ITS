import { randomUUID } from "node:crypto";
import { MongoServerError } from "mongodb";
import type { ClientSession, Db } from "mongodb";
import { getDatabase, getMongoClient } from "../../lib/database.ts";
import { ApiError } from "../../lib/http.ts";
import type { AdminAccount, AdminAudit, AdminControl, AdminSession, OAuthAttempt, RateLimit } from "./models.ts";

export function authCollections(database: Db) {
  return {
    accounts: database.collection<AdminAccount>("admins"),
    sessions: database.collection<AdminSession>("admin_sessions"),
    attempts: database.collection<OAuthAttempt>("admin_oauth_attempts"),
    rates: database.collection<RateLimit>("admin_rate_limits"),
    control: database.collection<AdminControl>("admin_control"),
    audit: database.collection<AdminAudit>("admin_audit"),
  };
}
export type AuthStore = ReturnType<typeof authCollections>;

export async function getAuthStore(): Promise<AuthStore> {
  const store = authCollections(await getDatabase());
  if (!await store.control.findOne({ _id: "access" })) {
    throw new ApiError(503, "AUTH_NOT_INITIALIZED", "Run the authentication setup command first.");
  }
  return store;
}

export async function initializeAuth(database: Db): Promise<void> {
  const store = authCollections(database);
  await store.accounts.createIndex({ email: 1 }, { unique: true });
  await store.accounts.createIndex({ googleSub: 1 }, { unique: true, partialFilterExpression: { googleSub: { $type: "string" } } });
  await store.accounts.createIndex({ role: 1, active: 1 });
  await store.sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await store.sessions.createIndex({ accountId: 1 });
  await store.attempts.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await store.rates.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await store.audit.createIndex({ at: -1 });
  await store.control.updateOne({ _id: "access" }, { $setOnInsert: { revision: 0 } }, { upsert: true });
}

// Every account/role/session-issuance transaction writes this common document.
// That prevents snapshot-isolation write skew between concurrent super admins.
export async function accessTransaction<T>(store: AuthStore, action: (session: ClientSession) => Promise<T>): Promise<T> {
  const client = await getMongoClient();
  const session = client.startSession();
  try {
    return await session.withTransaction(async () => {
      const locked = await store.control.updateOne({ _id: "access" }, { $inc: { revision: 1 } }, { session });
      if (!locked.matchedCount) throw new ApiError(503, "AUTH_NOT_INITIALIZED", "Authentication is not initialized.");
      return await action(session);
    }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 5000 });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (error instanceof MongoServerError && error.code === 11000) {
      throw new ApiError(409, "ACCOUNT_CONFLICT", "The account identity is already registered.");
    }
    throw new ApiError(503, "AUTH_STORAGE_UNAVAILABLE", "Authentication storage is unavailable. Check replica-set configuration.");
  } finally {
    await session.endSession();
  }
}

export async function audit(store: AuthStore, session: ClientSession, action: string, actorId: string, targetId: string, changes?: Record<string, unknown>) {
  await store.audit.insertOne({ _id: randomUUID(), action, actorId, targetId, at: new Date(), ...(changes ? { changes } : {}) }, { session });
}
