import { requireIngestionSecret } from "../../integrations/apps-script.ts";
import { ApiError, defineHandler, readJsonObject } from "../../lib/http.ts";
import { rejectUnknownQuery } from "../../lib/pagination.ts";
import { archiveSyncLogPage } from "../archives/admin.ts";
import { ingestArchive, logInvalidObservation } from "../archives/ingestion.ts";
import { articleSyncLogPage } from "../articles/admin.ts";
import { ingestArticles, logRejectedArticleBatch } from "../articles/ingestion.ts";
import { requireAdmin } from "../auth/session.ts";
import { eventSyncLogPage } from "../events/admin.ts";
import { ingestEvents, logRejectedEventBatch } from "../events/ingestion.ts";

// Every connector endpoint authenticates before reading the body, and logs a
// body that cannot be parsed before rejecting it.
function ingestionHandler(id: string, logRejected: (input: unknown, reason: string, receivedAt: Date) => Promise<void>,
  ingest: (input: unknown, receivedAt: Date) => Promise<unknown>) {
  return defineHandler(id, async (request) => {
    requireIngestionSecret(request);
    const receivedAt = new Date();
    let input;
    try { input = await readJsonObject(request); }
    catch (error) {
      await logRejected(null, error instanceof ApiError ? error.code : "INVALID_BODY", receivedAt);
      throw error;
    }
    return ingest(input, receivedAt);
  });
}

export const syncArchives = ingestionHandler("sync.archives", logInvalidObservation, ingestArchive);
export const syncArticles = ingestionHandler("sync.articles", logRejectedArticleBatch, ingestArticles);
export const syncEvents = ingestionHandler("sync.events", logRejectedEventBatch, ingestEvents);

const LOG_SOURCES = {
  archives: { filters: ["streamId", "externalSubmissionId"], page: archiveSyncLogPage },
  events: { filters: ["eventId"], page: eventSyncLogPage },
  articles: { filters: ["responseId"], page: articleSyncLogPage },
} as const;
type LogSource = keyof typeof LOG_SOURCES;

// One admin endpoint for every connector; `source` defaults to archives for compatibility.
export const syncLogs = defineHandler("sync.logs", async (request) => {
  await requireAdmin(request, "ADMIN");
  const url = new URL(request.url);
  const source = (url.searchParams.get("source") ?? "archives") as LogSource;
  if (!(source in LOG_SOURCES)) throw new ApiError(400, "INVALID_SOURCE", "source must be archives, events or articles.");
  rejectUnknownQuery(url, ["source", "limit", "offset", ...LOG_SOURCES[source].filters]);
  return { source, ...await LOG_SOURCES[source].page(url) };
});
