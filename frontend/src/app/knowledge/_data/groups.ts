/**
 * Sample data for the KM ITS Knowledge pages. Every group points at a Google
 * Drive folder; replace this module with the real source when it exists.
 */

export type KnowledgeGroup = {
  slug: string;
  /** Name shown on the list card. */
  name: string;
  /** Heading on the group page, when it differs from `name`. */
  title?: string;
  summary: string;
  documentCount: number;
  /** ISO date (UTC). */
  updatedAt: string;
  driveUrl: string;
};

export type KnowledgeDocument = {
  name: string;
  meta: string;
  type: "PDF" | "DOCX";
  size: string;
};

export const groups: KnowledgeGroup[] = [
  {
    slug: "kastrat-kebijakan-publik",
    name: "Kastrat & Kebijakan Publik",
    title: "Kajian Strategis & Kebijakan Kampus",
    summary: "Kajian strategis nasional, notula konsolidasi isu…",
    documentCount: 34,
    updatedAt: "2026-03-14",
    driveUrl: "https://drive.google.com",
  },
  {
    slug: "advokasi-kesejahteraan-mahasiswa",
    name: "Advokasi & Kesejahteraan Mahasiswa",
    summary: "Panduan banding UKT, berkas beasiswa terpadu,…",
    documentCount: 52,
    updatedAt: "2026-03-12",
    driveUrl: "https://drive.google.com",
  },
  {
    slug: "kaderisasi-psdm",
    name: "Kaderisasi & PSDM",
    summary: "Silabus LKMM tingkat dasar dan madya, rubrik evaluasi…",
    documentCount: 28,
    updatedAt: "2026-03-10",
    driveUrl: "https://drive.google.com",
  },
];

export const groupDescription =
  "Deskripsi lengkap group: topik yang dibahas, jenis dokumen di dalamnya, dan siapa yang dapat memanfaatkannya. Berisi penjelasan komprehensif mengenai latar belakang penyusunan arsip, panduan teknis, serta pedoman implementasi kegiatan organisasi dilingkungan KM ITS.";

export const documents: KnowledgeDocument[] = [
  {
    name: "Draft Pedoman Advokasi & Banding UKT 2026.pdf",
    meta: "Diupload oleh Kemensospol • Salinan Resmi",
    type: "PDF",
    size: "2.4 MB",
  },
  {
    name: "Template Naskah Kajian Kebijakan Publik KM ITS.docx",
    meta: "Format Baku Rilis Sikap Terbuka",
    type: "DOCX",
    size: "840 KB",
  },
  {
    name: "Rekapitulasi Notula Audiensi Rektorat Q1 2026.pdf",
    meta: "Arsip Notulensi BEM KM ITS & Ditmawa",
    type: "PDF",
    size: "1.2 MB",
  },
  {
    name: "Panduan Prosedur Standar Operasional Ormawa.pdf",
    meta: "Revisi Regulasi Tata Kelola Sekretariat",
    type: "PDF",
    size: "3.1 MB",
  },
];

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

export function getGroup(slug: string) {
  return groups.find((g) => g.slug === slug);
}

/** Case-insensitive match on name, title and summary, ordered by `sort`. */
export function searchGroups(query: string, sort: SortValue) {
  const q = query.trim().toLowerCase();
  const rank = (g: KnowledgeGroup) =>
    g.name.toLowerCase().includes(q) || g.title?.toLowerCase().includes(q)
      ? 0
      : 1;

  const found = q
    ? groups.filter((g) =>
        [g.name, g.title ?? "", g.summary].some((t) =>
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
