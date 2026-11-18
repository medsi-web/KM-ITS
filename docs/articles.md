# Article ingestion and publication

Contributors submit articles through one Google Form. Its responses go to a
Google Sheet, and an Apps Script connector (not part of this repository) posts
normalized submissions to the backend. A submission never becomes public on its
own: an admin reviews it and publishes it.

## Source and identity

- The form ID must equal `ARTICLE_FORM_ID` exactly. Other forms are rejected.
- An article is identified by `formId + responseId`. `responseId` is the Form
  response ID, which stays the same when the contributor edits the response.
- `submittedAt` is the response's last submitted time and orders updates.
- Titles are never used as identifiers. Slugs are not implemented; articles use UUIDs.

## HTTP protocol

`POST /api/internal/sync/articles` uses `Authorization: Bearer <ingestion secret>`; the server stores only its SHA-256 in `APPS_SCRIPT_INGESTION_SECRET_SHA256`.
The body is at most `API_MAX_JSON_BYTES` (default 256 KiB). The connector splits
large sets into several requests.

```json
{
  "protocolVersion": 1,
  "formId": "1FAIpQLSexampleFormId",
  "submissions": [
    {
      "responseId": "2_ABaOnudExampleResponse",
      "submittedAt": "2026-11-16T03:00:00.000Z",
      "submitterEmail": "contributor@example.com",
      "article": {
        "schemaVersion": 1,
        "title": "Ministry work programme",
        "summary": "Short teaser for lists.",
        "category": "News",
        "ministry": "Ministry of Education",
        "authors": ["Contributor name"],
        "coverImage": { "driveFileId": "1AbCdEfGhIjK", "alt": "Team photo" },
        "body": "## Heading\n\nMarkdown body."
      }
    }
  ]
}
```

Rules:

- `submissions` holds 1 to `ARTICLE_SYNC_MAX_ITEMS` items (default 20).
- `responseId`: 1–512 characters of `A–Z a–z 0–9 _ -`.
- `submittedAt`: ISO 8601 with `Z` or an offset.
- `submitterEmail` is optional, at most 320 characters, and visible to admins only.
- `article.schemaVersion` must be `1`. `title` (1–300) and `body`
  (1–`ARTICLE_BODY_MAX_CHARS`, default 50000) are required. `summary`
  (up to `ARTICLE_SUMMARY_MAX_CHARS`, default 1000), `category` (100) and
  `ministry` (200) default to empty strings. `authors` holds up to 30 names of
  at most 200 characters. `coverImage` is `null` or
  `{ "driveFileId": "...", "alt": "..." }` with a 1–200 character Drive ID and alt text up to 300.
- `body` is Markdown. The frontend renders it without raw HTML.
- Unknown fields are rejected.

A malformed envelope, a wrong `protocolVersion`, an unregistered form or an item
count outside the limit returns 422 and changes nothing. Items are then
processed one by one, each in its own transaction. Response `data` is
`{ receivedAt, results: [{ index, responseId, outcome, reason? }] }`.

## Ordering and outcomes

| Incoming `submittedAt` vs stored | Content | Outcome |
|---|---|---|
| No stored article | any | `applied` |
| Newer | different | `applied` |
| Newer | same | `unchanged` (watermark advances) |
| Equal | same | `unchanged` (safe retry) |
| Equal | different | `conflict` (stored state kept) |
| Older | any | `stale` |
| Item fails validation | — | `invalid` with `reason` |

## Three versions per article

| Version | Meaning |
|---|---|
| `source` | Latest content received from the Form. |
| `draft` | Content under review. Starts equal to `source`; admins may edit it. Has a `revision` number. |
| `published` | Copy of the draft taken at publish time. Only this version is public. |

When a newer source version arrives:

- `published` never changes.
- If no admin has edited the draft, the draft follows the source and its revision increases.
- If an admin has edited the draft, the draft is kept and `sourceUpdatePending` becomes `true`.

`hasUnpublishedChanges` is `true` when the draft differs from the published copy
(or nothing is published yet). Records are never deleted.

## Public API

- `GET /api/articles` lists published articles, newest first publication first.
  `limit` defaults to `ARTICLE_PAGE_DEFAULT_LIMIT` (20) and is at most
  `ARTICLE_PAGE_MAX_LIMIT` (100); `offset` is 0–10000. Other parameters return 400.
  Items omit `body`.
- `GET /api/articles/{id}` returns one published article with `body`, or 404.

Public fields: `id`, `title`, `summary`, `category`, `ministry`, `authors`,
`coverImage` (`driveFileId`, `alt`), `publishedAt` (first publication) and
`updatedAt` (latest publication). The frontend builds image URLs from
`driveFileId`. Image public access is not verified by the backend.

## Admin API

All admin routes require an admin session. Mutations also require the exact
Origin and the session CSRF token, and write an audit record with the actor.

- `GET /api/admin/articles` lists all articles, newest change first. `published=true|false`
  filters the review queue. Items show draft title, flags and revision.
- `GET /api/admin/articles/{id}` returns `source`, `draft`, `published`,
  `submitterEmail`, flags and the latest sync log entry.
- `PATCH /api/admin/articles/{id}` edits the draft:
  `{ "revision": 3, "title": "...", "body": "..." }` with any of the article
  fields. `{ "revision": 3, "resetToSource": true }` replaces the draft with the
  source and clears the edit marker and `sourceUpdatePending`. Audit: `article.edited` or `article.reset`.
- `POST /api/admin/articles/{id}/publish` with `{ "revision": 3 }` copies the draft
  to `published`. Audit: `article.published`.
- `POST /api/admin/articles/{id}/unpublish` with `{}` hides the article. The
  published copy is kept for history. Audit: `article.unpublished`.
- `GET /api/admin/sync-logs?source=articles` reads article sync logs. `responseId` filters by article.

PATCH and publish fail with `409 ARTICLE_CHANGED` when `revision` is not the
current draft revision. This guarantees that the admin publishes exactly the
draft they reviewed, even if a source update or another admin changed it meanwhile.

## Tests and verification

Unit tests cover envelope and item validation, template defaults, configurable limits and canonical fingerprints. Replica-set integration tests cover setup guard, unpublished ingestion, ordering, retries, conflicts, draft follow/flag behaviour, published copy isolation, concurrent first inserts, HTTP authentication and logging, review queue, revision conflicts, edit/reset/publish/unpublish, audit and both roles, configurable pagination and per-source sync logs. Newman workflow `Articles.postman_collection.json` runs in `pnpm test:http` and against the Docker database.

Last verified on 2026-11-16 on branch `dev_be`: `pnpm test`, `pnpm test:integration`, `pnpm test:http`, `pnpm api:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build` passed, plus the Docker MongoDB 8.0 end-to-end run. No live Google Calendar, Google Form or Apps Script was used.

## Setup

Set `ARTICLE_FORM_ID`, then run `pnpm articles:setup`. The command validates the
configuration and creates the indexes. Article requests return
`503 ARTICLES_NOT_INITIALIZED` until setup has run, and
`503 ARTICLES_NOT_CONFIGURED` while the form ID is missing.
