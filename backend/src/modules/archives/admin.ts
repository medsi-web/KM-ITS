import { ApiError, defineHandler } from "../../lib/http.ts";
import { readPagination } from "../../lib/pagination.ts";
import { assertCurrentActor, requireAdmin } from "../auth/session.ts";
import { accessTransaction, audit, getAuthStore } from "../auth/store.ts";
import { isArchiveVisible } from "./models.ts";
import type { ArchiveRecord, ArchiveSyncLog } from "./models.ts";
import { getArchiveStore } from "./store.ts";

const pagination = (url: URL) => readPagination(url, 25, 100);

function archiveId(request: Request, mutation = false) {
  const parts = new URL(request.url).pathname.replace(/\/$/, "").split("/");
  const id = parts.at(mutation ? -2 : -1);
  if (!id) throw new ApiError(404, "ARCHIVE_NOT_FOUND", "Archive not found.");
  return id;
}

function adminArchive(record: ArchiveRecord) {
  return {
    id: record._id, externalSubmissionId: record.externalSubmissionId,
    ministryId: record.ministryId, sourceFolderId: record.sourceFolderId, streamId: record.streamId,
    sourceState: record.sourceState, suppressionReason: record.suppressionReason,
    manualHidden: record.manualHidden, effectiveVisibility: isArchiveVisible(record),
    snapshot: record.snapshot, metadataDriveVersion: record.metadataDriveVersion,
    scanSequence: record.scanSequence, generation: record.generation,
    lastSourceCheckedAt: record.lastSourceCheckedAt, lastReceivedAt: record.lastReceivedAt,
    createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

export const archivesAdminList = defineHandler("archives.adminList", async (request) => {
  await requireAdmin(request, "ADMIN");
  const { limit, offset } = pagination(new URL(request.url));
  const store = await getArchiveStore();
  const [records, total] = await Promise.all([
    store.archives.find({}).sort({ updatedAt: -1, _id: 1 }).skip(offset).limit(limit).toArray(),
    store.archives.countDocuments({}),
  ]);
  return { items: records.map(adminArchive), total, limit, offset };
});

export const archivesAdminDetail = defineHandler("archives.adminDetail", async (request) => {
  await requireAdmin(request, "ADMIN");
  const store = await getArchiveStore();
  const record = await store.archives.findOne({ _id: archiveId(request) });
  if (!record) throw new ApiError(404, "ARCHIVE_NOT_FOUND", "Archive not found.");
  const lastSync = await store.syncLogs.findOne({ streamId: record.streamId, externalSubmissionId: record.externalSubmissionId }, { sort: { receivedAt: -1, _id: -1 } });
  return { ...adminArchive(record), lastSync: lastSync ? syncLogView(lastSync) : null };
});

function visibilityHandler(hidden: boolean) {
  return defineHandler(hidden ? "archives.unpublish" : "archives.publish", async (request) => {
    const context = await requireAdmin(request, "ADMIN", true);
    const id = archiveId(request, true);
    const auth = await getAuthStore();
    const store = await getArchiveStore();
    return accessTransaction(auth, async (transaction) => {
      const actor = await assertCurrentActor(auth, context, transaction, false);
      const before = await store.archives.findOne({ _id: id }, { session: transaction });
      if (!before) throw new ApiError(404, "ARCHIVE_NOT_FOUND", "Archive not found.");
      const changed = before.manualHidden !== hidden;
      const after = changed ? { ...before, manualHidden: hidden, generation: before.generation + 1, updatedAt: new Date() } : before;
      if (changed) {
        await store.archives.updateOne({ _id: id }, {
          $set: { manualHidden: hidden, updatedAt: after.updatedAt }, $inc: { generation: 1 },
        }, { session: transaction });
      }
      const state = (record: ArchiveRecord) => ({ manualHidden: record.manualHidden, sourceState: record.sourceState,
        suppressionReason: record.suppressionReason, effectiveVisibility: isArchiveVisible(record), generation: record.generation });
      await audit(auth, transaction, hidden ? "archive.hidden" : "archive.unhidden", actor._id, id, {
        actor: { id: actor._id, username: actor.username, role: actor.role }, changed,
        before: state(before), after: state(after),
      });
      return adminArchive(after);
    });
  });
}

export const archivesPublish = visibilityHandler(false);
export const archivesUnpublish = visibilityHandler(true);


function syncLogView(log: ArchiveSyncLog) {
  return { id: log._id, streamId: log.streamId, deliveryId: log.deliveryId,
    externalSubmissionId: log.externalSubmissionId, scanSequence: log.scanSequence,
    receivedAt: log.receivedAt, sourceCheckedAt: log.sourceCheckedAt,
    observation: log.observation, outcome: log.outcome, reason: log.reason ?? null };
}

export const archiveSyncLogs = defineHandler("sync.logs", async (request) => {
  await requireAdmin(request, "ADMIN");
  const url = new URL(request.url);
  const { limit, offset } = pagination(url);
  const filter: { streamId?: string; externalSubmissionId?: string } = {};
  for (const key of ["streamId", "externalSubmissionId"] as const) {
    const value = url.searchParams.get(key);
    if (value !== null) {
      if (!value || value.length > 256) throw new ApiError(400, "INVALID_FILTER", "Filter values must contain 1–256 characters.");
      filter[key] = value;
    }
  }
  const store = await getArchiveStore();
  const [records, total] = await Promise.all([
    store.syncLogs.find(filter).sort({ receivedAt: -1, _id: -1 }).skip(offset).limit(limit).toArray(),
    store.syncLogs.countDocuments(filter),
  ]);
  return { items: records.map(syncLogView), total, limit, offset };
});
