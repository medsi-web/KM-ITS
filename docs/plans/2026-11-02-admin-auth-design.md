# Google authentication and admin access

Approved direction: Google login, allowlisted admin accounts, ADMIN/SUPER_ADMIN
roles, and a fixed **24-hour** application session. The project owner is the first
super admin and supplies their email privately during local setup. Organization
handover happens by adding a successor, verifying their Google login, promoting
them, then reducing or disabling the outgoing account. There is no public signup.

Use Google's maintained Node.js authentication library for authorization-code flow
with PKCE, state, nonce, and verified ID tokens. Request only openid/email/profile;
do not request Drive/Calendar access or persist Google access/refresh tokens.
Bind an invitation once to Google's stable subject. Subsequent login uses that
subject, not email matching. Initial email linking requires Google-authoritative
verified Gmail or Workspace email. Other Google account email types require a
separate deliberate identity-verification design, rather than automatic linking.

Sessions use random opaque cookies, server-side hashed tokens, strict expiry
checks, and HttpOnly/SameSite=Lax/Secure-in-production attributes. No sliding
extension. Per-session CSRF tokens plus exact configured-origin checks protect
mutations. Account deactivation, role changes, and logout revoke appropriate
sessions. OAuth attempts expire in ten minutes and are consumed once. Login
attempt limiting is shared in MongoDB; forwarded IP headers are not trusted.

Account mutations, bootstrap, identity binding, and session issuance use MongoDB
transactions. A shared access-control revision document serializes these writes
to prevent concurrent demotions from removing all super admins or creating a
session during revocation. This requires Atlas or a transaction-capable local
replica set; a standalone MongoDB server is insufficient. Reads verify session
expiry, current account status, and current role, regardless of TTL cleanup timing.

Keep indexes/provisioning explicit via a setup command. Bootstrap can create the
initial super-admin invitation only once. Later promotions require a linked,
active account that has actually logged in. Preserve at least one linked active
super admin after any update; bootstrap is a one-time exception until first login.
Do not permit identity/email reassignment through the account update endpoint.
Audit setup, login/logout, account creation, and access changes without secrets.

Routes: GET /api/auth/login, GET /api/auth/callback/google, GET /api/auth/me,
POST /api/auth/logout, GET/POST /api/admin/accounts,
PATCH /api/admin/accounts/{id}. All other admin adapters enforce sessions and
CSRF before their existing 501 response. Public domain logic remains reserved;
Apps Script credentials remain independent of website sessions.

Google setup needs APP_ORIGIN, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and an exact
registered callback URL. The CLI reads BOOTSTRAP_SUPER_ADMIN_EMAIL from local env;
it must never invent or commit the owner's address. Callback success redirects
to /api/auth/me until a frontend admin page exists. Production requires HTTPS.

Commit features separately: identity/provisioning; OAuth/session lifecycle;
role/account management; Postman/OpenAPI workflow tests and handover documentation.
Tests use an isolated temporary MongoDB replica set and injected Google responses.
No mock login route or authentication bypass is enabled in the application.
Real Google consent/login is a manual browser check requiring configured OAuth;
Postman uses a real local session afterward. No production setup is claimed.

References:
- https://developers.google.com/identity/openid-connect/openid-connect
- https://googleapis.dev/nodejs/google-auth-library/latest/
- https://www.mongodb.com/docs/drivers/node/current/crud/transactions/
- https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
