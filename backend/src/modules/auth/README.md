# Admin authentication

Admin authentication uses local, case-insensitive usernames and Argon2id password hashes. Usernames contain 3-64 ASCII letters, numbers, dots, underscores or hyphens and start with a letter or number. There is no password policy: any non-empty password is accepted (owner decision). Argon2id uses 19 MiB memory, two iterations and one lane. Plain passwords and session tokens never enter the database or audit log.

Set APP_ORIGIN to the exact website origin. Run `pnpm --filter @kmits/backend auth:setup` against a MongoDB replica set. For a fresh database set `auth.bootstrapSuperAdminUsername` in `kmits.config.json` (or BOOTSTRAP_SUPER_ADMIN_USERNAME), run `pnpm auth:hash` to turn your password into an Argon2id hash, put the printed BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH line in the environment, and run `pnpm --filter @kmits/backend auth:bootstrap`. Bootstrap refuses plaintext passwords and hashes weaker than the login cost (m=19456, t=2). There are no default credentials. Remove bootstrap credentials from the environment after provisioning. Bootstrap is serialized and refuses a nonempty account store.

POST /api/auth/login accepts `{username,password}` with Content-Type application/json and the exact Origin header. Unknown usernames, incorrect passwords and temporary lockout all return the same 401 error. Shared MongoDB limits allow 10 attempts per normalized username, 20 per browser cookie and 120 globally in a ten-minute window. Windows expire independently of delayed TTL cleanup. Browser-cookie removal cannot bypass the username and global limits. The browser cookie is set on failed attempts too.

GET /api/auth/me returns the current account, fixed session expiry and CSRF token. POST /api/auth/logout and POST /api/auth/password require the exact Origin and X-CSRF-Token. Password change accepts `{oldPassword,newPassword}`, revokes every session and clears the cookie; the user must log in again. Session cookies last 24 hours, use HttpOnly and SameSite=Lax, and use Secure and the __Host- prefix on HTTPS. Only token hashes are persisted. Each login rotates the presented session.

A super admin creates an account using `{username,name,role?}`. The default role is ADMIN. Creation returns `{account,temporaryPassword}`. POST /api/admin/accounts/{id}/reset-password resets another account and returns the same shape. The cryptographically random password appears only in that response and cannot be retrieved later. Both operations require CSRF. Sessions using a temporary password can access only me, password and logout; all regular server guards and transaction actor checks reject them. A newly created SUPER_ADMIN cannot manage anything until changing its temporary password. Promotion and removal of the last super admin require an active successor with a permanent password.

The shared access transaction fence serializes login issuance, password change, reset, role change and deactivation. Password verification happens before the transaction, then the exact hash and authVersion are checked under the fence. This prevents an old password verified concurrently with a reset from issuing a usable session after the reset. All access changes revoke existing sessions.

## Cabinet handover

When the cabinet changes, the outgoing super admin transfers access without sharing personal credentials:

1. Create the successor account with `POST /api/admin/accounts` and `{username,name}`.
2. Send the one-time temporary password to the successor through a private channel.
3. The successor signs in, changes the temporary password with `POST /api/auth/password`, then signs in again.
4. Promote the successor with `PATCH /api/admin/accounts/{id}` and `{role:"SUPER_ADMIN"}`. Promotion returns `409 SUCCESSOR_NOT_READY` until the successor is active and has a permanent password.
5. The outgoing super admin deactivates their own account with `PATCH /api/admin/accounts/{id}` and `{active:false}`. Removing the last ready super admin returns `409 LAST_SUPER_ADMIN`, so the system always keeps one usable super admin.
6. Deactivation revokes every session of the outgoing account. Deactivate or reset outgoing ADMIN accounts the same way.

Record the handover date and the new super admin username in the cabinet knowledge-transfer notes. Never write passwords in those notes.

## Migrating an existing installation

Legacy accounts and legacy sessions fail closed. Setup refuses obsolete identity indexes or unmigrated records; it never drops data. Do not run old and new application versions together. Stop all application instances and take a verified database backup before migration. Retain that backup for rollback; restoring it requires reverting the application version and rotating/revoking all old sessions before reopening access.

Create a private JSON file outside source control mapping every existing account ID exactly once, for example `[{"id":"existing-uuid","username":"chosen.username","password":"a privately chosen password"}]`. Choose and verify usernames with the account owners. Do not derive them automatically from email addresses. Every unmigrated account needs a non-empty password. Already migrated rows may omit password; a retry with the same mapping never replaces an existing credential. Distribute initial passwords through a private channel and remove the mapping file securely after successful verification.

With application instances stopped, run from backend: `node --env-file-if-exists=../frontend/.env.local scripts/migrate-auth.mjs --mapping=<private-file> --confirm-index-migration`. The command validates complete ID coverage and unique normalized usernames, creates the username index, migrates credentials and revokes sessions in one transaction. IDs, roles, names, creation history and audit records remain intact. Legacy identity fields remain stored for operator history but are never accepted or exposed by authentication APIs. All migrated accounts must change their temporary password before admin access.

The explicit confirmation permits removing only obsolete unique email/googleSub indexes after credential migration. No collection or account is dropped. DDL follows the transaction; if interrupted, rerun the identical mapping to finish indexes safely. The script adds one audit entry per migrated account and a schema audit entry once. Existing OAuth-attempt collections are inert and left untouched. Verify migration success and sign in as a super admin, change its password, then sign in again before reopening the application. Remove obsolete OAuth configuration from the deployment environment. Do not roll back to OAuth with the migrated database; use the verified backup under maintenance instead.
