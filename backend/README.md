# KM ITS backend

This server-only workspace owns domain logic and persistence. The existing
Next.js application in `frontend/` is its single HTTP host. Frontend pages remain
untouched; the API implementation adds no admin, Archive, Timeline or Article UI.

## Implemented scope

The inventory contains **33 HTTP operations, all implemented**.

- System liveness and MongoDB readiness.
- Local username/password login, session inspection, logout and password change.
- Super-admin account listing, creation, changes and temporary password reset.
- Archive ingestion, admin list/detail, manual hide/unhide, public reads and verified PDF open redirects.
- Timeline: Google Calendar event batch sync, public list/detail with window and
  status filters, admin list/detail and manual hiding.
- Articles: Google Form submission batch sync, admin review queue, draft editing,
  revision-checked publish and unpublish, public list/detail.
- Sync logs for archives, events and articles through one admin endpoint.

No Apps Script connector is implemented. Readiness checks database connectivity;
it does not certify indexes, registered sources or Google permissions.

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
pnpm timeline:setup
pnpm articles:setup
pnpm dev
```

`pnpm timeline:setup` needs `EVENT_CALENDAR_ID` and `pnpm articles:setup` needs
`ARTICLE_FORM_ID`; both exit with a `*_NOT_CONFIGURED` code until set. Until a
feature's setup has run, its routes return `503 *_NOT_INITIALIZED`.
`pnpm archives:setup` exits with `ARCHIVE_SOURCES_NOT_CONFIGURED` until
`ARCHIVE_SOURCE_CONFIG` lists at least one registered folder. This is intended:
Archive ingestion fails closed without source registrations.

Remove bootstrap credentials after provisioning. There is no default account or
authorization bypass. For existing installations, follow the full
[authentication and migration guide](src/modules/auth/README.md) before invoking
`pnpm auth:migrate` with its mapping and explicit migration confirmation. Stop
application instances and retain a verified backup as that guide describes.
Restart the host after environment changes.

## Local database (Docker)

Development runs MongoDB 8.0 in Docker and Next.js on the host with `pnpm dev`.
The root `compose.yaml` starts a single-node replica set `rs0`, which backend
transactions require. The port is bound to `127.0.0.1:27017` only, and this
development database has no password. Do not reuse this configuration for a
deployed server: production needs MongoDB authentication, a replica-set
keyfile and scheduled backups.

```powershell
pnpm db:up      # start and wait until the node is PRIMARY
pnpm db:logs    # follow MongoDB logs
pnpm db:down    # stop; data is kept in the kmits_mongo-data volume
```

Use this URI in `frontend/.env.local`:

```text
MONGODB_URI=mongodb://127.0.0.1:27017/?directConnection=true
MONGODB_DATABASE=kmits
```

The replica-set member is registered as `mongo:27017` inside Docker.
`directConnection=true` lets host clients connect without resolving that name.
A future app container uses `mongodb://mongo:27017/?directConnection=true`.

To delete all local data, run `docker compose down -v`. This permanently removes
the volume, including accounts and Archive records; rerun the setup commands
afterwards. If port 27017 is already used by another MongoDB, stop that service
or change the host port in `compose.yaml` and the URI together.

If MongoDB stops while the server runs, API routes return
`503 DATABASE_UNAVAILABLE` and `/api/ready` returns 503. They recover after
`pnpm db:up` without restarting Next.js.

Verified on 2026-11-16 against the Docker database (MongoDB 8.0.38) with a
production build on `http://localhost:3000` and disposable databases:
replica-set primary, setup and bootstrap, health/ready, Newman `KMITS` (33
requests), `Auth` (33), `Timeline` (20), `Articles` (23) and `Archive` (15),
data persistence across a container restart, 503 while the database is stopped,
and recovery after restart.

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

## Timeline

Specified in [docs/timeline.md](../docs/timeline.md). One shared Google Calendar
is registered through `EVENT_CALENDAR_ID`. `POST /api/internal/sync/events`
accepts batches of events; each event is committed separately and ordered by its
Calendar `updated` timestamp, so retries are safe and older copies are stale.
Cancelled events keep their last content but leave the public Timeline.
`UPCOMING`, `ONGOING` and `FINISHED` are derived at request time. Admins hide or
show an event with `PATCH /api/admin/events/{id}`; hiding survives source updates.

