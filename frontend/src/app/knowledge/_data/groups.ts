/**
 * Knowledge groups for the KM ITS Knowledge pages. The archives API has no
 * "group" concept, so a group is the set of visible archive documents that
 * share a `ministryId`. Pure helpers only; the fetch lives in `archives.ts`.
 */

/** One item of `GET /api/archives` (see `publicArchive` in the backend). */
export type PublicArchive = {
  id: string;
  title: string;
  description: string;
  category: string;
  year: number | null;
  authors: string[];
  ministryId: string;
  /** ISO timestamp. */
  updatedAt: string;
  /** Redirects to the verified PDF on Drive. */
  openUrl: string;
};

export type KnowledgeDocument = {
  id: string;
  name: string;
  meta: string;
  category: string;
  openUrl: string;
};

export type KnowledgeGroup = {
  /** The ministry id. */
  slug: string;
  name: string;
  summary: string;
  documentCount: number;
  /** ISO timestamp of the newest document. */
  updatedAt: string;
  documents: KnowledgeDocument[];
};

// shortcut: the API gives only an opaque ministryId, so the display name is
// derived from it; add a label map when the real ministry ids are known.
const humanize = (id: string) =>
  id
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");

/** Group archives by ministry. Documents keep the API order (newest first). */
export function groupArchives(archives: PublicArchive[]): KnowledgeGroup[] {
  const byMinistry = new Map<string, PublicArchive[]>();
  for (const a of archives) {
    byMinistry.set(a.ministryId, [...(byMinistry.get(a.ministryId) ?? []), a]);
  }

  return [...byMinistry].map(([ministryId, items]) => ({
    slug: ministryId,
    name: humanize(ministryId),
    summary: items.slice(0, 2).map((a) => a.title).join(", "),
    documentCount: items.length,
    updatedAt: items.reduce((m, a) => (a.updatedAt > m ? a.updatedAt : m), ""),
    documents: items.map((a) => ({
      id: a.id,
      name: a.title,
      meta:
        [a.category, a.year, a.authors.join(", ")].filter(Boolean).join(" • ") ||
        "Dokumen PDF",
      category: a.category,
      openUrl: a.openUrl,
    })),
  }));
}

export const sortOptions = [
  { value: "relevansi", label: "Relevansi" },
  { value: "terbaru", label: "Terbaru" },
  { value: "nama", label: "Nama" },
] as const;

export type SortValue = (typeof sortOptions)[number]["value"];

export function parseSort(value: string | undefined): SortValue {
  return sortOptions.some((o) => o.value === value)
    ? (value as SortValue)
    : "relevansi";
}

/** Case-insensitive match on group name, summary and document titles, ordered by `sort`. */
export function searchGroups(
  groups: KnowledgeGroup[],
  query: string,
  sort: SortValue,
) {
  const q = query.trim().toLowerCase();
  const rank = (g: KnowledgeGroup) => (g.name.toLowerCase().includes(q) ? 0 : 1);

  const found = q
    ? groups.filter((g) =>
        [g.name, g.summary, ...g.documents.map((d) => d.name)].some((t) =>
          t.toLowerCase().includes(q),
        ),
      )
    : [...groups];

  if (sort === "terbaru") {
    found.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } else if (sort === "nama") {
    found.sort((a, b) => a.name.localeCompare(b.name, "id"));
  } else if (q) {
    found.sort((a, b) => rank(a) - rank(b));
  }
  return found;
}

const shortDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

const longDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

export const formatShortDate = (iso: string) => shortDate.format(new Date(iso));
export const formatLongDate = (iso: string) => longDate.format(new Date(iso));
