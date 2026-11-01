# Postman development kit

Import both files into Postman:

1. `KMITS.postman_collection.json`
2. `Local.postman_environment.json`

Select **KM ITS - Local Foundation**, start the application with root `pnpm dev`,
then run the collection. It contains 33 operation probes and five integration
guard cases. The default environment expects no working database and disabled
ingestion. A passing collection verifies the foundation, not business features.

| Variable | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | Running Next.js host, with no trailing slash |
| `recordId` | Example 24-character ID | Placeholder while detail routes are reserved |
| `readyExpectedStatus` | `503` | Set `200` only when MongoDB is configured and reachable |
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
OpenAPI describes foundation responses and marks reserved operations explicitly;
it does not promise draft domain behavior. Admin access is recorded as intent,
because a working session protocol has not been implemented yet.

For each implemented feature, add happy-path and failure-path tests for actual
behavior (for example stale Archive approvals must fail with `409`). A retained
`501` expectation must never count as proof that a feature works.

See [Postman's Newman guide](https://learning.postman.com/docs/collections/using-newman-cli/installing-running-newman)
for collection execution with an environment.
