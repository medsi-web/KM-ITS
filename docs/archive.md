# Archive ingestion and publication

GitHub issue #11 is the authority for this backend specification. Valid submissions publish automatically. There is no approval, candidate, or rejection workflow.

## Source and identity

Each logical document is one mutable Markdown file with YAML frontmatter in a registered ministry Drive folder. Contributors upload replacement PDFs as new Drive files and update that same metadata file. Its Drive ID is the unique `externalSubmissionId`; repeated titles/authors are allowed. The scanner converts frontmatter into the JSON schema below. The backend does not fetch or parse raw Markdown during ingestion. Notes and document body are not accepted as publication fields.

Set `ARCHIVE_SOURCE_CONFIG` to a JSON array of `{streamId,ministryId,folderId}` registrations. Stream and folder IDs must be unique. Empty, malformed, or missing configuration fails closed. The server derives ministry ownership from this registry. Metadata must be observed in the envelope folder and the PDF must be observed in that same registered folder. Connector-reported membership is authenticated evidence, not independently fetched during ingestion.

## HTTP protocol

`POST /api/internal/sync/archives` uses the existing ingestion-secret authentication. Each request is one observation, at most 256 KiB. Required envelope:

```json
{
  "protocolVersion": 1,
  "streamId": "registered-stream",
  "deliveryId": "stable-retry-id",
  "scanSequence": "123",
  "metadataFileId": "mutable-metadata-drive-id",
  "metadataDriveVersion": "42",
  "observation": "VALID",
  "sourceCheckedAt": "2026-11-15T00:00:00Z",
  "folderId": "registered-folder",
  "metadata": {
    "schemaVersion": 1,
    "driveFileId": "pdf-drive-id",
    "title": "Annual report",
    "description": "Report description",
    "category": "Report",
    "year": 2026,
    "authors": ["Ministry author"]
  },
  "pdf": {
    "driveFileId": "pdf-drive-id",
    "folderId": "registered-folder",
    "mimeType": "application/pdf",
    "sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "publicReadable": true
  }
}
```

`metadataDriveVersion` must be non-null for VALID observations; other observations may use null when unavailable. Sequence and version are canonical unsigned decimal strings (up to 100 digits), compared without floating-point conversion. Every distinct file observation needs its own stream sequence; retries preserve the entire canonical observation and delivery ID. Counters must survive scanner restarts. Re-registering a source or transferring document ownership requires a separate controlled migration.

Metadata keys are strict: title is required and 1–300 characters. Description/category are optional, default to empty strings, and allow 0–5000/0–100 characters. Year is optional, defaults to null, and otherwise accepts integers 1900–9999. Authors is optional, defaults to an empty array, and accepts up to 30 nonempty strings of at most 200 characters. PDF requires matching ID, exact MIME type, 64 hexadecimal SHA-256 digits, boolean public readability, and registered folder. Optional `size` is a positive safe integer and `name` is at most 300 characters. Identifiers are 1–200 alphanumeric, underscore, or hyphen characters. Optional envelope `diagnostics` is a string of at most 2000 characters; its normalized value participates in the delivery hash but is excluded from stored snapshots and logs. Object keys are recursively sorted for canonical hashing. Unknown fields, including notes, are rejected.

For `INVALID`, `MISSING`, or `UNAVAILABLE`, omit metadata/pdf. These are valid file-specific observations that suppress the whole entry while retaining its last snapshot. `SYNC_ERROR` also omits metadata/pdf and never changes document watermarks or states. It writes an attempt log and reserves its delivery/sequence in the transactional ledger, so reusing those identifiers for different payloads conflicts. Use it for incomplete inventories, pagination failure, global authentication failure, or other scan-wide errors. Never infer missing files from an incomplete scan.

Malformed JSON returns 400, schema/source violations 422, and unavailable configuration/storage/transactions 503. Structurally valid observations return `data.outcome`: applied, unchanged, duplicate, stale, or conflict. Invalid requests are logged as invalid; they do not suppress an existing document. Backend receipt time is returned as `receivedAt` and logged independently of source time.

## Persistence and visibility

`archives` stores the latest accepted source state and latest valid immutable snapshot together with UUID, source ownership, versions, sequence, receipt/check timestamps, semantic generation, and manualHidden. A valid replacement atomically updates metadata and PDF. Visibility requires VALID state, a snapshot, public-readable PDF, and manualHidden=false. Nonpublic PDFs are retained but suppressed. Recovery never clears manual hiding.

