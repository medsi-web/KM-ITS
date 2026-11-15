import { payloadHash } from "../../lib/canonical.ts";
import { ApiError } from "../../lib/http.ts";
import type { ArchiveSnapshot } from "./models.ts";
import { archiveSources, type ArchiveSource } from "./sources.ts";
export interface ArchiveObservation {
  protocolVersion: 1; streamId: string; deliveryId: string; scanSequence: string; metadataFileId: string;
  metadataDriveVersion: string | null; observation: "VALID" | "INVALID" | "MISSING" | "UNAVAILABLE" | "SYNC_ERROR";
  sourceCheckedAt: string; folderId: string; snapshot: ArchiveSnapshot | null; source: ArchiveSource; diagnostics?: string;
}
function invalid(): never { throw new ApiError(422, "INVALID_ARCHIVE_OBSERVATION", "Archive observation does not match the ingestion schema or registered source."); }
function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}
function string(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid();
  return value.trim();
}
function id(value: unknown): string { const result = string(value, 200); if (!/^[A-Za-z0-9_-]+$/.test(result)) invalid(); return result; }
export function decimal(value: unknown): string { if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,99})$/.test(value)) invalid(); return value; }
export { payloadHash };
export function validateObservation(input: unknown): ArchiveObservation {
  const registrations = archiveSources();
  const value = object(input, ["protocolVersion", "streamId", "deliveryId", "scanSequence", "metadataFileId", "metadataDriveVersion", "observation", "sourceCheckedAt", "folderId", "diagnostics", "metadata", "pdf"]);
  if (value.protocolVersion !== 1) invalid();
  const streamId = id(value.streamId), folderId = id(value.folderId);
  const source = registrations.find(item => item.streamId === streamId && item.folderId === folderId);
  if (!source) invalid();
  const observation = value.observation as ArchiveObservation["observation"];
  if (!["VALID", "INVALID", "MISSING", "UNAVAILABLE", "SYNC_ERROR"].includes(observation)) invalid();
  const sourceCheckedAt = string(value.sourceCheckedAt, 40);
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(sourceCheckedAt) || !Number.isFinite(Date.parse(sourceCheckedAt))) invalid();
  if (value.diagnostics !== undefined) string(value.diagnostics, 2000, true);
  let snapshot: ArchiveSnapshot | null = null;
  if (observation === "VALID") {
    if (value.metadataDriveVersion === null) invalid();
    const metadata = object(value.metadata, ["schemaVersion", "driveFileId", "title", "description", "category", "year", "authors"]);
    const pdf = object(value.pdf, ["driveFileId", "mimeType", "sha256", "size", "name", "publicReadable", "folderId"]);
    if (metadata.schemaVersion !== 1 || pdf.mimeType !== "application/pdf" || typeof pdf.publicReadable !== "boolean" || id(pdf.folderId) !== folderId) invalid();
    if (metadata.year !== undefined && metadata.year !== null && (!Number.isInteger(metadata.year) || (metadata.year as number) < 1900 || (metadata.year as number) > 9999)) invalid();
    const authors = metadata.authors === undefined ? [] : metadata.authors;
    if (!Array.isArray(authors) || authors.length > 30) invalid();
    const pdfId = id(pdf.driveFileId);
    if (id(metadata.driveFileId) !== pdfId || typeof pdf.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(pdf.sha256)) invalid();
    if (pdf.size !== undefined && (!Number.isSafeInteger(pdf.size) || (pdf.size as number) < 1)) invalid();
    const normalized = {
      metadata: { schemaVersion: 1 as const, driveFileId: pdfId, title: string(metadata.title, 300), description: string(metadata.description === undefined ? "" : metadata.description, 5000, true), category: string(metadata.category === undefined ? "" : metadata.category, 100, true), year: (metadata.year ?? null) as number | null, authors: authors.map(author => string(author, 200)) },
      pdf: { driveFileId: pdfId, mimeType: "application/pdf" as const, sha256: pdf.sha256.toLowerCase(), ...(pdf.size !== undefined ? { size: pdf.size as number } : {}), ...(pdf.name !== undefined ? { name: string(pdf.name, 300) } : {}), publicReadable: pdf.publicReadable },
    };
    snapshot = { ...normalized, fingerprint: payloadHash(normalized) };
  } else if (value.metadata !== undefined || value.pdf !== undefined) invalid();
  return { protocolVersion: 1, streamId, deliveryId: id(value.deliveryId), scanSequence: decimal(value.scanSequence), metadataFileId: id(value.metadataFileId), metadataDriveVersion: value.metadataDriveVersion === null ? null : decimal(value.metadataDriveVersion), observation, sourceCheckedAt: new Date(sourceCheckedAt).toISOString(), folderId, snapshot, source, ...(value.diagnostics !== undefined ? { diagnostics: string(value.diagnostics, 2000, true) } : {}) };
}
