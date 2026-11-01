import { defineHandler } from "../../lib/http.ts";
import { getAuthStore } from "./store.ts";
import { completeGoogleLogin, startGoogleLogin } from "./oauth.ts";
import { endSession, issueGoogleSession, requireAdmin } from "./session.ts";
import { publicAccount } from "./models.ts";
import { appOrigin, authCookie, cookieName, csrfForSession, OAUTH_SECONDS, readCookie, SESSION_SECONDS } from "./security.ts";
import { googleLoginConfig } from "../../integrations/google-login.ts";

export const authLogin = defineHandler("auth.login", async (request) => {
  googleLoginConfig();
  const store = await getAuthStore();
  const attempt = await startGoogleLogin(store, readCookie(request, cookieName("oauth")));
  return new Response(null, { status: 302, headers: {
    Location: attempt.location, "Set-Cookie": authCookie("oauth", attempt.browser, OAUTH_SECONDS),
  } });
});

export const authCallback = defineHandler("auth.callback", async (request) => {
  googleLoginConfig();
  const store = await getAuthStore();
  const identity = await completeGoogleLogin(store, new URL(request.url), readCookie(request, cookieName("oauth")));
  const context = await issueGoogleSession(store, identity, readCookie(request, cookieName("session")));
  const response = new Response(null, { status: 302, headers: { Location: `${appOrigin()}/api/auth/me`, "Referrer-Policy": "no-referrer" } });
  response.headers.append("Set-Cookie", authCookie("session", context.token, SESSION_SECONDS));
  response.headers.append("Set-Cookie", authCookie("oauth", "", 0));
  return response;
});

export const authMe = defineHandler("auth.me", async (request) => {
  const context = await requireAdmin(request);
  return { account: publicAccount(context.account), expiresAt: context.session.expiresAt, csrfToken: csrfForSession(context.token) };
});

const logout = defineHandler("auth.logout", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  await endSession(await getAuthStore(), context);
  return { loggedOut: true };
});

export const authLogout = async (request: Request) => {
  const response = await logout(request);
  if (response.ok) response.headers.append("Set-Cookie", authCookie("session", "", 0));
  return response;
};
