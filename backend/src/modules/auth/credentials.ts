import { ApiError } from "../../lib/http.ts";
import { hashPassword, normalizedUsername, verifyPassword } from "./password.ts";
import { assertCurrentActor, invalidLogin } from "./session.ts";
import type { AdminContext } from "./session.ts";
import { accessTransaction, audit } from "./store.ts";
import type { AuthStore } from "./store.ts";
import { tokenHash } from "./security.ts";

export async function limitLogin(store: AuthStore, usernameInput: unknown, browser: string, now = Date.now()) {
  let username: string;
  try { username = normalizedUsername(usernameInput); } catch { username = "invalid"; }
  const window = Math.floor(now / 600000);
  // Count every attempt, including successful attempts and attempts already blocked
  // in another scope. Cookie resets cannot bypass the username/global ceilings.
  let blocked = false;
  for (const [scope, maximum] of [["global", 120], [`browser:${tokenHash(browser)}`, 20], [`username:${tokenHash(username)}`, 10]] as const) {
    const record = await store.rates.findOneAndUpdate({ _id: `${scope}:${window}` }, {
      $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((window + 1) * 600000) },
    }, { upsert: true, returnDocument: "after" });
    if (!record || record.count > maximum) blocked = true;
  }
  if (blocked) throw invalidLogin();
}

export async function changePassword(store: AuthStore, actor: AdminContext, oldPassword: unknown, newPassword: unknown) {
  if (!await verifyPassword(actor.account.passwordHash, oldPassword)) throw invalidLogin();
  if (oldPassword === newPassword) throw new ApiError(400, "PASSWORD_UNCHANGED", "Choose a different password.");
  const passwordHash = await hashPassword(newPassword);
  await accessTransaction(store, async (transaction) => {
    const current = await assertCurrentActor(store, actor, transaction, false, true);
    if (current.passwordHash !== actor.account.passwordHash || current.authVersion !== actor.account.authVersion) throw invalidLogin();
    await store.accounts.updateOne({ _id: current._id }, {
      $set: { passwordHash, requirePasswordChange: false, updatedAt: new Date() }, $inc: { authVersion: 1 },
    }, { session: transaction });
    await store.sessions.deleteMany({ accountId: current._id }, { session: transaction });
    await audit(store, transaction, "auth.password_changed", current._id, current._id);
  });
  return { passwordChanged: true, reloginRequired: true };
}
