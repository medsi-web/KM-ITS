import { requireIngestionSecret } from "../../integrations/apps-script.ts";
import { defineHandler, readJsonObject, ApiError } from "../../lib/http.ts";
import { readPagination, rejectUnknownQuery } from "../../lib/pagination.ts";
import { archiveSyncLogPage } from "../archives/admin.ts";
import { ingestArchive, logInvalidObservation } from "../archives/ingestion.ts";
import { articleSyncLogView } from "../articles/admin.ts";
import { articleSettings } from "../articles/config.ts";
import { getArticleStore } from "../articles/store.ts";
import { requireAdmin } from "../auth/session.ts";
import { eventSyncLogView } from "../events/admin.ts";
import { timelineSettings } from "../events/config.ts";
import { getEventStore } from "../events/store.ts";
import { ingestEvents, logRejectedEventBatch } from "../events/ingestion.ts";
import { ingestArticles, logRejectedArticleBatch } from "../articles/ingestion.ts";

export const syncArchives = defineHandler("sync.archives", async (request) => {
  requireIngestionSecret(request);
  const receivedAt = new Date();
  let input;
  try { input = await readJsonObject(request); }
  catch (error) { await logInvalidObservation(null, error instanceof ApiError ? error.code : "INVALID_BODY", receivedAt); throw error; }
  return ingestArchive(input, receivedAt);
});
export const syncArticles = defineHandler("sync.articles", async (request) => {
  requireIngestionSecret(request);
  const receivedAt = new Date();
  let input;
  try { input = await readJsonObject(request); }
  catch (error) { await logRejectedArticleBatch(null, error instanceof ApiError ? error.code : "INVALID_BODY", receivedAt); throw error; }
  return ingestArticles(input, receivedAt);
});
export const syncEvents = defineHandler("sync.events", async (request) => {
  requireIngestionSecret(request);
  const receivedAt = new Date();
  let input;
  try { input = await readJsonObject(request); }
  catch (error) { await logRejectedEventBatch(null, error instanceof ApiError ? error.code : "INVALID_BODY", receivedAt); throw error; }
  return ingestEvents(input, receivedAt);
});

type LogSource = "archives" | "events" | "articles";
const LOG_FILTERS: Record<LogSource, readonly string[]> = { archives: ["streamId", "externalSubmissionId"], events: ["eventId"], articles: ["responseId"] };

function filterValue(url: URL, key: string): string | undefined {
  const value = url.searchParams.get(key);
  if (value === null) return undefined;
  if (!value || value.length > 1024) throw new ApiError(400, "INVALID_FILTER", "Filter values must contain 1–1024 characters.");
  return value;
}

// One admin endpoint for every connector; `source` defaults to archives for compatibility.
export const syncLogs = defineHandler("sync.logs", async (request) => {
  await requireAdmin(request, "ADMIN");
  const url = new URL(request.url);
  const source = (url.searchParams.get("source") ?? "archives") as LogSource;
  if (!(source in LOG_FILTERS)) throw new ApiError(400, "INVALID_SOURCE", "source must be archives, events or articles.");
  rejectUnknownQuery(url, ["source", "limit", "offset", ...LOG_FILTERS[source]]);
  if (source === "archives") return { source, ...await archiveSyncLogPage(url) };
  if (source === "events") {
    const settings = timelineSettings();
    const { limit, offset } = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
    const eventId = filterValue(url, "eventId");
    const filter = eventId ? { eventId } : {};
    const store = await getEventStore();
    const [records, total] = await Promise.all([
      store.syncLogs.find(filter).sort({ receivedAt: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
      store.syncLogs.countDocuments(filter),
    ]);
    return { source, items: records.map(eventSyncLogView), total, limit, offset };
  }
  const settings = articleSettings();
  const { limit, offset } = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
  const responseId = filterValue(url, "responseId");
  const filter = responseId ? { responseId } : {};
  const store = await getArticleStore();
  const [records, total] = await Promise.all([
    store.syncLogs.find(filter).sort({ receivedAt: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
    store.syncLogs.countDocuments(filter),
  ]);
  return { source, items: records.map(articleSyncLogView), total, limit, offset };
});
