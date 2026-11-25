import { parseBatch, type ParsedItem } from "../../lib/batch-sync.ts";
import { payloadHash } from "../../lib/canonical.ts";
import { FieldError, identifier, instant, record, text, textList } from "../../lib/fields.ts";
import { ApiError } from "../../lib/http.ts";
import { articleSettings, type ArticleSettings } from "./config.ts";
import type { ArticleContent } from "./models.ts";

export const CONTENT_FIELDS = ["title", "summary", "category", "ministry", "authors", "coverImage", "body"] as const;
const RESPONSE_ID = /^[A-Za-z0-9_-]{1,512}$/;

export interface ArticleItem {
  responseId: string; submittedAt: Date; submitterEmail: string | null;
  content: ArticleContent; fingerprint: string; itemFingerprint: string;
}
export interface ArticleBatch { formId: string; items: ParsedItem<ArticleItem>[] }

export function invalidArticleBatch(): never {
  throw new ApiError(422, "INVALID_ARTICLE_BATCH", "Article batch does not match the ingestion schema or registered form.");
}

export function contentFingerprint(content: ArticleContent): string { return payloadHash(content); }

function coverImage(value: unknown): ArticleContent["coverImage"] {
  if (value === undefined || value === null) return null;
  const image = record(value, ["driveFileId", "alt"], "coverImage");
  return { driveFileId: identifier(image.driveFileId, 200, "coverImage.driveFileId"), alt: text(image.alt, 300, "coverImage.alt", "") };
}

// Shared by ingestion and admin edits so both enforce the same template rules.
export function normalizeContent(value: Record<string, unknown>, settings: ArticleSettings): ArticleContent {
  const image = coverImage(value.coverImage);
  return {
    schemaVersion: 1,
    title: text(value.title, 300, "title"),
    summary: text(value.summary, settings.summaryMaxChars, "summary", ""),
    category: text(value.category, 100, "category", ""),
    ministry: text(value.ministry, 200, "ministry", ""),
    authors: textList(value.authors, 30, 200, "authors"),
    coverImage: image,
    body: text(value.body, settings.bodyMaxChars, "body"),
  };
}

function email(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const result = text(value, 320, "submitterEmail");
  if (!/^[^\s@]+@[^\s@]+$/.test(result)) throw new FieldError("submitterEmail");
  return result;
}

export function parseArticleItem(input: unknown, settings: ArticleSettings): ArticleItem {
  const value = record(input, ["responseId", "submittedAt", "submitterEmail", "article"], "submission");
  const responseId = identifier(value.responseId, 512, "responseId");
  const submittedAt = instant(value.submittedAt, "submittedAt");
  const submitterEmail = email(value.submitterEmail);
  const article = record(value.article, ["schemaVersion", ...CONTENT_FIELDS], "article");
  if (article.schemaVersion !== 1) throw new FieldError("schemaVersion");
  const content = normalizeContent(article, settings);
  return {
    responseId, submittedAt, submitterEmail, content,
    fingerprint: contentFingerprint(content),
    itemFingerprint: payloadHash({ content, submitterEmail }),
  };
}

export function validateArticleBatch(input: unknown): ArticleBatch {
  const settings = articleSettings();
  const items = parseBatch(input, {
    sourceKey: "formId", expectedSource: settings.formId,
    itemsKey: "submissions", maxItems: settings.syncMaxItems,
    idKey: "responseId", idPattern: RESPONSE_ID,
    invalid: invalidArticleBatch,
    parseItem: item => parseArticleItem(item, settings),
  });
  return { formId: settings.formId, items };
}
