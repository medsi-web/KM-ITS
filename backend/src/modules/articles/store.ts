import type { Db } from "mongodb";
import { getDatabase } from "../../lib/database.ts";
import { markSchemaReady, requireSchema } from "../../lib/schema.ts";
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
  await requireSchema(database, "article_control", "ARTICLES_NOT_INITIALIZED", "Run Article setup before serving article traffic.");
  return articleCollections(database);
}

export async function initializeArticles(database: Db): Promise<void> {
  const store = articleCollections(database);
  await store.articles.createIndex({ formId: 1, responseId: 1 }, { unique: true });
  await store.articles.createIndex({ isPublished: 1, firstPublishedAt: -1, _id: 1 });
  await store.articles.createIndex({ updatedAt: -1, _id: 1 });
  await store.syncLogs.createIndex({ receivedAt: -1, _id: -1 });
  await store.syncLogs.createIndex({ responseId: 1, receivedAt: -1 });
  await markSchemaReady(database, "article_control");
}
