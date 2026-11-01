import { randomUUID } from "node:crypto";
import { ApiError } from "../../lib/http.ts";
import { accessTransaction, audit } from "./store.ts";
import type { AuthStore } from "./store.ts";

export function normalizedEmail(value: unknown): string {
  if (typeof value !== "string" || value.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) {
    throw new ApiError(400, "INVALID_EMAIL", "Provide a valid email address.");
  }
  // Do not remove dots, plus-tags, or otherwise merge distinct invitations.
  return value.trim().toLowerCase();
}

export interface GoogleIdentity {
  sub: string;
  email: string;
  emailVerified: boolean;
  hostedDomain?: string;
}

export async function bootstrapSuperAdmin(store: AuthStore, emailInput: unknown) {
  const email = normalizedEmail(emailInput);
  return accessTransaction(store, async (session) => {
    const control = await store.control.findOne({ _id: "access" }, { session });
    if (control?.bootstrapAccountId || await store.accounts.countDocuments({}, { session })) {
      throw new ApiError(409, "BOOTSTRAP_ALREADY_COMPLETED", "Initial provisioning has already completed.");
    }
    const now = new Date();
    const account = {
      _id: randomUUID(), email, name: "Initial super admin", role: "SUPER_ADMIN" as const,
      active: true, authVersion: 0, createdBy: "bootstrap", createdAt: now, updatedAt: now,
    };
    await store.accounts.insertOne(account, { session });
    await store.control.updateOne({ _id: "access" }, { $set: { bootstrapAccountId: account._id } }, { session });
    await audit(store, session, "account.bootstrap", "bootstrap", account._id);
    return account;
  });
}

export async function findGoogleAccount(store: AuthStore, identity: GoogleIdentity, session: import("mongodb").ClientSession) {
  if (!identity.sub || !identity.emailVerified) {
    throw new ApiError(403, "ADMIN_ACCESS_DENIED", "This Google account is not authorized for admin access.");
  }
  let account = await store.accounts.findOne({ googleSub: identity.sub }, { session });
  if (!account) {
    const email = normalizedEmail(identity.email);
    // A non-Google-hosted email can be reassigned despite email_verified=true.
    if (!email.endsWith("@gmail.com") && !identity.hostedDomain) {
      throw new ApiError(403, "ADMIN_ACCESS_DENIED", "This Google account requires separate identity verification.");
    }
    account = await store.accounts.findOne({ email, googleSub: { $exists: false }, active: true }, { session });
    if (account) {
      await store.accounts.updateOne({ _id: account._id }, { $set: { googleSub: identity.sub } }, { session });
      account.googleSub = identity.sub;
      await audit(store, session, "account.identity_bound", account._id, account._id);
    }
  }
  if (!account?.active) {
    throw new ApiError(403, "ADMIN_ACCESS_DENIED", "This Google account is not authorized for admin access.");
  }
  return account;
}
