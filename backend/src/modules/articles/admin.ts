import type { ClientSession, Filter } from "mongodb";
import { FieldError } from "../../lib/fields.ts";
import { ApiError, defineHandler, readJsonObject } from "../../lib/http.ts";
import { filterValue, findPage, readPagination, rejectUnknownQuery } from "../../lib/pagination.ts";
import { pathId } from "../../lib/request.ts";
import type { AdminAccount } from "../auth/models.ts";
import { assertCurrentActor, requireAdmin, type AdminContext } from "../auth/session.ts";
import { accessTransaction, audit, getAuthStore } from "../auth/store.ts";
import { articleSettings } from "./config.ts";
import { hasUnpublishedChanges, type ArticleRecord, type ArticleSyncLog } from "./models.ts";
import { getArticleStore } from "./store.ts";
import { CONTENT_FIELDS, contentFingerprint, normalizeContent } from "./validation.ts";

function notFound() { return new ApiError(404, "ARTICLE_NOT_FOUND", "Article not found."); }
function invalidUpdate(message: string) { return new ApiError(400, "INVALID_ARTICLE_UPDATE", message); }

function flags(record: ArticleRecord) {
  return { isPublished: record.isPublished, hasUnpublishedChanges: hasUnpublishedChanges(record), sourceUpdatePending: record.sourceUpdatePending,
    revision: record.draft.revision, draftEdited: record.draft.editedBy !== null };
}

function adminSummary(record: ArticleRecord) {
  return { id: record._id, responseId: record.responseId, title: record.draft.content.title, ministry: record.draft.content.ministry,
    ...flags(record), submittedAt: record.submittedAt, firstPublishedAt: record.firstPublishedAt, updatedAt: record.updatedAt };
}

