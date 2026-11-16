import { defineHandler, readJsonObject } from "../../lib/http.ts";
import { pathId } from "../../lib/request.ts";
import { requireAdmin } from "../auth/session.ts";
import { getAuthStore } from "../auth/store.ts";
import { createAccount, listAccounts, updateAccount, resetPassword } from "./service.ts";

export const accountsList = defineHandler("accounts.list", async (request) => {
  await requireAdmin(request, "SUPER_ADMIN");
  return listAccounts(await getAuthStore(), new URL(request.url));
});

export const accountsCreate = defineHandler("accounts.create", async (request) => {
  const actor = await requireAdmin(request, "SUPER_ADMIN", true);
  return createAccount(await getAuthStore(), actor, await readJsonObject(request));
});

export const accountsUpdate = defineHandler("accounts.update", async (request) => {
  const actor = await requireAdmin(request, "SUPER_ADMIN", true);
  return updateAccount(await getAuthStore(), actor, pathId(request) ?? "", await readJsonObject(request));
});

export const accountsResetPassword = defineHandler("accounts.resetPassword", async (request) => {
  const actor = await requireAdmin(request, "SUPER_ADMIN", true);
  return resetPassword(await getAuthStore(), actor, pathId(request, "reset-password") ?? "");
});
