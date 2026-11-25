import { ApiError } from "../../lib/http.ts";
import type { AdminAccount, AdminRole, AdminSession } from "./models.ts";
import { accessTransaction, audit, getAuthStore } from "./store.ts";
import type { AuthStore } from "./store.ts";
import { normalizedUsername, verifyPassword } from "./password.ts";
import { cookieName, opaqueToken, readCookie, requireCsrf, SESSION_SECONDS, tokenHash } from "./security.ts";
import type { ClientSession } from "mongodb";

export interface AdminContext { account: AdminAccount; session: AdminSession; token: string }

export const invalidLogin = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid username or password.");

export async function issuePasswordSession(store: AuthStore, usernameInput: unknown, password: unknown, previousToken?: string) {
  let username: string;
  try { username = normalizedUsername(usernameInput); } catch { username = ""; }
  const candidate = username ? await store.accounts.findOne({ username }) : null;
  if (!await verifyPassword(candidate?.passwordHash, password) || !candidate?.active) throw invalidLogin();
  const token = opaqueToken();
  const result = await accessTransaction(store, async (transaction) => {
    const account = await store.accounts.findOne({ _id: candidate._id, active: true }, { session: transaction });
    // Password hashing happens outside the fence; recheck its exact version inside.
    if (!account || account.passwordHash !== candidate.passwordHash || account.authVersion !== candidate.authVersion) throw invalidLogin();
    const now = new Date();
    const session: AdminSession = {
      _id: tokenHash(token), accountId: account._id, authVersion: account.authVersion,
      createdAt: now, expiresAt: new Date(now.getTime() + SESSION_SECONDS * 1000),
    };
    if (previousToken) await store.sessions.deleteOne({ _id: tokenHash(previousToken) }, { session: transaction });
    await store.accounts.updateOne({ _id: account._id }, { $set: { lastLoginAt: now } }, { session: transaction });
    await store.sessions.insertOne(session, { session: transaction });
    await audit(store, transaction, "auth.login", account._id, account._id);
    return { account, session };
  });
  return { ...result, token };
}

export async function requireAdmin(request: Request, role: AdminRole = "ADMIN", mutation = false, allowPasswordChange = false): Promise<AdminContext> {
  const token = readCookie(request, cookieName("session"));
  if (!token) throw new ApiError(401, "UNAUTHENTICATED", "An active admin session is required.");
  const store = await getAuthStore();
  const session = await store.sessions.findOne({ _id: tokenHash(token), expiresAt: { $gt: new Date() } });
  const account = session ? await store.accounts.findOne({ _id: session.accountId, active: true }) : null;
  if (!session || !account || !account.username || !account.passwordHash?.startsWith("$argon2id$") || account.authVersion !== session.authVersion) {
    throw new ApiError(401, "UNAUTHENTICATED", "An active admin session is required.");
  }
  if (!allowPasswordChange && account.requirePasswordChange !== false) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Change the temporary password before using admin features.");
  }
  if (role === "SUPER_ADMIN" && account.role !== role) {
    throw new ApiError(403, "FORBIDDEN", "Super-admin access is required.");
  }
  if (mutation) requireCsrf(request, token);
  return { account, session, token };
}

// Revalidate the actor after acquiring the shared transaction fence, closing
// the window between the HTTP guard and a concurrent deactivation/role change.
export async function assertCurrentActor(store: AuthStore, context: AdminContext, transaction: ClientSession, superAdmin = true, allowPasswordChange = false) {
  const account = await store.accounts.findOne({ _id: context.account._id, active: true }, { session: transaction });
  const session = await store.sessions.findOne({ _id: context.session._id, expiresAt: { $gt: new Date() } }, { session: transaction });
  if (!account || !session || session.accountId !== account._id || !account.username || !account.passwordHash?.startsWith("$argon2id$") || account.authVersion !== session.authVersion) {
    throw new ApiError(401, "UNAUTHENTICATED", "The admin session is no longer active.");
  }
  if (!allowPasswordChange && account.requirePasswordChange !== false) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "Change the temporary password before using admin features.");
  }
  if (superAdmin && account.role !== "SUPER_ADMIN") {
    throw new ApiError(403, "FORBIDDEN", "Super-admin access is required.");
  }
  return account;
}

export async function endSession(store: AuthStore, context: AdminContext) {
  await accessTransaction(store, async (transaction) => {
    await assertCurrentActor(store, context, transaction, false, true);
    await store.sessions.deleteOne({ _id: context.session._id }, { session: transaction });
    await audit(store, transaction, "auth.logout", context.account._id, context.account._id);
  });
}
