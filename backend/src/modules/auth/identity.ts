import { randomUUID } from "node:crypto";
import { ApiError } from "../../lib/http.ts";
import { accessTransaction, audit } from "./store.ts";
import type { AuthStore } from "./store.ts";
import { normalizedUsername, validPasswordHash } from "./password.ts";

export async function bootstrapSuperAdmin(store: AuthStore, usernameInput: unknown, passwordHashInput: unknown) {
  const username = normalizedUsername(usernameInput);
  if (!validPasswordHash(passwordHashInput)) {
    throw new ApiError(400, "INVALID_PASSWORD_HASH", "Provide an Argon2id hash made by `pnpm auth:hash`, not a plaintext password.");
  }
  const passwordHash = passwordHashInput.trim();
  return accessTransaction(store, async (session) => {
    const control = await store.control.findOne({ _id: "access" }, { session });
    if (control?.bootstrapAccountId || await store.accounts.countDocuments({}, { session })) {
      throw new ApiError(409, "BOOTSTRAP_ALREADY_COMPLETED", "Initial provisioning has already completed.");
    }
    const now = new Date();
    const account = {
      _id: randomUUID(), username, passwordHash, requirePasswordChange: false,
      name: "Initial super admin", role: "SUPER_ADMIN" as const,
      active: true, authVersion: 0, createdBy: "bootstrap", createdAt: now, updatedAt: now,
    };
    await store.accounts.insertOne(account, { session });
    await store.control.updateOne({ _id: "access" }, { $set: { bootstrapAccountId: account._id } }, { session });
    await audit(store, session, "account.bootstrap", "bootstrap", account._id);
    return account;
  });
}
