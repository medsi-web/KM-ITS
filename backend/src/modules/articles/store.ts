import type { Db } from "mongodb";
import { getDatabase } from "../../lib/database.ts";
import { ApiError } from "../../lib/http.ts";
import type { ArticleRecord, ArticleSyncLog } from "./models.ts";

export function articleCollections(database: Db) {
  return {
    articles: database.collection<ArticleRecord>("articles"),
    syncLogs: database.collection<ArticleSyncLog>("article_sync_logs"),
  };
}
export type ArticleStore = ReturnType<typeof articleCollections>;

export async function getArticleStore(): Promise<ArticleStore> {
  const database = await getDatabase();
  const ready = await database.collection<{ _id: string; schemaVersion: number }>("article_control").findOne({ _id: "schema", schemaVersion: 1 });
  if (!ready) throw new ApiError(503, "ARTICLES_NOT_INITIALIZED", "Run Article setup before serving article traffic.");
  return articleCollections(database);
}

export async function initializeArticles(database: Db): Promise<void> {
  const store = articleCollections(database);
  await store.articles.createIndex({ formId: 1, responseId: 1 }, { unique: true });
  await store.articles.createIndex({ isPublished: 1, firstPublishedAt: -1, _id: 1 });
  await store.articles.createIndex({ updatedAt: -1, _id: 1 });
  await store.syncLogs.createIndex({ receivedAt: -1, _id: -1 });
  await store.syncLogs.createIndex({ responseId: 1, receivedAt: -1 });
  // Readiness is recorded only after the identity constraint exists.
  await database.collection<{ _id: string; schemaVersion: number }>("article_control")
    .updateOne({ _id: "schema" }, { $set: { schemaVersion: 1 } }, { upsert: true });
}
