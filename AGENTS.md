<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
## Repository layout

- `frontend/` is the single runnable Next.js application. Read its installed Next.js guides before changing framework code.
- `backend/` is the server-only `@kmits/backend` workspace package, not a separate HTTP service.
- Keep domain rules, database access, and integrations in `backend/src`. Next.js route adapters belong in `frontend/src/app/api`.
- Client Components must never import `@kmits/backend` or reach its files through relative paths.
- `design/` holds design source assets; `docs/` holds project specifications.
- Use root `pnpm dev`, `pnpm build`, `pnpm lint`, and `pnpm typecheck` commands.

## Local knowledge graph

- For architecture and dependency questions, use `graphify-out/graph.json` first when it exists and matches current sources. Follow the graphify skill for queries and updates.
- Graphify results and caches are local and ignored by Git. `.graphifyignore` includes local `docs/` references while excluding dependencies, build output, secrets, and binary assets.
- The graph must distinguish implemented code from planned behavior in specifications. Refresh affected extractions after source or specification changes; do not treat a stale graph as current evidence.
- Graphify is an optional development tool, not an application dependency or a required build step.
- For Graphify 0.9.48 detection, register `.mmd` in `graphify.detect.DOC_EXTENSIONS` for the current Python process so the local Mermaid reference files are indexed as documents too.
