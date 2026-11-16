import type { Filter } from "mongodb";
import { ApiError, defineHandler } from "../../lib/http.ts";
import { readPagination, rejectUnknownQuery } from "../../lib/pagination.ts";
import { pathId, UUID_PATTERN } from "../../lib/request.ts";
import { articleSettings } from "./config.ts";
import type { ArticleRecord } from "./models.ts";
import { getArticleStore } from "./store.ts";

const publishedQuery: Filter<ArticleRecord> = { isPublished: true, published: { $ne: null } };

function notFound() { return new ApiError(404, "ARTICLE_NOT_FOUND", "The article was not found."); }

// Public responses read only the published copy, never the draft or source.
export function publicArticle(record: ArticleRecord, withBody: boolean) {
  const published = record.published!;
  const { title, summary, category, ministry, authors, coverImage, body } = published.content;
  return {
    id: record._id, title, summary, category, ministry, authors, coverImage,
    publishedAt: record.firstPublishedAt, updatedAt: published.publishedAt,
    ...(withBody ? { body } : {}),
  };
}

export const articlesList = defineHandler("articles.list", async (request) => {
  const url = new URL(request.url);
  rejectUnknownQuery(url, ["limit", "offset"]);
  const settings = articleSettings();
  const { limit, offset } = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
  const { articles } = await getArticleStore();
  const [records, total] = await Promise.all([
    articles.find(publishedQuery).sort({ firstPublishedAt: -1, _id: 1 }).skip(offset).limit(limit).toArray(),
    articles.countDocuments(publishedQuery),
  ]);
  return { items: records.map(record => publicArticle(record, false)), total, limit, offset };
});

export const articlesDetail = defineHandler("articles.detail", async (request) => {
  const id = pathId(request);
  if (!id || !UUID_PATTERN.test(id)) throw notFound();
  const { articles } = await getArticleStore();
  const record = await articles.findOne({ _id: id, ...publishedQuery });
  if (!record) throw notFound();
  return publicArticle(record, true);
});
