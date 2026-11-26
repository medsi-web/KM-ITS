import { connection } from "next/server";
import { cache } from "react";
import { archivesList, knowledgeDetail, knowledgeList } from "@kmits/backend";
import type { KnowledgeGroup, PublicArchive, SortValue } from "./groups";
import { apiSort, toDocument } from "./groups";

const PAGE_SIZE = 100; // the API's maximum

// In-process GET to a backend handler: `undefined` on 404, throws on other errors.
async function read<T>(
  handler: (request: Request) => Promise<Response>,
  path: string,
): Promise<T | undefined> {
  // The handler creates a random request id, so it must not run while prerendering.
  await connection();
  const response = await handler(new Request(new URL(path, "http://localhost")));
  if (response.status === 404) return undefined;
  const body = await response.json();
  if (!response.ok) throw new Error(body?.error?.code ?? `${path} ${response.status}`);
  return body.data;
}

export async function getGroups(query: string, sort: SortValue) {
  // shortcut: first page only (one group per ministry); paginate past 100 groups.
  const params = new URLSearchParams({ limit: String(PAGE_SIZE), sort: apiSort[sort] });
  if (query) params.set("q", query);
  const data = await read<{ items: KnowledgeGroup[]; total: number }>(
    knowledgeList,
    `/api/knowledge-groups?${params}`,
  );
  return data!;
}

export const getGroup = cache((slug: string) =>
  read<KnowledgeGroup>(knowledgeDetail, `/api/knowledge-groups/${encodeURIComponent(slug)}`),
);

export async function getDocuments(documentsUrl: string) {
  const url = new URL(documentsUrl, "http://localhost");
  url.searchParams.set("limit", String(PAGE_SIZE));
  const archives: PublicArchive[] = [];
  // shortcut: the API caps offset at 10000, so at most ~10k documents per group.
  for (;;) {
    url.searchParams.set("offset", String(archives.length));
    const data = await read<{ items: PublicArchive[]; total: number }>(archivesList, url.href);
    archives.push(...data!.items);
    if (archives.length >= data!.total || data!.items.length === 0) break;
  }
  return archives.map(toDocument);
}
