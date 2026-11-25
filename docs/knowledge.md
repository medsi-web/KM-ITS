# Knowledge groups

A knowledge group is how the website presents one ministry's Archive documents
(GitHub issue #6): a name, a description and a link to the ministry's shared
Google Drive folder. Groups are managed by admins in MongoDB. Which folders exist,
and therefore which documents exist, is still decided only by `archive.sources` in
`kmits.config.json` (see [archive.md](archive.md)).

## Model

| Field | Rule |
|---|---|
| `ministryId` | Required. A `ministryId` registered in `archive.sources`. One group per ministry; a ministry with several folders still has one group. |
| `slug` | Lowercase letters, digits and single hyphens, up to 80. Defaults to a slug of the name on create (`Kastrat & Kebijakan` → `kastrat-kebijakan`). Unique. It does not change when the name changes. |
| `name` | Required, 1–120 characters. Card title. |
| `title` | Optional, up to 200. Heading on the group page when it differs from the name. |
| `description` | Required, 1–2000 characters. |
| `driveUrl` | Required. An `https://drive.google.com/...` or `https://docs.google.com/...` link, up to 500 characters. Opened in a new tab by the frontend. |
| `order` | Integer 0–10000, default 0. Lower first in the default sort. |
| `hidden` | Default `false`. Hidden groups disappear from the public API; their documents stay in `/api/archives`. |
| `revision` | Starts at 1 and increases on every edit. |

Every create, edit and delete writes an audit record (`knowledge.created`,
`knowledge.updated`, `knowledge.deleted`) with the actor and the before/after state.

## Public API

- `GET /api/knowledge-groups` lists visible groups.
  - `q`: 1–100 characters, case-insensitive substring search over name, title and description.
  - `sort`: `order` (default: `order`, then name), `name`, or `newest` (group with the latest visible document first).
  - `limit` 1–100 (default 50) and `offset` 0–10000. Other parameters return `400 UNSUPPORTED_QUERY`.
- `GET /api/knowledge-groups/{slug}` returns one visible group or `404 KNOWLEDGE_GROUP_NOT_FOUND`.

Public fields: `id`, `slug`, `ministryId`, `name`, `title`, `description`, `driveUrl`,
`documentCount` (visible Archive documents of the ministry), `lastDocumentAt` (the
newest visible document's `updatedAt`, or `null`), `updatedAt` (last group edit) and
`documentsUrl` (`/api/archives?ministryId=...`, the group's document list).

## Admin API

All routes need an admin session (`ADMIN` or `SUPER_ADMIN`). Mutations also need
the exact Origin and the session CSRF token.

- `GET /api/admin/knowledge-groups` lists all groups, hidden ones included, with
  `order`, `hidden`, `revision`, `createdBy`, `updatedBy` and `createdAt`. It also
  returns `unassignedMinistries`: registered ministries that have no group yet.
- `POST /api/admin/knowledge-groups` with `{ ministryId, name, description, driveUrl }`
  and optional `slug`, `title`, `order`, `hidden`.
- `PATCH /api/admin/knowledge-groups/{id}` with `{ "revision": 2, ...changed fields }`.
- `DELETE /api/admin/knowledge-groups/{id}` removes the group only.

Errors:

| Code | Status | When |
|---|---|---|
| `INVALID_KNOWLEDGE_GROUP` | 400 | A field breaks a rule above, an unknown field is sent, or a PATCH changes nothing |
| `KNOWLEDGE_GROUP_EXISTS` | 409 | The ministry already has a group |
| `KNOWLEDGE_GROUP_SLUG_TAKEN` | 409 | Another group uses the slug |
| `KNOWLEDGE_GROUP_CHANGED` | 409 | `revision` is not current: reload and apply the edit again |
| `KNOWLEDGE_GROUP_NOT_FOUND` | 404 | No such group |
| `KNOWLEDGE_NOT_INITIALIZED` | 503 | `pnpm archives:setup` has not run since this feature was added |

## Setup

`pnpm archives:setup` creates the group indexes (unique slug, unique ministry) with
the Archive indexes. Existing installations must run it once more.

## Tests and verification

`tests/knowledge.integration.ts` covers guards, CSRF, temporary-password restriction,
field rules, uniqueness, revision conflicts and concurrent edits, hiding, deletion
keeping documents, audit records, counts of visible documents only, search, sort and
pagination. The Archive Newman workflow runs the same flow over HTTP.
