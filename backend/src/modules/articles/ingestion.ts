import { randomUUID } from "node:crypto";
import { ApiError } from "../../lib/http.ts";
import { sourceTransaction } from "../../lib/transaction.ts";
import type { ArticleRecord, ItemOutcome } from "./models.ts";
import { getArticleStore, type ArticleStore } from "./store.ts";
import { validateArticleBatch, type ArticleItem } from "./validation.ts";

export interface ArticleItemResult { index: number; responseId: string | null; outcome: ItemOutcome; reason?: string }

function storeUnavailable(): ApiError {
  return new ApiError(503, "ARTICLES_STORE_UNAVAILABLE", "Transactional Article storage is unavailable.");
}

// Logs a request rejected before any item was processed. Article content is never logged.
export async function logRejectedArticleBatch(input: unknown, reason: string, receivedAt: Date) {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>).formId : undefined;
  const formId = typeof raw === "string" && raw.length <= 512 && !/\s/.test(raw) ? raw : "unknown";
  const store = await getArticleStore();
  try {
    await store.syncLogs.insertOne({ _id: randomUUID(), formId, responseId: null, submittedAt: null, receivedAt, outcome: "invalid", reason });
  } catch { throw storeUnavailable(); }
}

function decide(current: ArticleRecord | null, item: ArticleItem): ItemOutcome {
  if (!current) return "applied";
  const incoming = item.submittedAt.getTime(), stored = current.submittedAt.getTime();
  if (incoming < stored) return "stale";
  if (current.sourceFingerprint === item.itemFingerprint) return "unchanged";
  return incoming === stored ? "conflict" : "applied";
}

// A source update never touches the published copy. An unedited draft
// follows the source; an admin-edited draft is kept and flagged instead.
function nextRecord(current: ArticleRecord | null, formId: string, item: ArticleItem, receivedAt: Date): ArticleRecord {
  const source = { content: item.content, fingerprint: item.fingerprint };
  const base = { formId, responseId: item.responseId, submittedAt: item.submittedAt, submitterEmail: item.submitterEmail, sourceFingerprint: item.itemFingerprint, source, lastReceivedAt: receivedAt, updatedAt: receivedAt };
  if (!current) {
    return { _id: randomUUID(), ...base, draft: { ...source, revision: 1, editedBy: null, editedAt: null }, sourceUpdatePending: false,
      published: null, isPublished: false, firstPublishedAt: null, createdAt: receivedAt };
  }
  if (current.draft.editedBy === null) {
    const draft = current.draft.fingerprint === item.fingerprint ? current.draft : { ...source, revision: current.draft.revision + 1, editedBy: null, editedAt: null };
    return { ...current, ...base, draft, sourceUpdatePending: false };
  }
  return { ...current, ...base, sourceUpdatePending: current.draft.fingerprint !== item.fingerprint };
}

async function applyItem(store: ArticleStore, formId: string, item: ArticleItem, receivedAt: Date): Promise<ItemOutcome> {
  return sourceTransaction(async (session) => {
    const current = await store.articles.findOne({ formId, responseId: item.responseId }, { session });
    const outcome = decide(current, item);
    if (outcome === "applied") {
      const next = nextRecord(current, formId, item, receivedAt);
      if (current) await store.articles.replaceOne({ _id: current._id }, next, { session });
      else await store.articles.insertOne(next, { session });
    } else if (current && outcome === "unchanged") {
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
  const results: ArticleItemResult[] = [];
  for (const [index, item] of batch.items.entries()) {
    try {
      if (!item.ok) {
        await store.syncLogs.insertOne({ _id: randomUUID(), formId: batch.formId, responseId: item.responseId, submittedAt: null, receivedAt, outcome: "invalid", reason: item.reason });
        results.push({ index, responseId: item.responseId, outcome: "invalid", reason: item.reason });
      } else {
        results.push({ index, responseId: item.value.responseId, outcome: await applyItem(store, batch.formId, item.value, receivedAt) });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Earlier items stay committed; a retried batch resolves them as unchanged.
      throw storeUnavailable();
    }
  }
  return { receivedAt: receivedAt.toISOString(), results };
}
