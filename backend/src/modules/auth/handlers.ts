import { ApiError, defineHandler, readJsonObject } from "../../lib/http.ts";
import { getAuthStore } from "./store.ts";
import { endSession, issuePasswordSession, requireAdmin } from "./session.ts";
import { publicAccount } from "./models.ts";
import { appOrigin, authCookie, cookieName, csrfForSession, opaqueToken, readCookie, SESSION_SECONDS } from "./security.ts";
import { changePassword, limitLogin } from "./credentials.ts";

export const authLogin = async (request: Request) => {
  const browser = readCookie(request, cookieName("browser")) ?? opaqueToken();
  let token: string | undefined;
  const response = await defineHandler("auth.login", async (request) => {
    if (request.headers.get("origin") !== appOrigin()) throw new ApiError(403, "CSRF_REJECTED", "A matching origin is required.");
    const body = await readJsonObject(request);
    const store = await getAuthStore();
    await limitLogin(store, body.username, browser);
    const context = await issuePasswordSession(store, body.username, body.password, readCookie(request, cookieName("session")));
    token = context.token;
    return { account: publicAccount(context.account), expiresAt: context.session.expiresAt, csrfToken: csrfForSession(context.token) };
  })(request);
  // Include the browser cookie on failures as well, so repeated failures are shared.
  if (response.status !== 503) response.headers.append("Set-Cookie", authCookie("browser", browser, SESSION_SECONDS));
  if (token) response.headers.append("Set-Cookie", authCookie("session", token, SESSION_SECONDS));
  return response;
};

export const authMe = defineHandler("auth.me", async (request) => {
  const context = await requireAdmin(request, "ADMIN", false, true);
  return { account: publicAccount(context.account), expiresAt: context.session.expiresAt, csrfToken: csrfForSession(context.token) };
});

const password = defineHandler("auth.password", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true, true);
  const body = await readJsonObject(request);
  return changePassword(await getAuthStore(), context, body.oldPassword, body.newPassword);
});
const logout = defineHandler("auth.logout", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true, true);
  await endSession(await getAuthStore(), context);
  return { loggedOut: true };
});
export const authPassword = async (request: Request) => {
  const response = await password(request);
  if (response.ok) response.headers.append("Set-Cookie", authCookie("session", "", 0));
  return response;
};
export const authLogout = async (request: Request) => {
  const response = await logout(request);
  if (response.ok) response.headers.append("Set-Cookie", authCookie("session", "", 0));
  return response;
};
