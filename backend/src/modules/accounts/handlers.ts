import { defineHandler, readJsonObject } from "../../lib/http.ts";
import { requireAdmin } from "../auth/session.ts";
import { getAuthStore } from "../auth/store.ts";
import { createAccount, listAccounts, updateAccount } from "./service.ts";

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
  const id = new URL(request.url).pathname.split("/").at(-1) ?? "";
  return updateAccount(await getAuthStore(), actor, id, await readJsonObject(request));
});
