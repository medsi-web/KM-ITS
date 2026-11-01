import { CodeChallengeMethod, OAuth2Client } from "google-auth-library";
import { ApiError } from "../lib/http.ts";
import { appOrigin, sameSecret, tokenHash } from "../modules/auth/security.ts";
import type { GoogleIdentity } from "../modules/auth/identity.ts";

export function googleLoginConfig() {
  const origin = appOrigin();
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new ApiError(503, "AUTH_NOT_CONFIGURED", "Google login is not configured.");
  }
  return { origin, clientId, clientSecret, redirectUri: `${origin}/api/auth/callback/google` };
}

function client() {
  const config = googleLoginConfig();
  return new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret, redirectUri: config.redirectUri });
}

export function googleAuthorizationUrl(state: string, verifier: string, nonce: string): string {
  const url = new URL(client().generateAuthUrl({
    scope: ["openid", "email", "profile"], access_type: "online", prompt: "select_account",
    state, code_challenge: Buffer.from(tokenHash(verifier), "hex").toString("base64url"),
    code_challenge_method: CodeChallengeMethod.S256,
  }));
  url.searchParams.set("nonce", nonce);
  return url.toString();
}

export async function exchangeGoogleCode(code: string, verifier: string, nonce: string): Promise<GoogleIdentity> {
  const config = googleLoginConfig();
  const oauth = client();
  try {
    const { tokens } = await oauth.getToken({ code, codeVerifier: verifier });
    if (!tokens.id_token) throw new Error();
    // Google's library verifies signature, issuer, audience, and expiry.
    const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const payload = ticket.getPayload() as (ReturnType<typeof ticket.getPayload> & { nonce?: string });
    if (!payload?.sub || !payload.email || payload.email_verified !== true ||
        typeof payload.nonce !== "string" || !sameSecret(payload.nonce, nonce)) throw new Error();
    // Do not store or expose any Google token. Website sessions are separate.
    return { sub: payload.sub, email: payload.email, emailVerified: true, hostedDomain: payload.hd };
  } catch {
    throw new ApiError(401, "GOOGLE_LOGIN_FAILED", "Google login could not be verified. Start a new login attempt.");
  }
}
