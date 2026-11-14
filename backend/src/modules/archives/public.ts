import { ApiError, defineHandler } from "../../lib/http.ts";
import { driveReader, DriveSourceMissing } from "../../integrations/drive-reader.ts";
import type { DriveReader } from "../../integrations/drive-reader.ts";
import { getArchiveStore } from "./store.ts";
import { isArchiveVisible } from "./models.ts";
import type { ArchiveRecord } from "./models.ts";

const visibleQuery = { sourceState: "VALID" as const, manualHidden: false, snapshot: { $ne: null }, "snapshot.pdf.publicReadable": true };

function notFound() { return new ApiError(404, "ARCHIVE_NOT_FOUND", "The archive document was not found."); }

function recordId(request: Request): string {
  const parts = new URL(request.url).pathname.split("/");
  const id = parts.at(-1) === "open" ? parts.at(-2) : parts.at(-1);
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw notFound();
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
  const rawLimit = url.searchParams.get("limit") ?? "20";
  const rawOffset = url.searchParams.get("offset") ?? "0";
  const limit = Number(rawLimit);
  const offset = Number(rawOffset);
  if (!/^\d+$/.test(rawLimit) || !/^\d+$/.test(rawOffset) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 10000) {
    throw new ApiError(400, "INVALID_PAGINATION", "Use limit 1–100 and offset 0–10000.");
  }
  // Search/grouping/filter contracts still need FE agreement. Reject unsupported
  // parameters instead of silently implying that filtering was performed.
  if ([...url.searchParams.keys()].some((key) => !["limit", "offset"].includes(key))) {
    throw new ApiError(400, "UNSUPPORTED_QUERY", "Only limit and offset are currently supported.");
  }
  const { archives } = await getArchiveStore();
  const [records, total] = await Promise.all([
    archives.find(visibleQuery).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(limit).toArray(),
    archives.countDocuments(visibleQuery),
  ]);
  return { items: records.map(publicArchive), total, limit, offset };
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