export function adminArticle(record: ArticleRecord) {
  return {
    id: record._id, formId: record.formId, responseId: record.responseId, submittedAt: record.submittedAt, submitterEmail: record.submitterEmail,
    source: record.source.content, draft: { content: record.draft.content, revision: record.draft.revision, editedBy: record.draft.editedBy, editedAt: record.draft.editedAt },
    published: record.published ? { content: record.published.content, publishedAt: record.published.publishedAt, publishedBy: record.published.publishedBy } : null,
    ...flags(record), firstPublishedAt: record.firstPublishedAt, lastReceivedAt: record.lastReceivedAt, createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

export function articleSyncLogView(log: ArticleSyncLog) {
  return { id: log._id, formId: log.formId, responseId: log.responseId, submittedAt: log.submittedAt,
    receivedAt: log.receivedAt, outcome: log.outcome, reason: log.reason ?? null };
}

export const articlesAdminList = defineHandler("articles.adminList", async (request) => {
  await requireAdmin(request, "ADMIN");
  const url = new URL(request.url);
  rejectUnknownQuery(url, ["published", "limit", "offset"]);
  const settings = articleSettings();
  const page = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
  const published = url.searchParams.get("published");
  if (published !== null && published !== "true" && published !== "false") throw new ApiError(400, "INVALID_FILTER", "published must be true or false.");
  const filter: Filter<ArticleRecord> = published === null ? {} : { isPublished: published === "true" };
  const { articles } = await getArticleStore();
  return findPage(articles, filter, { updatedAt: -1, _id: 1 }, page, adminSummary);
});

// Articles branch of GET /api/admin/sync-logs; the caller has authorized the admin.
export async function articleSyncLogPage(url: URL) {
  const settings = articleSettings();
  const page = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
  const responseId = filterValue(url, "responseId", 1024);
  const store = await getArticleStore();
  return findPage(store.syncLogs, responseId ? { responseId } : {}, { receivedAt: -1, _id: -1 }, page, articleSyncLogView);
}

export const articlesAdminDetail = defineHandler("articles.adminDetail", async (request) => {
  await requireAdmin(request, "ADMIN");
  const store = await getArticleStore();
  const record = await store.articles.findOne({ _id: pathId(request) ?? "" });
  if (!record) throw notFound();
  const lastSync = await store.syncLogs.findOne({ formId: record.formId, responseId: record.responseId }, { sort: { receivedAt: -1, _id: -1 } });
  return { ...adminArticle(record), lastSync: lastSync ? articleSyncLogView(lastSync) : null };
});

function revisionOf(body: Record<string, unknown>): number {
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1) throw invalidUpdate("revision must be the current draft revision number.");
  return body.revision as number;
}

// Runs one audited mutation. The revision check makes the admin act on the
// exact draft they reviewed; any concurrent change returns 409.
async function mutate(request: Request, context: AdminContext, action: string, expectedRevision: number | null,
  change: (record: ArticleRecord, actor: AdminAccount, now: Date) => ArticleRecord, segment?: string) {
  const id = pathId(request, segment) ?? "";
  const auth = await getAuthStore();
  const store = await getArticleStore();
  return accessTransaction(auth, async (transaction: ClientSession) => {
    const actor = await assertCurrentActor(auth, context, transaction, false);
    const before = await store.articles.findOne({ _id: id }, { session: transaction });
    if (!before) throw notFound();
    if (expectedRevision !== null && expectedRevision !== before.draft.revision) {
      throw new ApiError(409, "ARTICLE_CHANGED", `The draft changed; current revision is ${before.draft.revision}. Review it again.`);
    }
    const after = change(before, actor, new Date());
    const changed = after !== before;
    if (changed) await store.articles.replaceOne({ _id: id }, after, { session: transaction });
    const state = (record: ArticleRecord) => ({ ...flags(record), fingerprint: record.draft.fingerprint, publishedFingerprint: record.published?.fingerprint ?? null });
    await audit(auth, transaction, action, actor._id, id, { actor: { id: actor._id, username: actor.username, role: actor.role }, changed, before: state(before), after: state(after) });
    return adminArticle(after);
  });
}

export const articlesUpdate = defineHandler("articles.update", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const body = await readJsonObject(request);
  const revision = revisionOf(body);
  const fields = Object.keys(body).filter(key => key !== "revision");
  if (body.resetToSource !== undefined) {
    if (body.resetToSource !== true || fields.length !== 1) throw invalidUpdate("Send { \"revision\": n, \"resetToSource\": true } without other fields.");
    return mutate(request, context, "article.reset", revision, (record, _actor, now) => {
      if (record.draft.editedBy === null && record.draft.fingerprint === record.source.fingerprint && !record.sourceUpdatePending) return record;
      return { ...record, draft: { ...record.source, revision: record.draft.revision + 1, editedBy: null, editedAt: null }, sourceUpdatePending: false, updatedAt: now };
    });
  }
  if (!fields.length || fields.some(key => !(CONTENT_FIELDS as readonly string[]).includes(key))) {
    throw invalidUpdate(`Send revision with one or more of: ${CONTENT_FIELDS.join(", ")}; or resetToSource.`);
  }
  const settings = articleSettings();
  const changes = Object.fromEntries(fields.map(key => [key, body[key]]));
  return mutate(request, context, "article.edited", revision, (record, actor, now) => {
    let content;
    try { content = normalizeContent({ ...record.draft.content, ...changes }, settings); }
    catch (error) { if (error instanceof FieldError) throw invalidUpdate(`Field rejected: ${error.reason}.`); throw error; }
    const fingerprint = contentFingerprint(content);
    if (fingerprint === record.draft.fingerprint) return record;
    return { ...record, draft: { content, fingerprint, revision: record.draft.revision + 1, editedBy: actor._id, editedAt: now }, updatedAt: now };
  });
});

export const articlesPublish = defineHandler("articles.publish", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const body = await readJsonObject(request);
  if (Object.keys(body).join(",") !== "revision") throw invalidUpdate("Send exactly { \"revision\": n }.");
  return mutate(request, context, "article.published", revisionOf(body), (record, actor, now) => {
    if (record.isPublished && !hasUnpublishedChanges(record)) return record;
    const published = { content: record.draft.content, fingerprint: record.draft.fingerprint, publishedAt: now, publishedBy: actor._id };
    return { ...record, published, isPublished: true, firstPublishedAt: record.firstPublishedAt ?? now, updatedAt: now };
  }, "publish");
});

export const articlesUnpublish = defineHandler("articles.unpublish", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const body = await readJsonObject(request);
  if (Object.keys(body).length) throw invalidUpdate("Send an empty JSON object.");
  // The published copy is kept for history; only public visibility changes.
  return mutate(request, context, "article.unpublished", null, (record, _actor, now) => record.isPublished ? { ...record, isPublished: false, updatedAt: now } : record, "unpublish");
});
