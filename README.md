# KM ITS website

A pnpm workspace with one Next.js application and a separate server-only backend
package. Both run in the same Next.js process; the backend is not a second server.

## Structure

```text
backend/
  public/              Reserved assets; not automatically served
  src/
    modules/           Domain logic, added per feature
    integrations/      External service adapters
    lib/               Database, validation, and security helpers
    index.ts           Server-only package entry
  tests/
frontend/
  public/              Public website assets
  src/
    app/               Next.js routes, pages, and layouts
      api/             Thin HTTP adapters for backend modules
    components/        UI components
    lib/               Frontend helpers
design/
  assets/              Design references and exports
docs/
  archive.md           Archive specification
```

Create feature-specific files only when implementing those features. The current
application still displays the original Next.js starter page.

## Setup and commands

Use Node.js 22.13 or newer and the pnpm version declared in the root `package.json`.
Run these commands from the repository root:

```sh
pnpm install
pnpm dev
pnpm lint
pnpm typecheck
pnpm build
pnpm start
```

`dev` and `start` run `@kmits/frontend`. `build` checks the backend package and
builds the frontend. `lint` and `typecheck` check both workspace packages.

Open <http://localhost:3000> during development. The starter currently downloads
Google Fonts at build time, so production builds require access to Google Fonts.

## Ownership boundaries

- Put business rules, database access, authentication rules, and synchronization
  logic in `backend/src`. Export server APIs deliberately from `@kmits/backend`.
- Put route adapters in `frontend/src/app/api`; they call backend services.
- Server Components can call backend services directly when appropriate.
- Client Components must not import the backend package. Its entry imports
  `server-only` to prevent accidental use from client bundles. Do not bypass the
  package entry using relative imports into backend source files.
- Keep Next.js configuration and runtime `.env` files in `frontend/`. Environment
  files remain ignored by Git. Secrets must never use a `NEXT_PUBLIC_` variable.
- Website assets belong in `frontend/public`, outside `frontend/src`.
- The existing `/docs` ignore rule is preserved. `docs/archive.md` is already
  tracked; other local working documents are not automatically added to Git.

Root configuration coordinates the workspace; application configuration lives
with the package that owns it. No additional deployment service is introduced.

## Local knowledge graph

Graphify indexes source relationships and project specifications for navigation.
Generated artifacts and extraction caches stay in `graphify-out/`, ignored by Git:

- `graph.json`: queryable graph with source evidence and relationship confidence.
- `graph.html`: interactive graph visualization.
- `GRAPH_REPORT.md`: communities, important nodes, and graph diagnostics.

With the graphify CLI installed in your Python environment, query from the repo root:

```sh
graphify query "Where are backend ownership and Archive approval defined?"
```

Use the graphify skill to create or refresh the graph after source/specification
changes, including semantic extraction of changed documents. `.graphifyignore`
deliberately re-includes local `docs/` files without changing their Git tracking.
The graph contains private local working references, so keep its outputs local.
Planned Archive behavior must remain distinguishable from implemented code.

The initial graph uses Graphify 0.9.48. For a full refresh with that version,
register `.mmd` in `graphify.detect.DOC_EXTENSIONS` before detection so Mermaid
reference files are included as documents. Do not rename the source diagrams.
Keep generated artifacts under `graphify-out/`; no graph output is committed.
