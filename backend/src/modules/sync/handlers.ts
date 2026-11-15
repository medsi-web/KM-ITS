import { requireIngestionSecret } from "../../integrations/apps-script.ts";
import { defineHandler, readJsonObject, ApiError } from "../../lib/http.ts";
import { ingestArchive, logInvalidObservation } from "../archives/ingestion.ts";
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
export { archiveSyncLogs as syncLogs } from "../archives/admin.ts";
