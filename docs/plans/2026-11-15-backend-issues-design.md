# Backend issue implementation: #10–#13

The user approved all backend tasks in GitHub issues 10 through 13 on 2026-11-15,
including parallel implementation and Postman testing. These issue requirements
replace the previous Google-login and Archive-approval decisions. No Apps Script
project, scanner, source folder, sharing permission, frontend page, or live
database is changed by this work.

## Ownership and integration

- #10: local username/password authentication, credential lifecycle, safe legacy
  migration, bootstrap, and account-role invariants. Preserve 24-hour sessions,
  HttpOnly cookies, CSRF, transactional revocation, audit, and final-super-admin
  protection. Temporary passwords permit only me/password/logout until changed.
- #11: registered server source scopes, strict observation envelope, atomic
  auto-publication, ordering/idempotency/conflicts, and per-attempt synchronization
  logs. One metadata Drive ID owns one document. No candidates or approvals.
- #12: authenticated administrative monitoring and audited manual hide/unhide.
  Synchronization must preserve manual hides. Invalid sources stay hidden after
  unhide. Remove approval/rejection routes and generated contracts.
- #13: public list/detail use visible current snapshots; opening verifies Drive
  identity, source scope, PDF hash, and anonymous readability before a no-store
  temporary redirect. Missing or file-specific access failures return 404;
  provider/auth/quota/configuration failures return 503 without changing source
  state. Recheck record generation after network validation.

Backend domain services stay under backend/src. Only HTTP route adapters under
frontend/src/app/api change; frontend UI and knowledge-group mock data stay owned
by the frontend team. Initial public query contract is pagination only; group,
search, category/year/ministry filters remain deferred pending frontend agreement.

## Server configuration

The auth database uses a replica set/Atlas and explicit setup. No schema reset or
account defaults. Legacy migration is an explicit operator command preserving IDs,
roles, audit/history, and revoking sessions; old unique identity indexes may only
be removed after replacement credentials/index validation. No automatic data drop.

Source registration uses ARCHIVE_SOURCE_CONFIG as a JSON array of
{streamId,ministryId,folderId}. Unregistered streams or folder mismatches fail
closed. Clients cannot choose the ministry through document metadata.

For the Drive reader, implement a server-only service-account read adapter and an
anonymous API-key check. Deployers later supply DRIVE_SERVICE_ACCOUNT_EMAIL,
DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY, and DRIVE_PUBLIC_API_KEY and grant the reader
only the relevant source folders. No credentials are committed and no real Google
configuration is assumed. No-login readability is established without a reader
Authorization header. Integration tests inject provider responses into services;
the production application has no HTTP test bypass or mock-success mode.

## Verification and completion

Each feature has its own commit and meaningful unit/integration tests. Integration
tests use disposable MongoDB replica sets. Postman/Newman collections cover actual
HTTP username login, temporary password restrictions, password changes/reset,
revocation, automatic publication, duplicate/stale/conflicting observations,
manual hides/recovery, and public visibility. Provider tests cover missing files,
wrong scope/hash, anonymous access denial, 429/401/5xx, and concurrent source change.
Finish with pnpm test, pnpm test:integration, pnpm api:check, pnpm lint,
pnpm typecheck, pnpm build, and pnpm test:http. Refresh the ignored local graph.
GitHub issue closure/push/deployment is not implied by local implementation.

References: https://github.com/medsi-web/KM-ITS/issues/10,
https://github.com/medsi-web/KM-ITS/issues/11,
https://github.com/medsi-web/KM-ITS/issues/12,
https://github.com/medsi-web/KM-ITS/issues/13.

## Execution constraint update

On 2026-11-15 the user requested implementation only: do not run tests, lint, typechecks, builds, verification commands, or make commits for the resumed work. Test fixtures and Postman artifacts may be prepared but their execution remains pending. Do not treat authored test coverage as passing verification. The ignored knowledge graph is marked stale until a later refresh.
