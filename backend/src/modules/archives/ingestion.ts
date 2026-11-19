import { randomUUID } from "node:crypto";
import type { ClientSession } from "mongodb";
import { ApiError } from "../../lib/http.ts";
import { sourceTransaction } from "../../lib/transaction.ts";
import type { ArchiveRecord, ArchiveSyncLog, IngestionOutcome } from "./models.ts";
import { getArchiveStore, type ArchiveStore } from "./store.ts";
import { payloadHash, validateObservation, type ArchiveObservation } from "./validation.ts";

function safeField(input: unknown, key: string): string {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : "unknown";
}

function storeUnavailable(message = "Transactional archive storage is unavailable."): ApiError {
  return new ApiError(503, "ARCHIVE_STORE_UNAVAILABLE", message);
}

export async function logInvalidObservation(input: unknown, reason: string, receivedAt = new Date(), store?: ArchiveStore) {
  try {
    const target = store ?? await getArchiveStore();
    const metadataFileId = safeField(input, "metadataFileId");
    await target.syncLogs.insertOne({
      _id: randomUUID(), streamId: safeField(input, "streamId"), deliveryId: safeField(input, "deliveryId"),
      externalSubmissionId: metadataFileId === "unknown" ? null : metadataFileId, scanSequence: safeField(input, "scanSequence"),
      receivedAt, sourceCheckedAt: null, observation: "INVALID_REQUEST", outcome: "invalid", reason,
    });
  } catch { throw storeUnavailable("Archive storage is unavailable."); }
}

// Rules that refuse an observation without touching the record, in order.
// Null means the observation may be applied.
function rejection(current: ArchiveRecord | null, value: ArchiveObservation): IngestionOutcome | null {
  if (current && (current.streamId !== value.streamId || current.ministryId !== value.source.ministryId || current.sourceFolderId !== value.folderId)) {
    return "conflict"; // Cross-source identity takeover.
  }
  if (value.observation === "SYNC_ERROR") return "unchanged"; // Never proves absence.
  if (!current) return null;
  if (BigInt(value.scanSequence) <= BigInt(current.scanSequence)) return "stale";
  if (current.metadataDriveVersion !== null && value.metadataDriveVersion !== null && BigInt(value.metadataDriveVersion) < BigInt(current.metadataDriveVersion)) {
    return "conflict"; // A higher sequence with an older Drive version is inconsistent.
  }
  // Replacement PDFs must receive a new Drive identity. A later scan cannot
  // silently bless changed bytes under the existing file ID.
  if (current.snapshot && value.snapshot && current.snapshot.pdf.driveFileId === value.snapshot.pdf.driveFileId &&
    current.snapshot.pdf.sha256 !== value.snapshot.pdf.sha256) return "conflict";
  return null;
}

function nextRecord(current: ArchiveRecord | null, value: ArchiveObservation, receivedAt: Date): { record: ArchiveRecord; changed: boolean } {
  const state = value.observation as ArchiveRecord["sourceState"];
  const suppressionReason = state !== "VALID" ? state : value.snapshot?.pdf.publicReadable ? null : "PDF_NOT_PUBLIC";
  const changed = !current || current.sourceState !== state || current.suppressionReason !== suppressionReason ||
    (value.snapshot !== null && current.snapshot?.fingerprint !== value.snapshot.fingerprint);
  const record: ArchiveRecord = {
    _id: current?._id ?? randomUUID(), externalSubmissionId: value.metadataFileId,
    ministryId: value.source.ministryId, sourceFolderId: value.folderId, streamId: value.streamId,
    metadataDriveVersion: value.metadataDriveVersion ?? current?.metadataDriveVersion ?? null,
    scanSequence: value.scanSequence, sourceState: state, suppressionReason,
    manualHidden: current?.manualHidden ?? false,
    snapshot: value.snapshot ?? current?.snapshot ?? null,
    generation: (current?.generation ?? 0) + (changed ? 1 : 0),
    lastSourceCheckedAt: new Date(value.sourceCheckedAt), lastReceivedAt: receivedAt,
    createdAt: current?.createdAt ?? receivedAt, updatedAt: changed ? receivedAt : current!.updatedAt,
  };
  return { record, changed };
}

// One transaction commits the record, the delivery ledger entry and the
// final attempt outcome together.
async function commitObservation(store: ArchiveStore, value: ArchiveObservation, hash: string, logId: string, receivedAt: Date, session: ClientSession) {
  const prior = await store.deliveries.findOne({ streamId: value.streamId, $or: [{ deliveryId: value.deliveryId }, { scanSequence: value.scanSequence }] }, { session });
  let outcome: IngestionOutcome;
  if (prior) {
    outcome = prior.payloadHash === hash ? "duplicate" : "conflict";
  } else {
    const current = await store.archives.findOne({ externalSubmissionId: value.metadataFileId }, { session });
    const refused = rejection(current, value);
    if (refused) {
      outcome = refused;
    } else {
      const { record, changed } = nextRecord(current, value, receivedAt);
      if (current) await store.archives.replaceOne({ _id: current._id }, record, { session });
      else await store.archives.insertOne(record, { session });
      outcome = changed ? "applied" : "unchanged";
    }
    await store.deliveries.insertOne({ _id: randomUUID(), streamId: value.streamId, deliveryId: value.deliveryId, scanSequence: value.scanSequence, payloadHash: hash, receivedAt }, { session });
  }
  const incompleteScan = value.observation === "SYNC_ERROR" && outcome === "unchanged";
  await store.syncLogs.updateOne({ _id: logId }, incompleteScan
    ? { $set: { outcome, reason: "SCAN_INCOMPLETE" } }
    : { $set: { outcome }, $unset: { reason: "" } }, { session });
  return outcome;
}

export async function ingestArchive(input: unknown, receivedAt = new Date()) {
  let value;
  try { value = validateObservation(input); }
  catch (error) {
    await logInvalidObservation(input, error instanceof ApiError ? error.code : "INVALID_ARCHIVE_OBSERVATION", receivedAt);
    throw error;
  }
  // The attempt is logged before the transaction, so an interrupted attempt
  // stays visible as PROCESSING_NOT_COMMITTED.
  const log: ArchiveSyncLog = {
    _id: randomUUID(), streamId: value.streamId, deliveryId: value.deliveryId, externalSubmissionId: value.metadataFileId,
    scanSequence: value.scanSequence, receivedAt, sourceCheckedAt: new Date(value.sourceCheckedAt),
    observation: value.observation, outcome: "invalid", reason: "PROCESSING_NOT_COMMITTED",
  };
  try {
    const store = await getArchiveStore();
    await store.syncLogs.insertOne(log);
    const hash = payloadHash(value);
    let outcome: IngestionOutcome;
    try {
      outcome = await sourceTransaction(session => commitObservation(store, value, hash, log._id, receivedAt, session));
    } catch (error) {
      await store.syncLogs.updateOne({ _id: log._id }, { $set: { outcome: "invalid", reason: "TRANSACTION_UNAVAILABLE" } });
      throw error;
    }
    return { outcome, receivedAt: receivedAt.toISOString() };
  } catch { throw storeUnavailable(); }
}
