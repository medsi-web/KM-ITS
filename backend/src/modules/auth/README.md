# Google admin access

Approved settings: Google login, **fixed 24-hour sessions**, and an explicit admin
allowlist. The project owner supplies the first super-admin email privately and
can later transfer control to an organization account. No local passwords,
public signup, default administrator, or HTTP test-login bypass exists.

## Setup

1. Configure Atlas or a local MongoDB **replica set**. Transactions are required
   for provisioning, identity binding, session issuance, and account mutations.
   A standalone server may pass `/api/ready` but cannot perform those operations.
2. Copy `frontend/.env.example` to `frontend/.env.local` if you have not already
   created it. Never overwrite an existing local environment file blindly.
3. Set `MONGODB_URI`, `MONGODB_DATABASE`, and `APP_ORIGIN`. Local example:
   `APP_ORIGIN=http://localhost:3000`. Remote deployments require HTTPS. The origin
   contains no path or query. Restart the app after configuration changes.
4. Create a Google OAuth client of type **Web application** in a project controlled
   by BEM ITS. Configure its consent/audience settings and test users if applicable.
   Set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` locally. Register the exact
   callback: `http://localhost:3000/api/auth/callback/google` for that local origin,
   and the corresponding HTTPS callback for production. Ports and hosts matter;
   `localhost` and `127.0.0.1` are different origins.
5. Set `BOOTSTRAP_SUPER_ADMIN_EMAIL` to your own Google email locally, then run
   `pnpm auth:bootstrap` from the repository root. It creates indexes, a control
   record, and one unlinked SUPER_ADMIN invitation. It does not log anyone in.
   Bootstrap is one-time and cannot add later super admins or replace the owner.
   Remove the bootstrap email from local env afterward. `pnpm auth:setup` safely
   prepares/rechecks indexes without creating an account.
6. Run `pnpm dev`, then open `/api/auth/login` **in a browser**. After successful
   authorization, the backend redirects to `/api/auth/me` until an admin UI exists.
   The returned data includes the account, expiry, and session-bound `csrfToken`.

No actual Google credentials, admin emails, or live database were provisioned by
the implementation. Setup commands read `frontend/.env.local`; they do not create
or rewrite that file. OS environment variables take precedence. MongoDB server
setup and Google Console setup remain operator tasks.

## Identity and permissions

- ADMIN can access the future content-management workflows. Their business logic
  is still reserved and returns `501` after access checks.
- SUPER_ADMIN additionally lists, creates, and updates accounts.
- `POST /api/admin/accounts` accepts only `{ "email": "...", "name": "..." }`.
  It creates an active **ADMIN invitation**, not a Google account or an email.
  No invitation mail is sent.
- `PATCH /api/admin/accounts/{id}` accepts any nonempty subset of `name`, `active`,
  and `role` (`ADMIN` or `SUPER_ADMIN`). IDs are UUIDs. Email and Google identity
  cannot be reassigned through this endpoint.
- `GET /api/admin/accounts?limit=50&offset=0` supports limit 1–100 and offset
  0–10000. Account responses omit Google subjects and internal session versions.
- Initial linking requires a verified Google-authoritative Gmail or Workspace
  email matching an invitation. Names do not authorize access. Google accounts
  using other email providers need a separate identity-verification policy and
  currently cannot link automatically. Do not assume every ITS address is hosted
  by Google; verify the actual account.
- Once linked, `(Google, sub)` identifies the account. A changed Google email does
  not reassign it or automatically update its invited email. A different subject
  cannot claim an already-linked invitation even with the same email string.

## Session and request rules

The website requests only `openid email profile`. Google code exchange and ID
token verification use Google's Node.js library, with PKCE, nonce, state, issuer,
audience, and expiry checks. The app does not persist Google access/refresh tokens
or obtain Drive/Calendar permissions from admin login. Apps Script bearer secrets
are independent and never grant website admin access.

The cookie is `kmits_session` for HTTP localhost and `__Host-kmits_session` for
HTTPS. It is HttpOnly, SameSite=Lax, Path=/, without Domain; HTTPS adds Secure.
Its value is random and opaque; MongoDB stores only its SHA-256 hash. Expiry is
24 hours after issuance and is checked on every request, independently of MongoDB
TTL cleanup. Reading a session does not extend it. Logging in again rotates the
current browser session; other device sessions remain until expiry/revocation.

Every authenticated mutation requires the cookie plus:

```http
Origin: http://localhost:3000
X-CSRF-Token: <csrfToken from GET /api/auth/me>
Content-Type: application/json
```

Origin must exactly match APP_ORIGIN. Logout ends the current website session;
it does not sign the user out of Google. Status or role changes revoke **all**
sessions for the affected account. A caller changing their own access must log
in again afterward. Disabled users cannot create new sessions.

OAuth attempts last ten minutes, require the initiating browser's temporary
cookie, and are consumed once. A failed exchange requires a fresh attempt.
Login is limited to 10 starts per browser and 120 starts globally per ten-minute
window in MongoDB. Proxy-supplied IP headers are not trusted. Configure additional
edge rate limiting if deployment traffic needs it. Never log OAuth callback query
strings, cookies, authorization headers, or Google tokens in proxy/access logs.

Transactions write a shared revision document before checking permissions and
applying account/session changes. This serializes security mutations and prevents
two concurrent demotions from deleting every super admin. Session versions prevent
access through stale sessions. Audit entries record bootstrap, identity linking,
successful login/logout, account creation, and account changes without tokens.
Set an operational retention/backup policy for audit history before deployment.

## Cabinet handover

1. The outgoing super admin invites the organization's selected Google email.
2. The organization signs in as ADMIN, completing identity binding.
3. The outgoing super admin promotes that linked active account to SUPER_ADMIN.
   Promotion revokes its existing sessions, so the organization signs in again.
4. Verify the organization can list/manage accounts using its new session.
5. The organization demotes or disables the outgoing account, revoking its sessions.
   Removing the final active, linked super admin returns `409 LAST_SUPER_ADMIN`.
6. Transfer OAuth project management, database/server access, deployment secrets,
   backups, and this guide through an appropriate private handover process.

A website role does not transfer ownership of the Google Cloud project, source
Drive folders, or server. Account recovery when all authorized Google identities
are inaccessible requires an operator-reviewed database recovery procedure; there
is no public reset endpoint or automatic bootstrap reset.

## Tests

```powershell
pnpm test
pnpm test:integration
pnpm build
pnpm test:http
```

Integration tests create and stop their own temporary MongoDB replica set. The
first run downloads a MongoDB binary to the test library's cache (it can be large
on Windows); no repository database is reused or deleted. Package postinstall
downloads are disabled; the explicit test command performs the runtime download.

`test:http` starts a temporary Next.js production server from the preceding build,
seeds isolated identities through backend services in its own process, then runs
the anonymous and authenticated Postman collections over real HTTP. No fixture
credential or test route is exposed by the application. This proves application
session/role behavior, not a live Google consent flow. Verify Google login in a
browser after configuring your actual client.

References: [Google OIDC](https://developers.google.com/identity/openid-connect/openid-connect),
[Google OAuth web setup](https://developers.google.com/identity/protocols/oauth2/web-server),
[MongoDB transactions](https://www.mongodb.com/docs/drivers/node/current/crud/transactions/).
