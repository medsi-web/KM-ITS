import { integerSetting, sourceIdSetting } from "../../lib/config.ts";

// Every Article limit is configurable through the environment; see docs/articles.md.
export function articleSettings() {
  return {
    formId: sourceIdSetting("ARTICLE_FORM_ID", "ARTICLES_NOT_CONFIGURED", "Articles"),
    syncMaxItems: integerSetting("ARTICLE_SYNC_MAX_ITEMS", 20, 1, 500),
    summaryMaxChars: integerSetting("ARTICLE_SUMMARY_MAX_CHARS", 1000, 1, 100000),
    bodyMaxChars: integerSetting("ARTICLE_BODY_MAX_CHARS", 50000, 1, 1000000),
    pageDefaultLimit: integerSetting("ARTICLE_PAGE_DEFAULT_LIMIT", 20, 1, 1000),
    pageMaxLimit: integerSetting("ARTICLE_PAGE_MAX_LIMIT", 100, 1, 1000),
  };
}

export type ArticleSettings = ReturnType<typeof articleSettings>;
