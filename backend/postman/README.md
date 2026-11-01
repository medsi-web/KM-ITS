# Postman development kit

Import both files into Postman:

1. `KMITS.postman_collection.json`
2. `Local.postman_environment.json`

Select **KM ITS - Local Foundation**, start the application with root `pnpm dev`,
then run the collection. It contains 34 anonymous operation probes and five integration
guard cases. The default environment expects no working database and disabled
ingestion. Cookie jars and redirects are disabled: protected routes must reject
anonymous access with 401. A passing collection does not prove reserved features work.

| Variable | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | Running Next.js host, with no trailing slash |
| `recordId` | Example 24-character ID | Placeholder while detail routes are reserved |
| `readyExpectedStatus` | `503` | Set `200` only when MongoDB is configured and reachable |
| `loginExpectedStatus` | `503` | Set `302` when Google configuration and auth storage are ready |
| `callbackExpectedStatus` | `503` | Set `400` when auth is ready; this probe intentionally has no OAuth state |
| `integrationConfigured` | `false` | Set `true` when the running server has a valid 32+ character ingestion secret |
| `ingestionSecret` | Empty | Matching server secret; keep it local and never commit exported credentials |

The three internal sync probes send `{}` intentionally. This only exercises JSON
transport and credential checks: it does not represent a valid future Archive,
Article, or Calendar payload. With ingestion disabled, all eight integration
requests expect `503 INTEGRATION_NOT_CONFIGURED`. With a configured server and a
matching local secret, the main probes expect `501`, while the guard cases expect
`401`, `400`, or `415`. These tests do not send data to Google.

The collection also checks JSON envelopes, request IDs, timestamps, error codes,
and no-store headers. Native unit tests additionally cover the payload byte limit,
database configuration failure, secret handling, and unexpected-error sanitization.
Unsupported HTTP methods and unknown Next.js routes are outside the shared JSON
envelope contract.

## Command-line runner

The same collection runs locally using Newman; no Postman account or cloud upload
is required. Keep the server running in another terminal:

```powershell
pnpm test:api
```

For another port:

```powershell
pnpm test:api --env-var baseUrl=http://localhost:3100
```

Use Postman's local environment editor for credentials. Avoid putting real
secrets directly in terminal arguments/history or committing exported environment
files. The supplied checked-in environment must keep `ingestionSecret` empty.

## Updating the kit

`backend/src/contracts/endpoints.ts` is the operation inventory. The generator
produces the checked-in collection, empty local environment, and `backend/openapi.json`:

```powershell
pnpm api:generate
pnpm api:check
```

Edit `backend/scripts/generate-api-kit.mjs` when feature request schemas, responses,
or real workflow assertions change. Do not hand-edit generated JSON. Current
OpenAPI describes current responses and marks reserved operations explicitly.
Google login, 24-hour sessions, and account management are implemented. Both
anonymous and authenticated requests to unfinished domain features are tested.

For each implemented feature, add happy-path and failure-path tests for actual
behavior (for example stale Archive approvals must fail with `409`). A retained
`501` expectation must never count as proof that a feature works.

See [Postman's Newman guide](https://learning.postman.com/docs/collections/using-newman-cli/installing-running-newman)
for collection execution with an environment.

## Authenticated local workflow

Import `Auth.postman_collection.json` separately. This is an **eight-request,
state-changing localhost workflow**: it creates a test invitation, checks CSRF
and promotion restrictions, disables the invitation, and logs out your session.
Use a local test database. Run requests in order with Stop on error enabled.

1. Complete the [Google/admin setup](../src/modules/auth/README.md), then sign in
   at `http://localhost:3000/api/auth/login` in a browser. Google password, consent,
   and multi-factor authentication remain interactive browser steps.
2. Set `sessionCookie` in Postman's **local** environment to the website cookie
   header pair, `kmits_session=<value>` for HTTP localhost. Obtain it from your
   local browser's cookie storage. Do not paste it in chat, commit it, or sync it
   to a shared/cloud environment. The API does not return raw session tokens.
3. Set `inviteEmail` to a fresh disposable test invitation email. No mail is sent
   and no Google account is created. Leave `csrfToken` empty initially.
4. Run the collection. `/api/auth/me` captures the CSRF token; mutations send it
   with exact `Origin: {{baseUrl}}`. The final requests log out and prove that the
   old cookie is rejected. Sign in again afterward for further manual testing.

Automatic cookie handling is disabled; the workflow uses the explicit local
Cookie header. See [Postman cookie settings](https://learning.postman.com/docs/use/send-requests/response-data/cookies).
`pnpm test:auth` runs the same workflow through Newman. Use an ignored local
environment export for credentials rather than command-line arguments containing
real sessions. The checked-in environment intentionally cannot authenticate.

## Fully isolated HTTP test

```powershell
pnpm build
pnpm test:http
```

The runner creates its own temporary MongoDB replica set and Next.js production
server, seeds identities through services inside the runner process, executes
39 anonymous probes plus eight authenticated requests over real HTTP, then stops
its processes. It does not use your database, call Google, or expose an HTTP
login bypass. A real Google callback remains a manual check after setup.

`pnpm test:integration` also tests expiry, concurrent bootstrap, stable identity,
revocation, handover, and concurrent cross-demotions using real MongoDB transactions.
The first run may download a large MongoDB binary to the local test-library cache.
`pnpm test` parses every generated Postman script before it reaches a server.
