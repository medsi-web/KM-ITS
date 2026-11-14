import { randomUUID } from "node:crypto";
import { ApiError } from "../../lib/http.ts";
import { hashPassword, normalizedUsername, temporaryPassword } from "../auth/password.ts";
import type { AdminAccount, AdminRole } from "../auth/models.ts";
import { publicAccount } from "../auth/models.ts";
import { assertCurrentActor } from "../auth/session.ts";
import type { AdminContext } from "../auth/session.ts";
import { accessTransaction, audit } from "../auth/store.ts";
import type { AuthStore } from "../auth/store.ts";

function checkFields(body: Record<string, unknown>, allowed: string[]) {
  if (!Object.keys(body).length || Object.keys(body).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, "INVALID_ACCOUNT_INPUT", `Allowed fields: ${allowed.join(", ")}.`);
  }
}
function accountName(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 120) {
    throw new ApiError(400, "INVALID_ACCOUNT_INPUT", "Account name must contain 1 to 120 characters.");
  }
  return value.trim();
}

export async function createAccount(store: AuthStore, actor: AdminContext, body: Record<string, unknown>) {
  checkFields(body, ["username", "name", "role"]);
  const username = normalizedUsername(body.username);
  if (body.role !== undefined && body.role !== "ADMIN" && body.role !== "SUPER_ADMIN") throw new ApiError(400, "INVALID_ACCOUNT_INPUT", "Unsupported account role.");
  const role = (body.role ?? "ADMIN") as AdminRole;
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  const name = accountName(body.name);
  return accessTransaction(store, async (transaction) => {
    await assertCurrentActor(store, actor, transaction);
    const now = new Date();
    const account: AdminAccount = {
      _id: randomUUID(), username, passwordHash, requirePasswordChange: true, name, role, active: true, authVersion: 0,
      createdBy: actor.account._id, createdAt: now, updatedAt: now,
    };
    await store.accounts.insertOne(account, { session: transaction });
    await audit(store, transaction, "account.created", actor.account._id, account._id, { role });
    return { account: publicAccount(account), temporaryPassword: password };
  });
}

export async function updateAccount(store: AuthStore, actor: AdminContext, id: string, body: Record<string, unknown>) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new ApiError(400, "INVALID_ACCOUNT_ID", "Account ID must be a UUID.");
  }
  checkFields(body, ["name", "active", "role"]);
  const patch: Partial<Pick<AdminAccount, "name" | "active" | "role">> = {};
  if ("name" in body) patch.name = accountName(body.name);
  if ("active" in body) {
    if (typeof body.active !== "boolean") throw new ApiError(400, "INVALID_ACCOUNT_INPUT", "active must be a boolean.");
    patch.active = body.active;
  }
  if ("role" in body) {
    if (body.role !== "ADMIN" && body.role !== "SUPER_ADMIN") throw new ApiError(400, "INVALID_ACCOUNT_INPUT", "Unsupported account role.");
    patch.role = body.role as AdminRole;
  }
  return accessTransaction(store, async (transaction) => {
    await assertCurrentActor(store, actor, transaction);
    const target = await store.accounts.findOne({ _id: id }, { session: transaction });
    if (!target) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Admin account was not found.");
    const next = { ...target, ...patch };
    if (next.role === "SUPER_ADMIN" && target.role !== "SUPER_ADMIN" && (!next.active || !target.passwordHash?.startsWith("$argon2id$") || target.requirePasswordChange !== false)) {
      throw new ApiError(409, "SUCCESSOR_NOT_READY", "The successor must be active and have changed their temporary password before promotion.");
    }
    const losesSuperAccess = target.active && target.role === "SUPER_ADMIN" && (!next.active || next.role !== "SUPER_ADMIN");
    if (losesSuperAccess && !await store.accounts.countDocuments({
      _id: { $ne: id }, role: "SUPER_ADMIN", active: true,
      passwordHash: { $regex: "^\\$argon2id\\$" }, requirePasswordChange: false,
    }, { session: transaction })) {
      throw new ApiError(409, "LAST_SUPER_ADMIN", "Keep at least one active super admin with a permanent password.");
    }
    const accessChanged = next.role !== target.role || next.active !== target.active;
    const updatedAt = new Date();
    await store.accounts.updateOne({ _id: id }, {
      $set: { ...patch, updatedAt }, ...(accessChanged ? { $inc: { authVersion: 1 } } : {}),
    }, { session: transaction });
    if (accessChanged) await store.sessions.deleteMany({ accountId: id }, { session: transaction });
    await audit(store, transaction, "account.updated", actor.account._id, id, {
      before: { name: target.name, role: target.role, active: target.active },
      after: { name: next.name, role: next.role, active: next.active },
    });
    return publicAccount({ ...next, updatedAt });
  });
}

export async function listAccounts(store: AuthStore, url: URL) {
  const limit = Number(url.searchParams.get("limit") ?? 50);
  const offset = Number(url.searchParams.get("offset") ?? 0);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw new ApiError(400, "INVALID_PAGINATION", "Use limit 1–100 and offset 0–10000.");
  }
  const items = await store.accounts.find({}).sort({ createdAt: 1, _id: 1 }).skip(offset).limit(limit).toArray();
  return { items: items.map(publicAccount), limit, offset };
}

export async function resetPassword(store: AuthStore, actor: AdminContext, id: string) {
  if (id === actor.account._id) throw new ApiError(400, "SELF_RESET_FORBIDDEN", "Use the password-change endpoint for your own account.");
  const password = temporaryPassword();
  const passwordHash = await hashPassword(password);
  return accessTransaction(store, async (transaction) => {
    await assertCurrentActor(store, actor, transaction);
    const target = await store.accounts.findOne({ _id: id }, { session: transaction });
    if (!target) throw new ApiError(404, "ACCOUNT_NOT_FOUND", "Admin account was not found.");
    if (!target.username || !target.passwordHash) throw new ApiError(409, "AUTH_MIGRATION_REQUIRED", "Migrate legacy accounts before resetting passwords.");
    const updatedAt = new Date();
    await store.accounts.updateOne({ _id: id }, { $set: { passwordHash, requirePasswordChange: true, updatedAt }, $inc: { authVersion: 1 } }, { session: transaction });
    await store.sessions.deleteMany({ accountId: id }, { session: transaction });
    await audit(store, transaction, "account.password_reset", actor.account._id, id);
    return { account: publicAccount({ ...target, requirePasswordChange: true, updatedAt }), temporaryPassword: password };
  });
}
