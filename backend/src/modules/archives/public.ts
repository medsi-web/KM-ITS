import { ApiError, defineHandler } from "../../lib/http.ts";
import { findPage, readPagination, rejectUnknownQuery } from "../../lib/pagination.ts";
import { pathId, UUID_PATTERN } from "../../lib/request.ts";
import { driveReader, DriveSourceMissing } from "../../integrations/drive-reader.ts";
import type { DriveReader } from "../../integrations/drive-reader.ts";
import { getArchiveStore } from "./store.ts";
import { isArchiveVisible } from "./models.ts";
import type { ArchiveRecord } from "./models.ts";

const visibleQuery = { sourceState: "VALID" as const, manualHidden: false, snapshot: { $ne: null }, "snapshot.pdf.publicReadable": true };

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

export const archivesList = defineHandler("archives.list", async (request) => {
  const url = new URL(request.url);
  const page = readPagination(url, 20, 100);
  // Search/grouping/filter contracts still need FE agreement. Reject unsupported
  // parameters instead of silently implying that filtering was performed.
  rejectUnknownQuery(url, ["limit", "offset"]);
  const { archives } = await getArchiveStore();
  return findPage(archives, visibleQuery, { updatedAt: -1, _id: 1 }, page, publicArchive);
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
