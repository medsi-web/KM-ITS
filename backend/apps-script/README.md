# KM ITS Apps Script connectors

One Apps Script project reads the three Google sources and sends their changes to
the backend. Rules and storage live in the backend; the connectors only read and
forward.

| Connector | Source | Backend endpoint | Schedule | Spec |
|---|---|---|---|---|
| `syncArchive` | Ministry Drive folders (Markdown metadata + PDF) | `POST /api/internal/sync/archives` | every 5 minutes | [docs/archive.md](../../docs/archive.md) |
| `syncTimeline` | The shared Google Calendar | `POST /api/internal/sync/events` | every 15 minutes and on calendar change | [docs/timeline.md](../../docs/timeline.md) |
| `syncArticles` | The article Google Form | `POST /api/internal/sync/articles` | on form submit and every hour | [docs/articles.md](../../docs/articles.md) |

Files: `src/Config.js` (settings, HTTP, state), `src/Archive.js`, `src/Timeline.js`,
`src/Articles.js`, `src/Main.js` (functions you run), `appsscript.json` (scopes and
advanced services). `backend/tests/apps-script.test.ts` runs this code in Node with
fake Google services and checks every payload with the backend validators
(`pnpm test`).

## Where it runs

Apps Script projects live at <https://script.google.com> under a Google account.
You do not create them in the Google Cloud console: each project gets a hidden
default Cloud project, and the Drive and Calendar advanced services used here
work with it. A standard Cloud project is needed only for the backend's own Drive
reader (the service account and API key behind `/api/archives/{id}/open`), which is
separate from this project.

Use one account for the automation and keep it for the whole cabinet. It needs:

- **Viewer** on every registered ministry folder,
- read access to the shared calendar,
- **Editor** on the article form (FormApp cannot read responses otherwise).

Triggers run as the account that installs them. After a handover, the new
account must run `installTriggers()` again.

## Setup

1. **Backend secret.** On the server run `pnpm integration:secret`. Put the printed
   `APPS_SCRIPT_INGESTION_SECRET_SHA256` in the server environment and keep the
   plaintext secret for step 4.
2. **Backend URL.** Apps Script cannot reach `localhost`. Use the deployed HTTPS
   origin, or a tunnel (for example `cloudflared tunnel --url http://localhost:3000`)
   while testing locally.
