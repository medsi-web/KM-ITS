import { payloadHash } from "../../lib/canonical.ts";
import { ApiError } from "../../lib/http.ts";
import type { ArchiveSnapshot } from "./models.ts";
import { archiveSources, type ArchiveSource } from "./sources.ts";

export { payloadHash };

export type ObservationKind = "VALID" | "INVALID" | "MISSING" | "UNAVAILABLE" | "SYNC_ERROR";
export interface ArchiveObservation {
  protocolVersion: 1; streamId: string; deliveryId: string; scanSequence: string; metadataFileId: string;
  metadataDriveVersion: string | null; observation: ObservationKind;
  sourceCheckedAt: string; folderId: string; snapshot: ArchiveSnapshot | null; source: ArchiveSource; diagnostics?: string;
}

const ENVELOPE_KEYS = ["protocolVersion", "streamId", "deliveryId", "scanSequence", "metadataFileId", "metadataDriveVersion",
  "observation", "sourceCheckedAt", "folderId", "diagnostics", "metadata", "pdf"];
const METADATA_KEYS = ["schemaVersion", "driveFileId", "title", "description", "category", "year", "authors"];
const PDF_KEYS = ["driveFileId", "mimeType", "sha256", "size", "name", "publicReadable", "folderId"];
const KINDS: ObservationKind[] = ["VALID", "INVALID", "MISSING", "UNAVAILABLE", "SYNC_ERROR"];
const CHECKED_AT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/;

// Every schema or source violation maps to one 422 code; the reason is never echoed.
function invalid(): never {
  throw new ApiError(422, "INVALID_ARCHIVE_OBSERVATION", "Archive observation does not match the ingestion schema or registered source.");
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) invalid();
  return value as Record<string, unknown>;
}

// Trimmed text without control characters; `empty` allows blank values.
function string(value: unknown, max: number, empty = false): string {
  if (typeof value !== "string" || value.length > max || (!empty && !value.trim()) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) invalid();
  return value.trim();
}

function id(value: unknown): string {
  const result = string(value, 200);
  if (!/^[A-Za-z0-9_-]+$/.test(result)) invalid();
  return result;
}

// Canonical unsigned decimal strings, compared later as BigInt.
export function decimal(value: unknown): string {
  if (typeof value !== "string" || !/^(0|[1-9][0-9]{0,99})$/.test(value)) invalid();
  return value;
}

function optionalText(value: unknown, max: number): string {
  return string(value === undefined ? "" : value, max, true);
}

function normalizeMetadata(metadata: Record<string, unknown>, pdfId: string): ArchiveSnapshot["metadata"] {
  if (metadata.schemaVersion !== 1 || id(metadata.driveFileId) !== pdfId) invalid();
  const year = metadata.year ?? null;
  if (year !== null && (!Number.isInteger(year) || (year as number) < 1900 || (year as number) > 9999)) invalid();
  const authors = metadata.authors === undefined ? [] : metadata.authors;
  if (!Array.isArray(authors) || authors.length > 30) invalid();
  return {
    schemaVersion: 1, driveFileId: pdfId,
    title: string(metadata.title, 300),
    description: optionalText(metadata.description, 5000),
    category: optionalText(metadata.category, 100),
    year: year as number | null,
    authors: authors.map(author => string(author, 200)),
  };
}

function normalizePdf(pdf: Record<string, unknown>, folderId: string): ArchiveSnapshot["pdf"] {
  if (pdf.mimeType !== "application/pdf" || typeof pdf.publicReadable !== "boolean" || id(pdf.folderId) !== folderId) invalid();
  if (typeof pdf.sha256 !== "string" || !/^[a-fA-F0-9]{64}$/.test(pdf.sha256)) invalid();
  if (pdf.size !== undefined && (!Number.isSafeInteger(pdf.size) || (pdf.size as number) < 1)) invalid();
  return {
    driveFileId: id(pdf.driveFileId), mimeType: "application/pdf", sha256: pdf.sha256.toLowerCase(),
    ...(pdf.size !== undefined ? { size: pdf.size as number } : {}),
    ...(pdf.name !== undefined ? { name: string(pdf.name, 300) } : {}),
    publicReadable: pdf.publicReadable,
  };
}

// VALID observations carry the full metadata and PDF binding; the metadata's
// PDF reference must equal the observed PDF in the same registered folder.
function normalizeSnapshot(value: Record<string, unknown>, folderId: string): ArchiveSnapshot {
  if (value.metadataDriveVersion === null) invalid();
  const pdf = normalizePdf(object(value.pdf, PDF_KEYS), folderId);
  const metadata = normalizeMetadata(object(value.metadata, METADATA_KEYS), pdf.driveFileId);
  const normalized = { metadata, pdf };
  return { ...normalized, fingerprint: payloadHash(normalized) };
}

export function validateObservation(input: unknown): ArchiveObservation {
  const registrations = archiveSources();
  const value = object(input, ENVELOPE_KEYS);
  if (value.protocolVersion !== 1) invalid();
  const streamId = id(value.streamId);
  const folderId = id(value.folderId);
  const source = registrations.find(item => item.streamId === streamId && item.folderId === folderId);
  if (!source) invalid();
  const observation = value.observation as ObservationKind;
  if (!KINDS.includes(observation)) invalid();
  const sourceCheckedAt = string(value.sourceCheckedAt, 40);
  if (!CHECKED_AT.test(sourceCheckedAt) || !Number.isFinite(Date.parse(sourceCheckedAt))) invalid();
  const diagnostics = value.diagnostics === undefined ? undefined : string(value.diagnostics, 2000, true);
  let snapshot: ArchiveSnapshot | null = null;
  if (observation === "VALID") snapshot = normalizeSnapshot(value, folderId);
  else if (value.metadata !== undefined || value.pdf !== undefined) invalid();
  return {
    protocolVersion: 1, streamId,
    deliveryId: id(value.deliveryId),
    scanSequence: decimal(value.scanSequence),
    metadataFileId: id(value.metadataFileId),
    metadataDriveVersion: value.metadataDriveVersion === null ? null : decimal(value.metadataDriveVersion),
    observation,
    sourceCheckedAt: new Date(sourceCheckedAt).toISOString(),
    folderId, snapshot, source,
    ...(diagnostics !== undefined ? { diagnostics } : {}),
  };
}
