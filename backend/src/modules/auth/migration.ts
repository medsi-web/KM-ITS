import { ApiError } from "../../lib/http.ts";
import type { Db } from "mongodb";
import { accessTransaction, audit, authCollections, initializeAuth } from "./store.ts";
import { hashPassword, normalizedUsername } from "./password.ts";

// Offline operator operation. No request endpoint invokes this function.
export async function migrateAuth(database: Db, input: unknown, confirmIndexes: boolean) {
  if (!confirmIndexes) throw new ApiError(400, "MIGRATION_CONFIRMATION_REQUIRED", "Explicitly confirm replacement of legacy identity indexes.");
  if (!Array.isArray(input) || !input.length) throw new ApiError(400, "INVALID_MIGRATION", "Provide a nonempty array of {id, username, password} mappings.");
  const mappings = await Promise.all(input.map(async (row: unknown) => {
    if (!row || typeof row !== "object" || !("id" in row) || typeof row.id !== "string" || !("username" in row)) throw new ApiError(400, "INVALID_MIGRATION", "Each mapping needs an existing account ID and username.");
    return { id: row.id, username: normalizedUsername(row.username), passwordHash: "password" in row ? await hashPassword(row.password) : undefined };
  }));
  if (new Set(mappings.map(row => row.id)).size !== mappings.length || new Set(mappings.map(row => row.username)).size !== mappings.length) throw new ApiError(400, "INVALID_MIGRATION", "Duplicate IDs or usernames are not allowed.");
  const store = authCollections(database);
  // Additive unique index first; retained legacy identity fields remain audit history.
  await store.accounts.createIndex({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: "string" } } });
  await accessTransaction(store, async (session) => {
    const accounts = await store.accounts.find({}, { session }).toArray();
    if (accounts.length !== mappings.length || accounts.some(account => !mappings.some(row => row.id === account._id))) throw new ApiError(400, "INVALID_MIGRATION", "Map every existing account ID exactly once.");
    for (const account of accounts) {
      const mapping = mappings.find(row => row.id === account._id)!;
      if (account.username && account.passwordHash?.startsWith("$argon2id$")) {
        if (account.username !== mapping.username) throw new ApiError(409, "MIGRATION_CONFLICT", "An already migrated account has a different username.");
        continue; // A retry never resets an already migrated credential.
      }
      if (!mapping.passwordHash) throw new ApiError(400, "INVALID_MIGRATION", "Unmigrated accounts require a password.");
      await store.accounts.updateOne({ _id: account._id }, { $set: { username: mapping.username, passwordHash: mapping.passwordHash, requirePasswordChange: true, updatedAt: new Date() }, $inc: { authVersion: 1 } }, { session });
      await audit(store, session, "account.credentials_migrated", "operator", account._id, { username: mapping.username });
    }
    const control = await store.control.findOne({ _id: "access" }, { session });
    if (control?.authSchema !== "local-password-v1") {
      await store.sessions.deleteMany({}, { session });
      await store.control.updateOne({ _id: "access" }, { $set: { authSchema: "local-password-v1" } }, { session });
      await audit(store, session, "auth.schema_migrated", "operator", "access");
    }
  });
  // DDL cannot run inside a transaction. Safe to retry after a crash: credentials
  // are already local, and only explicitly confirmed obsolete indexes are removed.
  for (const index of await store.accounts.listIndexes().toArray()) {
    if (index.name && index.unique && ("email" in index.key || "googleSub" in index.key)) await store.accounts.dropIndex(index.name);
  }
  await initializeAuth(database);
}
