# KM ITS website

A pnpm workspace with one Next.js application in `frontend/` and a server-only
`@kmits/backend` package. Both run in the same Next.js process.

The API inventory contains **33 operations: 19 implemented and 14 reserved**.
Implemented features include system health, local username/password admin access,
account management, Archive ingestion, admin monitoring and manual visibility,
sync logs, and public Archive reads/open redirects. Articles, Timeline, and their
internal ingestion operations remain reserved and return `501` after applicable
access and transport checks. Frontend pages are maintained separately; this
backend work changes only the HTTP adapters under the frontend package.

## Structure

```text
backend/
  src/contracts/       HTTP operation inventory
  src/modules/         Domain rules, authentication, database access
  src/integrations/    Ingestion transport and Drive verification
  tests/               Unit and integration coverage
  scripts/             Setup, migration, API artifact generation
  openapi.json         API contract
  postman/             Collection and local environment
frontend/
  src/app/api/         Thin Next.js HTTP adapters
  src/app/             Pages and layouts maintained by the frontend team
  public/              Website assets
design/                Design references
docs/archive.md        Archive specification
```

## Setup

Use Node.js 24+ and the pnpm version declared in `package.json`. Commands below
are operator instructions, not evidence of completed setup or validation.

```powershell
pnpm install
Copy-Item frontend/.env.example frontend/.env.local
```

Configure a MongoDB replica set or Atlas, `APP_ORIGIN`, and private bootstrap
credentials in `frontend/.env.local`. For a fresh installation:

```powershell
pnpm auth:setup
pnpm auth:bootstrap
pnpm archives:setup
pnpm dev
```

Remove bootstrap credentials after provisioning. Existing installations must
follow the [authentication migration guide](backend/src/modules/auth/README.md)
and use `pnpm auth:migrate` with its documented mapping and confirmation arguments.
No default account exists.

Archive setup also needs registered source folders in `ARCHIVE_SOURCE_CONFIG`,
an ingestion secret, an isolated Drive service account with Viewer access only
to the registered folders, and a Drive API key for anonymous PDF-readability
checks. See [backend setup and behavior](backend/README.md). No Apps Script
connector or live Google resource is provisioned by this repository.

Open <http://localhost:3000> during development. Runtime environment files belong
in `frontend/`; secrets must never use `NEXT_PUBLIC_` names.

## Available commands

Run from the repository root when validation or deployment is intended:

```powershell
pnpm test
pnpm test:integration
pnpm test:archives
pnpm lint
pnpm typecheck
pnpm build
pnpm start
pnpm api:generate
pnpm api:check
```

`build` typechecks the backend and builds the frontend. `lint` and `typecheck`
cover both packages. `test:archives` runs the Archive Postman workflow.
`test:api` runs the [Postman collection](backend/postman/README.md) against a
running server; `test:http` runs an isolated HTTP authentication workflow after
a build.

## Ownership boundaries

Business rules, authentication, persistence, and integrations belong in
`backend/src`. HTTP adapters belong in `frontend/src/app/api`. Only server code
may import `@kmits/backend`; Client Components must not import the package or
bypass its `server-only` entry through relative paths. Website assets belong in
`frontend/public`. Root configuration coordinates the two workspace packages.

The existing `/docs` ignore rule remains; `docs/archive.md` is tracked and other
local working documents are not automatically added to Git.

## Local knowledge graph

Graphify is optional local navigation tooling. Generated graphs and caches stay
in ignored `graphify-out/` and may contain private local references. Consult the
source when graph evidence is stale, and distinguish implemented behavior from
planned specifications. Use the graphify skill for refreshes; no graph output is
committed. For Graphify 0.9.48, register `.mmd` in `graphify.detect.DOC_EXTENSIONS`
before detection so Mermaid references are included without renaming them.
