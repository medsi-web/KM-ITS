# Timeline ingestion and publication

Google Calendar is the source of truth for KM ITS events. One shared calendar is
registered through `EVENT_CALENDAR_ID`. An Apps Script connector (not part of
this repository) reads the calendar and posts normalized event batches to the
backend. MongoDB stores the application copy and the website visibility state.

## Source and identity

- The calendar ID must equal `EVENT_CALENDAR_ID` exactly. Other calendars are rejected.
- An event is identified by `calendarId + eventId`. `eventId` is the Google Calendar event ID.
- Recurring events are not modelled. The connector expands recurring events and sends
  each occurrence with its own instance ID (for example `singleEvents=true`).
- `organization` is free text supplied by the connector, usually the ministry name.
  It is not verified against a registry because all ministries share one calendar.
- Multi-day events are stored once with `startAt` and `endAt`. The frontend draws the span.

## HTTP protocol

`POST /api/internal/sync/events` uses `Authorization: Bearer <APPS_SCRIPT_INGESTION_SECRET>`.
The body is at most `API_MAX_JSON_BYTES` (default 256 KiB):

```json
{
  "protocolVersion": 1,
  "calendarId": "km-its@group.calendar.google.com",
  "events": [
    {
      "eventId": "abc123def456",
      "updated": "2026-11-16T03:00:00.000Z",
      "status": "confirmed",
      "title": "Ministry meeting",
      "description": "Plain text or Calendar HTML; render as text.",
      "location": "ITS Surabaya",
      "organization": "Ministry of Education",
      "allDay": false,
      "startAt": "2026-11-20T02:00:00.000Z",
      "endAt": "2026-11-20T04:00:00.000Z"
    },
    { "eventId": "removed789", "updated": "2026-11-16T03:05:00.000Z", "status": "cancelled" }
  ]
}
```

Rules:

- `events` holds 1 to `EVENT_SYNC_MAX_ITEMS` items (default 50).
- `eventId`: 1–1024 characters of `A–Z a–z 0–9 _ -`.
- `updated`: the Calendar `updated` timestamp, ISO 8601 with `Z` or an offset. It is the ordering authority.
- `status`: `confirmed` (tentative events are sent as confirmed) or `cancelled`.
  Google reports deleted events as cancelled; both are treated the same way.
- Confirmed events require `title` (1–500), `allDay` (boolean), `startAt` and `endAt`.
  `endAt` must not be before `startAt`. Optional `description` (up to
  `EVENT_DESCRIPTION_MAX_CHARS`, default 8000), `location` (up to 500) and
  `organization` (up to 200) default to empty strings.
- All-day events are sent as instants as well. The connector converts the
  calendar date to midnight in the calendar time zone (WIB for KM ITS); Google's
  all-day end date is exclusive, so a one-day event ends at the next midnight.
- Cancelled items need only `eventId`, `updated` and `status`. Content fields
  on a cancelled item are ignored.
- Unknown fields are rejected.

The envelope is validated first. A malformed envelope, a wrong `protocolVersion`,
an unregistered calendar or an item count outside the limit returns 422 and
changes nothing. Items are then processed one by one, each in its own
transaction. A malformed item is reported as `invalid` without blocking the
other items.

Response `data`:

```json
{ "receivedAt": "2026-11-16T03:06:00.000Z", "results": [
  { "index": 0, "eventId": "abc123def456", "outcome": "applied" },
  { "index": 1, "eventId": "removed789", "outcome": "applied" }
] }
```

## Ordering and outcomes

| Incoming `updated` vs stored | Content | Outcome |
|---|---|---|
| No stored event | any | `applied` |
| Newer | different | `applied` |
| Newer | same | `unchanged` (watermark advances) |
| Equal | same | `unchanged` (safe retry) |
| Equal | different | `conflict` (stored state kept) |
| Older | any | `stale` |
| Item fails validation | — | `invalid` with `reason` |

A cancellation for an unknown event is stored without content, so an older
confirmed copy that arrives later is rejected as stale.

## Persistence and visibility

`events` stores one record per calendar event: UUID, source identity, status,
latest content, fingerprint, `sourceUpdatedAt`, `manualHidden`, generation and
timestamps. Records are never deleted.

An event is public when it is `confirmed`, has content and is not manually hidden.
Manual hiding survives source updates and is changed only by an admin.

`UPCOMING`, `ONGOING` and `FINISHED` are derived from the current time on each
request and are never stored:

```text
now < startAt              UPCOMING
startAt <= now < endAt     ONGOING
now >= endAt               FINISHED
```

`event_sync_logs` stores one record per processed item, plus one per rejected
envelope. Logs contain identifiers, timestamps, outcome and reason only, never
event content or credentials.

## Public API

- `GET /api/events` lists visible events ordered by `startAt`, then ID.
  - `from`, `to`: ISO 8601 instants. Returns events overlapping the window
    (`startAt < to` and `endAt > from`; zero-length events at `from` are included).
  - `status`: `UPCOMING`, `ONGOING` or `FINISHED`, evaluated at request time.
  - `limit` (default `EVENT_PAGE_DEFAULT_LIMIT` = 50, at most `EVENT_PAGE_MAX_LIMIT` = 200) and `offset` (0–10000).
  - Other query parameters return `400 UNSUPPORTED_QUERY`.
- `GET /api/events/{id}` returns one visible event or 404.

Public fields: `id`, `title`, `description`, `location`, `organization`,
`allDay`, `startAt`, `endAt`, `status`, `updatedAt`. Descriptions may contain
Calendar HTML; the frontend must render them as text or sanitize them.

## Admin API

All admin routes require an admin session. Mutations also require the exact
Origin and the session CSRF token.

- `GET /api/admin/events` lists all events, including cancelled and hidden ones,
  newest change first, with `limit`/`offset` pagination.
- `GET /api/admin/events/{id}` adds the latest sync log entry.
- `PATCH /api/admin/events/{id}` with `{ "hidden": true }` or `{ "hidden": false }`
  sets manual hiding. Each call writes an `event.hidden` or `event.unhidden` audit
  record with the actor and before/after state. Unhiding never shows a cancelled event.
- `GET /api/admin/sync-logs?source=events` reads event sync logs. `eventId` filters by event.

## Tests and verification

Unit tests cover envelope and item validation, configurable limits, offsets and derived status. Replica-set integration tests cover setup guard, ordering, retries, conflicts, stale copies, cancellation, manual hiding across updates, per-item invalid results, concurrent first inserts, HTTP authentication and logging, public window/status filters, configurable pagination, admin CSRF, audit and both roles, and per-source sync logs. Newman workflow `Timeline.postman_collection.json` runs in `pnpm test:http` and against the Docker database.

Last verified on 2026-11-16 on branch `dev_be`: `pnpm test`, `pnpm test:integration`, `pnpm test:http`, `pnpm api:check`, `pnpm lint`, `pnpm typecheck` and `pnpm build` passed, plus the Docker MongoDB 8.0 end-to-end run. No live Google Calendar, Google Form or Apps Script was used.

## Setup

Set `EVENT_CALENDAR_ID`, then run `pnpm timeline:setup`. The command validates the
configuration and creates the indexes. Timeline requests return
`503 TIMELINE_NOT_INITIALIZED` until setup has run, and
`503 TIMELINE_NOT_CONFIGURED` while the calendar ID is missing.
