import { ApiError } from "../../lib/http.ts";
export interface ArchiveSource { streamId: string; ministryId: string; folderId: string }
export function archiveSources(): ArchiveSource[] {
  try {
    const value: unknown = JSON.parse(process.env.ARCHIVE_SOURCE_CONFIG ?? "[]");
    if (!Array.isArray(value) || !value.length) throw Error();
    const streams = new Set<string>();
    const folders = new Set<string>();
    for (const item of value) {
      if (!item || typeof item !== "object" || Object.keys(item).sort().join(",") !== "folderId,ministryId,streamId") throw Error();
      for (const key of ["streamId", "ministryId", "folderId"]) if (typeof item[key] !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(item[key])) throw Error();
      if (streams.has(item.streamId) || folders.has(item.folderId)) throw Error();
      streams.add(item.streamId); folders.add(item.folderId);
    }
    return value;
  } catch { throw new ApiError(503, "ARCHIVE_SOURCES_NOT_CONFIGURED", "Valid archive source registration is required."); }
}