`archive_deliveries` has unique stream/delivery and stream/sequence indexes; `archives` has a unique metadata identity index. Transactions atomically commit record, delivery ledger, and final attempt outcome. Concurrent first inserts retry duplicate-key contention; MongoDB retries transient transaction conflicts. Ordering is per document, so a later delivery for one document does not block another document. Lower/equal document sequences are stale; a higher sequence with a lower known Drive version conflicts because reconciliation is inconsistent. Neither overwrites current state. Reusing delivery or sequence with different normalized payload conflicts. Cross-source identity takeover conflicts. Identical polls advance observation watermarks without incrementing semantic generation.

Every authenticated attempt has a separate `archive_sync_logs` record, including duplicates, invalid requests, stale deliveries, conflicts, and scan failures. Logs contain bounded identifiers and backend timestamps, never request bodies, arbitrary diagnostics, credentials, or raw parser output. An interrupted attempt may retain PROCESSING_NOT_COMMITTED; a retried delivery resolves safely through the ledger. No retention deletion is configured for the idempotency ledger.

Before accepting traffic, an operator runs `node --env-file-if-exists=../frontend/.env.local scripts/setup-archives.mjs` from `backend/`. The command validates environment registrations and calls `initializeArchives(database)` to create indexes. Environment configuration remains authoritative; registrations are not duplicated into a database collection. MongoDB must support transactions (replica set or sharded cluster). No standalone fallback invents success. Provision actual source configuration, scanner credentials, source permissions, PDF public access, counter persistence, and operational monitoring before deployment. Apps Script/scanner code is outside this implementation.

Admin controls only set manual hiding/restoration and inspect current state/logs. Public opening separately revalidates current PDF binding and public accessibility through the backend Drive adapter. Source state remains the latest accepted observation, not a guarantee that Drive cannot change between polls.

## PDF immutability

After sequence and metadata-version checks, ingestion rejects a different SHA-256 for the current snapshot's PDF Drive ID with `conflict`, preserving the current record and watermarks. Changed PDF content must use a new Drive file ID. This safeguard compares the current stored binding; the backend does not maintain a historical PDF-ID/checksum registry, so it cannot detect reuse of an older PDF ID after a different PDF has become current.

## Tests and verification

Unit tests cover strict schema, bindings, source authority, and large counters. Replica-set integration tests cover auto-publication, retry/conflict ledger, stale ordering, recovery, manual hiding, unchanged polls, incomplete scans, independent document ordering, authenticated-attempt logs, concurrent first writes, cross-source ownership protection, separate identity for equal titles, renamed files keeping identity, and backend-only receipt time. Public integration tests cover visibility, fresh redirects, suppression, service failures, and concurrent hide/replacement behavior. Admin integration tests cover guards, CSRF, both roles, hide/unhide, audit actors, pagination, and sync history.

Last verified on 2026-11-16 on branch `dev_be`: `pnpm test`, `pnpm test:integration`, `pnpm test:http` (Newman), `pnpm api:check`, `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed. No live Drive, Apps Script, or production MongoDB was used.

## Contributor metadata example

Keep one mutable `.md` file per document and update that file in place. Its Drive file ID is the document identity. For example:

```yaml
---
schemaVersion: 1
driveFileId: newly-uploaded-pdf-drive-id
title: Annual ministry report
description: Activities and outcomes for the year.
category: Report
year: 2026
authors:
  - Ministry documentation team
---
```

The frontmatter `driveFileId` identifies the PDF, not this Markdown file. Upload replacements with a new PDF Drive ID, then change this reference. The scanner supplies the Markdown file's identity/version, source folder, checksum, and public-readability evidence in the ingestion envelope. It sends only the defined metadata keys; body text and notes do not become publication metadata. Description, category, year, and authors may be omitted as described above.

## Public opening and reader configuration

`GET /api/archives/{id}/open` returns a `302` redirect to the current verified PDF's Drive viewer URL with `Cache-Control: no-store`. Hidden or suppressed documents and confirmed missing, inaccessible, out-of-scope, or mismatched PDFs return `404`. A confirmed source failure suppresses the affected record while retaining its snapshot. Temporary provider, quota, authentication, or configuration failures return `503` and preserve publication state. Concurrent record changes require verification of the current version before redirecting.

Configure `DRIVE_SERVICE_ACCOUNT_EMAIL` and `DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY` for the backend reader, grant that identity read access to registered source folders, and configure `DRIVE_PUBLIC_API_KEY` for anonymous public-access verification. Enable the required Google Drive API project access and keep credentials server-side. Published PDFs must be accessible without a Google login. These reader settings are separate from `ARCHIVE_SOURCE_CONFIG` and the ingestion secret; scanner authorization does not configure the backend reader. See the backend README for deployment configuration.

## Initialization guard

The `archive_control` schema marker is written only after required indexes are created. Server Archive requests require this marker and return 503 before setup, so ingestion cannot silently run without its concurrency constraints. Operational index changes require maintenance; do not remove live constraints behind an existing readiness marker.
