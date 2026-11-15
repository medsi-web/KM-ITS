# Timeline and Articles backend design

Approved on 2026-11-16. Full behavior is specified in [timeline.md](../timeline.md)
and [articles.md](../articles.md).

## Decisions

| Topic | Decision |
|---|---|
| Calendar layout | One shared KM ITS calendar (`EVENT_CALENDAR_ID`). `organization` is free text. |
| Article template | Simple schema v1: title, summary, category, ministry, authors, cover image, Markdown body. |
| Source update after publish | Public copy stays. Unedited drafts follow the source; edited drafts are kept and flagged `sourceUpdatePending`. |
| Sync protocol | Batches with per-item idempotent upsert keyed by source ID and ordered by source timestamp. No delivery ledger. |
| Configuration | Source IDs, batch sizes, text limits, page sizes and request size come from environment variables with validated defaults. |

## Scope

In scope: ingestion, public and admin APIs, manual hiding, draft/publish
workflow with revision checks, audit, per-source sync logs, setup commands,
unit/integration/Newman tests, OpenAPI and documentation.

Out of scope: Apps Script connectors, slugs, image access verification,
deletion, search and recurring-event modelling.

## Commit plan

1. Specifications.
2. Shared configuration and helpers.
3. Timeline sync.
4. Timeline public and admin API.
5. Article sync.
6. Article public and admin API.
7. Per-source sync logs.
8. Postman, OpenAPI, README and verification.
