# KM ITS backend foundation

This workspace owns server logic. The runnable HTTP host is the existing Next.js
app in `frontend/`. It is one application, not a second backend server.

## Local development

Requires Node.js 24+ and the pnpm version declared in the root package manifest.
Run these from the repository root:

```powershell
pnpm install
Copy-Item frontend/.env.example frontend/.env.local
pnpm dev
```

Start your own MongoDB instance at the configured URI, or use an Atlas URI. No
database server, user, collection, or seed account is provisioned by this kit.
Keep credentials only in the ignored `frontend/.env.local`. Restart the app after
changing environment values. `backend/.env` is not loaded by the HTTP host.

```powershell
pnpm test
pnpm lint
pnpm typecheck
pnpm build
```

Import the collection and local environment from [postman/](postman/README.md).
`pnpm test:api` runs it against a running server. `pnpm api:check` verifies the
generated Postman/OpenAPI files match the operation inventory; regenerate them
with `pnpm api:generate`. [openapi.json](openapi.json) describes the foundation's
current HTTP behavior and marks future feature operations as reserved.

## Scope and response behavior

The contract inventory has **33 HTTP operations on 30 paths**, including two
implemented system operations:

- `GET /api/health`: liveness, `200`, independent of MongoDB.
- `GET /api/ready`: database ping, `200` if reachable; `503` if missing,
  misconfigured, or unavailable. It does not certify domain feature readiness.
- Auth, admin accounts, Archive, Articles, Timeline, and sync logs: reserved
  adapters return `501 FEATURE_NOT_IMPLEMENTED`. They do not authenticate admin
  sessions, return sample content, or write application data.
- Three internal sync adapters: require a configured 32+ character
  `APPS_SCRIPT_INGESTION_SECRET` and `Authorization: Bearer <secret>`. Missing/short
  configuration returns `503`; invalid credentials return `401`. Authenticated
  requests must contain a JSON object no larger than 256 KiB. Malformed transport
  returns `400`, `413`, or `415`. Valid transport still returns `501`: **nothing is
  accepted, queued, synchronized, or saved yet**. `{}` is only a transport probe,
  not a future domain payload contract. Production transport requires HTTPS.

All responses produced by backend handlers use `success`, `data` or `error`, and
`meta: { requestId, timestamp }`, with `X-Request-Id` and `Cache-Control: no-store`.
Framework-generated errors (for example unknown paths or unsupported methods)
may use the default Next.js response instead. The eventual Archive open operation
will have redirect/404 behavior; its current response is a reserved `501` only.

No authorization bypass or test administrator exists. Before enabling domain
operations, implement admin sessions, role checks, request-forgery protection,
credential storage, login throttling, and the first super-admin provisioning flow.
Shared-secret transport alone does not implement delivery ordering, idempotency,
replay handling, or per-source authorization; these belong to the ingestion work.

## Ownership

```text
backend/src/
  contracts/endpoints.ts   Operation inventory and current access intentions
  integrations/           Apps Script transport authentication
  lib/                    HTTP responses, errors, bounded JSON input, MongoDB pool
  modules/
    system/               Implemented liveness/readiness
    auth/ accounts/       Reserved admin session/account operations
    archives/             Reserved Drive document operations
    articles/             Reserved Form/Sheet content operations
    events/               Reserved Google Calendar operations
    sync/                 Reserved source ingestion and synchronization logs
backend/tests/            Native Node.js tests
frontend/src/app/api/     Thin route adapters; no domain logic
```

Only server code may import `@kmits/backend`; its entry point uses `server-only`.
Domain modules can grow services, repositories, schemas, and tests when their
behavior is implemented. Avoid empty abstractions or provider layers in advance.
The MongoDB client connects lazily and reuses a process-level connection pool.
Database/credential errors do not expose raw exception messages or secrets.

## Development order

1. Authentication and ADMIN/SUPER_ADMIN authorization; first-admin setup.
2. Ingestion envelopes, source allowlists, validation, receipt timestamps,
   delivery identity, ordering, idempotency, audit records, and database indexes.
3. Archive lifecycle and review concurrency from `docs/archive.md`.
4. Article ingestion, editing, publishing, and public reads.
5. Calendar synchronization, visibility, time-derived lifecycle, public reads.
6. Apps Script connectors, real Google permissions/configuration, and recovery tests.

Implement one coherent feature and commit it separately. Extend the Postman tests
to assert that feature's real behavior instead of continuing to expect `501`.
No Apps Script project or Google resource is created by this foundation.

Archive uses one mutable metadata source identity, immutable review snapshots,
and distinct PDF IDs. An approved old version remains active during a valid
replacement review. No publication delay is added. The newer Archive specification
overrides older Form/Sheet Archive assumptions in the architecture review.
API JSON routes use `/api/archives`; future `/archive` pages are a separate UI layer.
Timeline visibility controls and the exact article schema are still draft contracts.

## Technical references

- Next.js: installed `frontend/node_modules/next/dist/docs/` route handlers and
  environment guides are the reference for the pinned framework version.
- [MongoDB connection pools](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/connection-pools/)
  and [connection options](https://www.mongodb.com/docs/drivers/node/current/connect/connection-options/).