3. **Create and push the project** with [clasp](https://github.com/google/clasp),
   signed in as the automation account. First turn on "Google Apps Script API"
   at <https://script.google.com/home/usersettings>.

   ```powershell
   cd backend/apps-script
   npx @google/clasp@3.4.0 login
   npx @google/clasp@3.4.0 create --type standalone --title "KM ITS connectors"
   npx @google/clasp@3.4.0 push
   ```

   `create` writes `.clasp.json` (ignored by Git; see `.clasp.json.example`).
   Without clasp, create a project in the editor, show `appsscript.json` under
   Project Settings, and paste the five files by hand.
4. **Script Properties** (Project Settings > Script Properties):

   | Property | Value |
   |---|---|
   | `KMITS_BACKEND_URL` | `https://<backend origin>`, no trailing path |
   | `KMITS_INGESTION_SECRET` | The plaintext secret from step 1 |
   | `KMITS_ARCHIVE_STREAMS` | `[{"streamId":"...","folderId":"..."}]`, the same pairs as `archive.sources` in `kmits.config.json` |
   | `KMITS_CALENDAR_ID` | Same as `timeline.calendarId` |
   | `KMITS_FORM_ID` | Same as `articles.formId`: the ID in the form's edit URL `docs.google.com/forms/d/<ID>/edit` |
   | `KMITS_FORM_FIELDS` | Optional, see [Form questions](#form-questions) |
   | `KMITS_TIMELINE_LOOKBACK_DAYS` | Optional, default 365: how far back the first Calendar sync reads |
   | `KMITS_TIMELINE_BATCH_SIZE`, `KMITS_ARTICLES_BATCH_SIZE` | Optional, defaults 50 and 20; keep them at or below the backend's `syncMaxItems` |
   | `KMITS_TIMELINE_DESCRIPTION_MAX` | Optional, default 8000; keep it equal to `timeline.descriptionMaxChars` |

   Leave a connector's ID empty to turn that connector off.
5. In the editor run **`checkSetup`**. The first run asks the account to grant the
   scopes in `appsscript.json`. Every line should start with `OK`.
6. Run **`syncAll`** once and read the execution log, then run
   **`installTriggers`**.

## How each connector behaves

**Archive.** Each run lists every registered folder. A `.md` file is one document;
its frontmatter names the PDF in the same folder by `driveFileId`. The connector
validates the frontmatter with the backend rules and sends one observation per
metadata file whose state changed:

| What it finds | Observation | Website |
|---|---|---|
| Valid metadata and the PDF in the folder | `VALID` (with checksum and public-sharing flag) | shown if the PDF is shared publicly |
| Frontmatter missing, malformed or breaking a rule | `INVALID` with the reason | hidden |
| The PDF is not in the folder, or cannot be read | `UNAVAILABLE` | hidden |
| A metadata file that was there before is gone | `MISSING` | hidden |
| The folder listing itself fails | `SYNC_ERROR` (changes nothing, logged in admin sync logs) | unchanged |

Unchanged files send nothing; each file is fully re-checked at least every 6 hours.
A replaced PDF must be a new Drive file: upload it, then change `driveFileId` in the
same `.md` file. Sequences are microsecond timestamps, so they keep increasing even
if the stored state is lost.

**Timeline.** Uses Calendar incremental sync with recurring events expanded. Deleted
events are sent as cancelled. All-day events start at midnight in the calendar's
time zone. Write the organizer as a title prefix, `[Kementerian Sosial] Bakti Sosial`,
or set the shared extended property `kmitsOrganization`. If a batch fails, the sync
token is not advanced and the same changes are sent again.

**Articles.** Sends responses submitted since the last successful run (with a
10-minute overlap). Edited responses keep their response ID. If a batch fails, the
watermark is not advanced.

## Form questions

Questions are matched by title, ignoring case and surrounding spaces:

| Field | Default question titles |
|---|---|
| `title` (required) | Judul, Judul Artikel, Title |
| `body` (required, Markdown) | Isi Artikel, Isi, Body |
| `summary` | Ringkasan, Summary |
| `category` | Kategori, Category |
| `ministry` | Kementerian, Ministry |
| `authors` | Penulis, Nama Penulis, Authors (comma or line separated) |
| `coverImage` | Gambar Sampul, Foto Sampul, Cover Image (a file-upload question) |
| `coverAlt` | Keterangan Gambar, Deskripsi Gambar, Cover Alt |

To use other titles set `KMITS_FORM_FIELDS`, for example
`{"title": "Judul Tulisan", "body": ["Isi", "Konten"]}`. Collect respondent emails in
the form settings if admins should see `submitterEmail`.

## Maintenance

| Function | Use |
|---|---|
| `checkSetup` | Re-check access after changing folders, the calendar, the form or the account |
| `installTriggers` / `removeTriggers` | (Re)create or delete the schedules |
| `resyncArchive` | Send every Archive document again on the next run (sequences are kept) |
| `resyncTimeline` | Full Calendar listing on the next run |
| `resyncArticles` | Send every form response again on the next run |

Run history is under Executions in the editor. The backend's admin sync logs
(`GET /api/admin/sync-logs?source=archives|events|articles`) show what arrived.

Limits for a consumer Gmail account: 6 minutes per run (the connectors stop at 4.5
minutes and continue next run), 90 minutes of trigger time per day and 20,000
UrlFetch calls per day. See <https://developers.google.com/apps-script/guides/services/quotas>.
