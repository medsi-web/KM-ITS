import { randomUUID } from "node:crypto";
import { decideBySourceTime, rejectedSourceId, runBatch, type ItemOutcome } from "../../lib/batch-sync.ts";
import { ApiError } from "../../lib/http.ts";
import { sourceTransaction } from "../../lib/transaction.ts";
import type { ArticleRecord } from "./models.ts";
import { getArticleStore, type ArticleStore } from "./store.ts";
import { validateArticleBatch, type ArticleItem } from "./validation.ts";

function storeUnavailable(): ApiError {
  return new ApiError(503, "ARTICLES_STORE_UNAVAILABLE", "Transactional Article storage is unavailable.");
}

// Logs a request rejected before any item was processed. Article content is never logged.
export async function logRejectedArticleBatch(input: unknown, reason: string, receivedAt: Date) {
  const store = await getArticleStore();
  try {
    await store.syncLogs.insertOne({
      _id: randomUUID(), formId: rejectedSourceId(input, "formId"), responseId: null, submittedAt: null, receivedAt, outcome: "invalid", reason,
    });
  } catch { throw storeUnavailable(); }
}

// A source update never touches the published copy. An unedited draft
// follows the source; an admin-edited draft is kept and flagged instead.
function nextRecord(current: ArticleRecord | null, formId: string, item: ArticleItem, receivedAt: Date): ArticleRecord {
  const source = { content: item.content, fingerprint: item.fingerprint };
  const base = {
    formId, responseId: item.responseId, submittedAt: item.submittedAt, submitterEmail: item.submitterEmail,
    sourceFingerprint: item.itemFingerprint, source, lastReceivedAt: receivedAt, updatedAt: receivedAt,
  };
  if (!current) {
    return {
      _id: randomUUID(), ...base, draft: { ...source, revision: 1, editedBy: null, editedAt: null }, sourceUpdatePending: false,
      published: null, isPublished: false, firstPublishedAt: null, createdAt: receivedAt,
    };
  }
  if (current.draft.editedBy === null) {
    const draft = current.draft.fingerprint === item.fingerprint
      ? current.draft
      : { ...source, revision: current.draft.revision + 1, editedBy: null, editedAt: null };
    return { ...current, ...base, draft, sourceUpdatePending: false };
  }
  return { ...current, ...base, sourceUpdatePending: current.draft.fingerprint !== item.fingerprint };
}

async function applyItem(store: ArticleStore, formId: string, item: ArticleItem, receivedAt: Date): Promise<ItemOutcome> {
  return sourceTransaction(async (session) => {
    const current = await store.articles.findOne({ formId, responseId: item.responseId }, { session });
    const stored = current && { at: current.submittedAt, fingerprint: current.sourceFingerprint };
    const outcome = decideBySourceTime(stored, { at: item.submittedAt, fingerprint: item.itemFingerprint });
    if (outcome === "applied") {
      const next = nextRecord(current, formId, item, receivedAt);
      if (current) await store.articles.replaceOne({ _id: current._id }, next, { session });
      else await store.articles.insertOne(next, { session });
    } else if (current && outcome === "unchanged") {
      // Identical content with a newer timestamp only advances the watermark.
      const submittedAt = item.submittedAt > current.submittedAt ? item.submittedAt : current.submittedAt;
      await store.articles.updateOne({ _id: current._id }, { $set: { submittedAt, lastReceivedAt: receivedAt } }, { session });
    }
    await store.syncLogs.insertOne({ _id: randomUUID(), formId, responseId: item.responseId, submittedAt: item.submittedAt, receivedAt, outcome }, { session });
    return outcome;
  });
}

export async function ingestArticles(input: unknown, receivedAt = new Date()) {
  let batch;
  try { batch = validateArticleBatch(input); }
  catch (error) {
    if (error instanceof ApiError && error.status === 422) await logRejectedArticleBatch(input, error.code, receivedAt);
    throw error;
  }
  const store = await getArticleStore();
  const { formId } = batch;
  const results = await runBatch(batch.items, {
    idKey: "responseId",
    idOf: item => item.responseId,
    logInvalid: (responseId, reason) => store.syncLogs.insertOne({
      _id: randomUUID(), formId, responseId, submittedAt: null, receivedAt, outcome: "invalid", reason,
    }),
    apply: item => applyItem(store, formId, item, receivedAt),
    unavailable: storeUnavailable,
  });
  return { receivedAt: receivedAt.toISOString(), results };
}
