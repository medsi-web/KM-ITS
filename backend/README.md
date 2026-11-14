# KM ITS backend

This server-only workspace owns domain logic and persistence. The existing
Next.js application in `frontend/` is its single HTTP host. Frontend pages remain
untouched; the API implementation adds no admin or Archive UI.

## Implemented scope

The inventory contains **33 HTTP operations: 19 implemented and 14 reserved**.

- System liveness and MongoDB readiness.
- Local username/password login, session inspection, logout and password change.
- Super-admin account listing, creation, changes and temporary password reset.
- Archive ingestion, admin list/detail, manual hide/unhide and sync-log reading.
- Public Archive list/detail and verified PDF open redirects.

Articles and Timeline domain operations, plus article/event ingestion, remain
`501` after applicable authentication, CSRF and transport checks. No Apps Script
connector is implemented. Readiness checks database connectivity; it does not
certify authentication indexes, registered sources or Google permissions.

## Local setup

Use Node.js 24+ and the root manifest's pnpm version. Configure a transaction-capable
MongoDB replica set or Atlas. Keep server credentials in ignored
`frontend/.env.local`; the HTTP host does not load `backend/.env`.

```powershell
pnpm install
Copy-Item frontend/.env.example frontend/.env.local
```

Set `MONGODB_URI`, `MONGODB_DATABASE`, and the exact `APP_ORIGIN`. For a fresh
installation, privately set `BOOTSTRAP_SUPER_ADMIN_USERNAME` and
`BOOTSTRAP_SUPER_ADMIN_PASSWORD`, then run:

```powershell
pnpm auth:setup
pnpm auth:bootstrap
pnpm archives:setup
pnpm dev
```

Remove bootstrap credentials after provisioning. There is no default account or
authorization bypass. For existing installations, follow the full
[authentication and migration guide](src/modules/auth/README.md) before invoking
`pnpm auth:migrate` with its mapping and explicit migration confirmation. Stop
application instances and retain a verified backup as that guide describes.
Restart the host after environment changes.

## Authentication

Admins use case-insensitive local usernames and Argon2id password hashes. Sessions
expire after 24 hours, use HttpOnly cookies, and store only token hashes. Login
requires the configured Origin; authenticated mutations additionally require the
session's `X-CSRF-Token`. Login attempts are throttled in shared MongoDB storage.

Super admins manage accounts. Creation and reset return a temporary password
once. Temporary-password sessions can access only session information, password
change and logout. Changing a password revokes sessions and requires a new login.
Role changes, deactivation and resets also revoke sessions. Transaction-time actor
checks protect mutations against concurrent access revocation. Audit records
exclude passwords and session tokens.

## Archive ingestion and visibility

Register source mappings through `ARCHIVE_SOURCE_CONFIG` as
`[{"streamId":"ministry-one","ministryId":"ministry-one","folderId":"DRIVE_FOLDER_ID"}]`.
Run `pnpm archives:setup` to create Archive indexes and validate configuration.
Archive requests fail closed with `503` until setup records the schema as ready
after creating the required uniqueness and ordering indexes.
Keep stream identities and scan-sequence namespaces stable across connector
restarts. Configure a random `APPS_SCRIPT_INGESTION_SECRET` of at least 32
characters; internal ingestion uses `Authorization: Bearer <secret>`.

Archive ingestion validates the source registration, delivery identity, sequence,
metadata and PDF observations. It tracks duplicates, stale deliveries, source
health and synchronization history. The metadata file identifies one mutable
Archive record; its PDF reference identifies the document. Valid source updates
are automatically published unless manually hidden. No approval queue or
approve/reject operation is part of Archive behavior.

Manual hiding persists across source updates. Unhiding changes only the manual
flag and never repairs an invalid or unavailable source. Admin list/detail expose
source suppression separately from manual visibility; detail includes the latest
sync log. Committed hide/unhide attempts record actor and before/after state.
Records are retained rather than hard deleted. Source loss or invalidity suppresses
public visibility until a valid observation restores it.

Public list/detail return sanitized metadata and an application open URL only for
currently visible records. List pagination supports `limit` and `offset`; search
and grouping are not implemented. Opening a document verifies its current PDF
through Drive, then redirects to the Drive viewer. Hidden or unavailable records
return `404`; temporary verification failures may return `503`.

## Drive configuration

Enable Drive API in the Google project. Configure
`DRIVE_SERVICE_ACCOUNT_EMAIL` and `DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY` for an
isolated identity shared only into registered folders as Viewer. Configure
`DRIVE_PUBLIC_API_KEY` for anonymous PDF-readability checks; an API key does not
grant file access. Restrict the key to Drive API and deployment server addresses
where possible. Keep all these values server-only and follow the environment
example for private-key formatting. Live Drive access and permissions require
operator setup; no Google resource is created automatically.

## Responses and commands

JSON handlers return `success`, `data` or `error`, and
`meta: { requestId, timestamp }`, with `X-Request-Id` and `Cache-Control: no-store`.
Archive open success returns a `302` redirect. Unknown paths and unsupported
methods may use framework-generated responses. Internal JSON transport accepts
bounded objects up to 256 KiB and rejects invalid credentials or malformed input
before invoking domain ingestion. Use HTTPS in production.

These commands are available from the repository root; this document does not
claim that they or live setup have been run:

```powershell
pnpm test
pnpm test:integration
pnpm test:archives
pnpm lint
pnpm typecheck
pnpm build
pnpm api:generate
pnpm api:check
```

[openapi.json](openapi.json) and the [Postman kit](postman/README.md) describe the
HTTP contract. `pnpm test:api` targets a running server. `pnpm test:http` runs the
isolated HTTP authentication workflow after a build.

Domain logic stays in `backend/src`; thin HTTP adapters stay in
`frontend/src/app/api`. Only server code imports `@kmits/backend`. The MongoDB
connection pool is reused per process. Remaining work includes Articles,
Timeline, external connectors, UI integration and operator verification against
real Drive resources.
