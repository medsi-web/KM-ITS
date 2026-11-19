import { cache } from "react";
import { archivesList } from "@kmits/backend";
import { groupArchives, type PublicArchive } from "./groups";

const PAGE_SIZE = 100; // the API's maximum

/**
 * Every visible archive document, grouped by ministry. Calls the public
 * `GET /api/archives` handler in-process, so the backend contract (visibility
 * rules, 503 before setup) applies unchanged. Throws when the API errors. The
 * backend import is server-only, so this module cannot reach a Client Component.
 */
export const getGroups = cache(async () => {
  const archives: PublicArchive[] = [];
  // shortcut: the API caps offset at 10000, so at most ~10k documents load; add
  // server-side grouping to the API before the archive can grow past that.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const response = await archivesList(
      new Request(`http://localhost/api/archives?limit=${PAGE_SIZE}&offset=${offset}`),
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.code ?? `archives ${response.status}`);
    archives.push(...body.data.items);
    if (archives.length >= body.data.total || body.data.items.length === 0) break;
  }
  return groupArchives(archives);
});

export async function getGroup(slug: string) {
  return (await getGroups()).find((g) => g.slug === slug);
}
