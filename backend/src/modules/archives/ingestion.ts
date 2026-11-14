import { randomUUID } from "node:crypto";
import { getMongoClient } from "../../lib/database.ts";
import { ApiError } from "../../lib/http.ts";
import type { ArchiveRecord, ArchiveSyncLog, IngestionOutcome } from "./models.ts";
import { getArchiveStore, type ArchiveStore } from "./store.ts";
import { payloadHash, validateObservation } from "./validation.ts";

function safeField(input: unknown, key: string): string {
  const value = input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,200}$/.test(value) ? value : "unknown";
}
export async function logInvalidObservation(input: unknown, reason: string, receivedAt = new Date(), store?: ArchiveStore) {
  try {
    const target = store ?? await getArchiveStore();
    await target.syncLogs.insertOne({ _id: randomUUID(), streamId: safeField(input, "streamId"), deliveryId: safeField(input, "deliveryId"), externalSubmissionId: safeField(input, "metadataFileId") === "unknown" ? null : safeField(input, "metadataFileId"), scanSequence: safeField(input, "scanSequence"), receivedAt, sourceCheckedAt: null, observation: "INVALID_REQUEST", outcome: "invalid", reason });
  } catch { throw new ApiError(503, "ARCHIVE_STORE_UNAVAILABLE", "Archive storage is unavailable."); }
}
export async function ingestArchive(input: unknown, receivedAt = new Date()) {
  let observation;
  try { observation = validateObservation(input); }
  catch (error) { await logInvalidObservation(input, error instanceof ApiError ? error.code : "INVALID_ARCHIVE_OBSERVATION", receivedAt); throw error; }
  const value = observation;
  const log: ArchiveSyncLog = { _id: randomUUID(), streamId: value.streamId, deliveryId: value.deliveryId, externalSubmissionId: value.metadataFileId, scanSequence: value.scanSequence, receivedAt, sourceCheckedAt: new Date(value.sourceCheckedAt), observation: value.observation, outcome: "invalid", reason: "PROCESSING_NOT_COMMITTED" };
  try {
    const store = await getArchiveStore();
    await store.syncLogs.insertOne(log);
    const finish = async (outcome: IngestionOutcome, reason?: string) => {
      await store.syncLogs.updateOne({ _id: log._id }, { $set: { outcome, ...(reason ? { reason } : {}) }, ...(!reason ? { $unset: { reason: "" } } : {}) });
      return { outcome, receivedAt: receivedAt.toISOString() };
    };
    const hash = payloadHash(value);
    const client = await getMongoClient();
    for (let attempt = 0; attempt < 4; attempt++) {
      const session = client.startSession();
      try {
        const outcome = await session.withTransaction(async (): Promise<IngestionOutcome> => {
          const prior = await store.deliveries.findOne({ streamId: value.streamId, $or: [{ deliveryId: value.deliveryId }, { scanSequence: value.scanSequence }] }, { session });
          let result: IngestionOutcome;
          if (prior) result = prior.payloadHash === hash ? "duplicate" : "conflict";
          else {
            const current = await store.archives.findOne({ externalSubmissionId: value.metadataFileId }, { session });
            if (current && (current.streamId !== value.streamId || current.ministryId !== value.source.ministryId || current.sourceFolderId !== value.folderId)) result = "conflict";
            else if (value.observation === "SYNC_ERROR") result = "unchanged";
            else if (current && BigInt(value.scanSequence) <= BigInt(current.scanSequence)) result = "stale";
            else if (current && current.metadataDriveVersion !== null && value.metadataDriveVersion !== null && BigInt(value.metadataDriveVersion) < BigInt(current.metadataDriveVersion)) result = "conflict";
            // Replacement PDFs must receive a new Drive identity. A later scan
            // cannot silently bless changed bytes under the existing file ID.
            else if (current?.snapshot && value.snapshot &&
              current.snapshot.pdf.driveFileId === value.snapshot.pdf.driveFileId &&
              current.snapshot.pdf.sha256 !== value.snapshot.pdf.sha256) result = "conflict";
            else {
              const state = value.observation as ArchiveRecord["sourceState"];
              const suppressionReason = state !== "VALID" ? state : value.snapshot?.pdf.publicReadable ? null : "PDF_NOT_PUBLIC";
              const changed = !current || current.sourceState !== state || current.suppressionReason !== suppressionReason || (value.snapshot !== null && current.snapshot?.fingerprint !== value.snapshot.fingerprint);
              const next: ArchiveRecord = {
                _id: current?._id ?? randomUUID(), externalSubmissionId: value.metadataFileId, ministryId: value.source.ministryId, sourceFolderId: value.folderId, streamId: value.streamId,
                metadataDriveVersion: value.metadataDriveVersion ?? current?.metadataDriveVersion ?? null, scanSequence: value.scanSequence, sourceState: state, suppressionReason,
                manualHidden: current?.manualHidden ?? false, snapshot: value.snapshot ?? current?.snapshot ?? null, generation: (current?.generation ?? 0) + (changed ? 1 : 0),
                lastSourceCheckedAt: new Date(value.sourceCheckedAt), lastReceivedAt: receivedAt, createdAt: current?.createdAt ?? receivedAt, updatedAt: changed ? receivedAt : current!.updatedAt,
              };
              if (current) await store.archives.replaceOne({ _id: current._id }, next, { session });
              else await store.archives.insertOne(next, { session });
              result = changed ? "applied" : "unchanged";
            }
            await store.deliveries.insertOne({ _id: randomUUID(), streamId: value.streamId, deliveryId: value.deliveryId, scanSequence: value.scanSequence, payloadHash: hash, receivedAt }, { session });
          }
          await store.syncLogs.updateOne({ _id: log._id }, value.observation === "SYNC_ERROR" && result === "unchanged" ? { $set: { outcome: result, reason: "SCAN_INCOMPLETE" } } : { $set: { outcome: result }, $unset: { reason: "" } }, { session });
          return result;
        }, { readConcern: { level: "snapshot" }, writeConcern: { w: "majority" }, maxCommitTimeMS: 5000 });
        return { outcome, receivedAt: receivedAt.toISOString() };
      } catch (error) {
        if (attempt < 3 && error && typeof error === "object" && "code" in error && error.code === 11000) continue;
        await finish("invalid", "TRANSACTION_UNAVAILABLE");
        throw error;
      } finally { await session.endSession(); }
    }
    throw Error("retry exhausted");
  } catch { throw new ApiError(503, "ARCHIVE_STORE_UNAVAILABLE", "Transactional archive storage is unavailable."); }
}
