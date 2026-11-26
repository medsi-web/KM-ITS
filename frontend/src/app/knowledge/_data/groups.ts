/** One item of `GET /api/knowledge-groups` (see `publicGroup` in the backend). */
export type KnowledgeGroup = {
  slug: string;
  name: string;
  /** Page heading; empty means use `name`. */
  title: string;
  description: string;
  driveUrl: string;
  documentCount: number;
  lastDocumentAt: string | null;
  /** Last group edit, not last document. */
  updatedAt: string;
  documentsUrl: string;
};

/** One item of `GET /api/archives` (see `publicArchive` in the backend). */
export type PublicArchive = {
  id: string;
  title: string;
  category: string;
  year: number | null;
  authors: string[];
  /** Redirects to the verified PDF on Drive. */
  openUrl: string;
};

export type KnowledgeDocument = {
  id: string;
  name: string;
  meta: string;
  openUrl: string;
};

export const toDocument = (a: PublicArchive): KnowledgeDocument => ({
  id: a.id,
  name: a.title,
  meta:
    [a.category, a.year, a.authors.join(", ")].filter(Boolean).join(" • ") || "Dokumen PDF",
  openUrl: a.openUrl,
});

export const sortOptions = [
  { value: "relevansi", label: "Relevansi" },
  { value: "terbaru", label: "Terbaru" },
  { value: "nama", label: "Nama" },
] as const;

export type SortValue = (typeof sortOptions)[number]["value"];

/** The API answers 400 to the UI's sort words. */
export const apiSort: Record<SortValue, "order" | "newest" | "name"> = {
  relevansi: "order",
  terbaru: "newest",
  nama: "name",
};

export function parseSort(value: string | undefined): SortValue {
  return sortOptions.some((o) => o.value === value)
    ? (value as SortValue)
    : "relevansi";
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