## Articles

Specified in [docs/articles.md](../docs/articles.md). One Google Form is
registered through `ARTICLE_FORM_ID`. Submissions arrive unpublished and keep
three versions: source, draft and published. Source updates refresh an unedited
draft or flag an edited one, and never change the published copy. Admins edit the
draft, reset it to the source, publish and unpublish. PATCH and publish require
the current draft `revision` and return `409 ARTICLE_CHANGED` otherwise, so the
published content is exactly what the admin reviewed.

## Configuration

All settings live in `frontend/.env.local`; `frontend/.env.example` lists them
with comments. Restart the server after changing any value. Optional numeric
settings use the default when empty; an invalid value makes the affected routes
return `503 CONFIGURATION_INVALID` naming the setting, never a silent fallback.

| Setting | Default | Range | Purpose |
|---|---|---|---|
| `MONGODB_URI`, `MONGODB_DATABASE` | required | | Transaction-capable MongoDB |
| `APP_ORIGIN` | required | | Exact browser origin for login and admin mutations |
| `APPS_SCRIPT_INGESTION_SECRET` | empty (ingestion off) | 32+ characters | Bearer secret for every `/api/internal/sync/*` route |
| `API_MAX_JSON_BYTES` | 262144 | 1024–16777216 | Largest JSON request body |
| `ARCHIVE_SOURCE_CONFIG` | `[]` (Archive off) | JSON array | Registered Archive folders |
| `DRIVE_SERVICE_ACCOUNT_EMAIL`, `DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY`, `DRIVE_PUBLIC_API_KEY` | empty | | Archive PDF verification |
| `EVENT_CALENDAR_ID` | required for Timeline | | Shared Google Calendar ID |
| `EVENT_SYNC_MAX_ITEMS` | 50 | 1–500 | Events per sync request |
| `EVENT_DESCRIPTION_MAX_CHARS` | 8000 | 1–100000 | Event description length |
| `EVENT_PAGE_DEFAULT_LIMIT`, `EVENT_PAGE_MAX_LIMIT` | 50, 200 | 1–1000 | Event list page size |
| `ARTICLE_FORM_ID` | required for Articles | | Google Form ID |
| `ARTICLE_SYNC_MAX_ITEMS` | 20 | 1–500 | Submissions per sync request |
| `ARTICLE_SUMMARY_MAX_CHARS` | 1000 | 1–100000 | Article summary length |
| `ARTICLE_BODY_MAX_CHARS` | 50000 | 1–1000000 | Markdown body length |
| `ARTICLE_PAGE_DEFAULT_LIMIT`, `ARTICLE_PAGE_MAX_LIMIT` | 20, 100 | 1–1000 | Article list page size |
| `BOOTSTRAP_SUPER_ADMIN_USERNAME`, `BOOTSTRAP_SUPER_ADMIN_PASSWORD` | empty | | First super admin only; remove after bootstrap |

Raise `API_MAX_JSON_BYTES` together with `ARTICLE_BODY_MAX_CHARS` or the batch
sizes, otherwise large batches are rejected with 413. Changing a calendar or form
ID points the backend at a new source; existing records stay and keep their own
source identity.

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
bounded objects up to `API_MAX_JSON_BYTES` (default 256 KiB) and rejects invalid credentials or malformed input
before invoking domain ingestion. Use HTTPS in production.

These commands are available from the repository root; this document does not
claim that they or live setup have been run:

```powershell
pnpm test
pnpm test:integration
pnpm test:archives
pnpm test:timeline
pnpm test:articles
pnpm lint
pnpm typecheck
pnpm build
pnpm api:generate
pnpm api:check
```

[openapi.json](openapi.json) and the [Postman kit](postman/README.md) describe the
HTTP contract. `pnpm test:api` targets a running server. `pnpm test:http` runs the
isolated HTTP workflows (probes, Auth/Archive, Timeline, Articles) after a build.

Domain logic stays in `backend/src`; thin HTTP adapters stay in
`frontend/src/app/api`. Only server code imports `@kmits/backend`. The MongoDB
connection pool is reused per process. Remaining work includes the Apps Script
connectors, UI integration, slugs and search, and operator verification against
real Drive, Calendar and Form resources.
