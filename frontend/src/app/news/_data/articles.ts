import { connection } from "next/server";
import { cache } from "react";
import { articlesDetail, articlesList } from "@kmits/backend";

export type NewsArticle = {
  id: string;
  title: string;
  summary: string;
  /** Free text from the submission form; may be empty. */
  category: string;
  ministry: string;
  authors: string[];
  /** ISO date (UTC) of the first publication. */
  publishedAt: string;
  cover?: { src: string; alt: string };
  /** Markdown. Only the detail endpoint returns it. */
  body?: string;
};

type ApiArticle = Omit<NewsArticle, "cover"> & {
  coverImage: { driveFileId: string; alt: string } | null;
};

const PAGE_SIZE = 100; // the API's default maximum

const toArticle = ({ coverImage, ...rest }: ApiArticle): NewsArticle => ({
  ...rest,
  // The backend does not check that the image is public; a private one renders as broken.
  cover: coverImage
    ? {
        src: `https://drive.google.com/thumbnail?id=${encodeURIComponent(coverImage.driveFileId)}&sz=w1600`,
        alt: coverImage.alt,
      }
    : undefined,
});

/**
 * Every published article, newest first. Calls the public `GET /api/articles`
 * handler in-process, so the backend contract applies unchanged. Throws when the
 * API errors. The backend import is server-only, so this module cannot reach a
 * Client Component.
 */
export const getArticles = cache(async () => {
  // The handler creates a random request id, so it must not run while prerendering.
  await connection();
  const articles: NewsArticle[] = [];
  // shortcut: the API caps offset at 10000, so at most ~10k articles load; add
  // server-side search and categories before the archive can grow past that.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await articlesList(
      new Request(`http://localhost/api/articles?limit=${PAGE_SIZE}&offset=${offset}`),
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.code ?? `articles ${response.status}`);
    articles.push(...body.data.items.map(toArticle));
    if (articles.length >= body.data.total || body.data.items.length === 0) break;
  }
  return articles;
});

/** One article with its Markdown body; `undefined` when it does not exist or is unpublished. */
export const getArticle = cache(async (id: string) => {
  await connection();
  const response = await articlesDetail(
    new Request(`http://localhost/api/articles/${encodeURIComponent(id)}`),
  );
  if (response.status === 404) return undefined;
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.code ?? `article ${response.status}`);
  return toArticle(body.data);
});

/** Distinct non-empty categories, in order of first appearance. */
export function categoriesOf(articles: NewsArticle[]): string[] {
  return [...new Set(articles.map((a) => a.category).filter(Boolean))];
}

/** Articles matching the query (title, summary, ministry, category, authors) and category. */
export function searchArticles(
  articles: NewsArticle[],
  query: string,
  category: string | undefined,
): NewsArticle[] {
  const needle = query.toLowerCase();
  return articles.filter((a) => {
    if (category && a.category !== category) return false;
    if (!needle) return true;
    return [a.title, a.summary, a.ministry, a.category, ...a.authors]
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });
}

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** `/news` URL for the given search and category filters. */
export function newsHref({
  q,
  kategori,
}: {
  q?: string;
  kategori?: string;
}): string {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (kategori) params.set("kategori", kategori);
  const query = params.toString();
  return query ? `/news?${query}` : "/news";
}
