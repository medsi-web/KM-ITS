import { ApiError, defineHandler } from "../../lib/http.ts";
import { filterValue, findPage, readPagination, rejectUnknownQuery, searchPattern } from "../../lib/pagination.ts";
import { pathId, UUID_PATTERN } from "../../lib/request.ts";
import { driveReader, DriveSourceMissing } from "../../integrations/drive-reader.ts";
import type { DriveReader } from "../../integrations/drive-reader.ts";
import { getArchiveStore } from "./store.ts";
import { isArchiveVisible } from "./models.ts";
import type { ArchiveRecord } from "./models.ts";

// Case-insensitive collation keeps title ordering natural and makes filters
// case-insensitive; knowledge group counts use the same rules.
export const ARCHIVE_LIST_COLLATION = { locale: "id", strength: 2 };
export const visibleQuery = { sourceState: "VALID" as const, manualHidden: false, snapshot: { $ne: null }, "snapshot.pdf.publicReadable": true };

function notFound() { return new ApiError(404, "ARCHIVE_NOT_FOUND", "The archive document was not found."); }

function recordId(request: Request): string {
  const id = pathId(request, "open");
  if (!id || !UUID_PATTERN.test(id)) throw notFound();
  return id;
}

export function publicArchive(record: ArchiveRecord) {
  const metadata = record.snapshot!.metadata;
  return {
    id: record._id, title: metadata.title, description: metadata.description,
    category: metadata.category, year: metadata.year, authors: metadata.authors,
    ministryId: record.ministryId, updatedAt: record.updatedAt,
    openUrl: `/api/archives/${record._id}/open`,
  };
}

const LIST_QUERY = ["limit", "offset", "ministryId", "category", "year", "q", "sort"] as const;
const SORTS = {
  newest: { updatedAt: -1, _id: 1 },
  oldest: { updatedAt: 1, _id: 1 },
  title: { "snapshot.metadata.title": 1, _id: 1 },
} as const;

function invalidFilter(message: string): never { throw new ApiError(400, "INVALID_FILTER", message); }

// Exact filters on ministry/category/year, a case-insensitive substring search
// over title, description, category and authors, and a fixed set of sort orders.
export function archiveListQuery(url: URL) {
  rejectUnknownQuery(url, LIST_QUERY);
  const filter: Record<string, unknown> = { ...visibleQuery };
  const ministryId = filterValue(url, "ministryId", 200);
  if (ministryId !== undefined) filter.ministryId = ministryId;
  const category = filterValue(url, "category", 100);
  // Equality is case-insensitive through the list collation.
  if (category !== undefined) filter["snapshot.metadata.category"] = category.trim();
  const year = url.searchParams.get("year");
  if (year !== null) {
    if (!/^\d{4}$/.test(year) || Number(year) < 1900) invalidFilter("year must be a four-digit year from 1900.");
    filter["snapshot.metadata.year"] = Number(year);
  }
  const q = filterValue(url, "q", 100)?.trim();
  if (q) {
    const pattern = searchPattern(q);
    filter.$or = ["title", "description", "category", "authors"].map(field => ({ [`snapshot.metadata.${field}`]: pattern }));
  }
  const sortName = url.searchParams.get("sort") ?? "newest";
  if (!Object.hasOwn(SORTS, sortName)) invalidFilter(`sort must be one of: ${Object.keys(SORTS).join(", ")}.`);
  return { filter, sort: SORTS[sortName as keyof typeof SORTS] };
}

export const archivesList = defineHandler("archives.list", async (request) => {
  const url = new URL(request.url);
  const page = readPagination(url, 20, 100);
  const { filter, sort } = archiveListQuery(url);
  const { archives } = await getArchiveStore();
  return findPage(archives, filter, sort, page, publicArchive, ARCHIVE_LIST_COLLATION);
});

export const archivesDetail = defineHandler("archives.detail", async (request) => {
  const { archives } = await getArchiveStore();
  const record = await archives.findOne({ _id: recordId(request), ...visibleQuery });
  if (!record) throw notFound();
  return publicArchive(record);
});

export function createArchiveOpen(reader: DriveReader = driveReader) {
  return defineHandler("archives.open", async (request) => {
    const id = recordId(request);
    const store = await getArchiveStore();
    for (let attempt = 0; attempt < 2; attempt++) {
      const record = await store.archives.findOne({ _id: id });
      if (!record || !isArchiveVisible(record) || !record.snapshot) throw notFound();
      try {
        await reader.inspectPdf(record.snapshot.pdf.driveFileId, record.snapshot.pdf.sha256, record.sourceFolderId);
      } catch (error) {
        if (!(error instanceof DriveSourceMissing)) throw error;
        const update = await store.archives.updateOne({ _id: id, generation: record.generation }, {
          $set: { sourceState: "UNAVAILABLE", suppressionReason: error.reason, updatedAt: new Date() },
          $inc: { generation: 1 },
        });
        if (!update.matchedCount) continue; // Source changed while Drive was checked.
        throw notFound();
      }
      const current = await store.archives.findOne({ _id: id, generation: record.generation, ...visibleQuery });
      if (!current) continue;
      const location = `https://drive.google.com/file/d/${encodeURIComponent(record.snapshot.pdf.driveFileId)}/view`;
      return new Response(null, { status: 302, headers: { Location: location, "Referrer-Policy": "no-referrer" } });
    }
    throw new ApiError(503, "ARCHIVE_CHANGING", "The document changed during verification. Please try again.");
  });
}

export const archivesOpen = createArchiveOpen();
