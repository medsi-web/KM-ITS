import { ApiError, defineHandler } from "../../lib/http.ts";
import { filterValue, findPage, readPagination } from "../../lib/pagination.ts";
import { pathId } from "../../lib/request.ts";
import { assertCurrentActor, requireAdmin } from "../auth/session.ts";
import { accessTransaction, audit, getAuthStore } from "../auth/store.ts";
import { isArchiveVisible } from "./models.ts";
import type { ArchiveRecord, ArchiveSyncLog } from "./models.ts";
import { getArchiveStore } from "./store.ts";

const pagination = (url: URL) => readPagination(url, 25, 100);

function notFound() { return new ApiError(404, "ARCHIVE_NOT_FOUND", "Archive not found."); }

function archiveId(request: Request, action?: "publish" | "unpublish") {
  const id = pathId(request, action);
  if (!id) throw notFound();
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
  const store = await getArchiveStore();
  return findPage(store.archives, {}, { updatedAt: -1, _id: 1 }, pagination(new URL(request.url)), adminArchive);
});

export const archivesAdminDetail = defineHandler("archives.adminDetail", async (request) => {
  await requireAdmin(request, "ADMIN");
  const store = await getArchiveStore();
  const record = await store.archives.findOne({ _id: archiveId(request) });
  if (!record) throw notFound();
  const lastSync = await store.syncLogs.findOne({ streamId: record.streamId, externalSubmissionId: record.externalSubmissionId }, { sort: { receivedAt: -1, _id: -1 } });
  return { ...adminArchive(record), lastSync: lastSync ? syncLogView(lastSync) : null };
});

function visibilityHandler(hidden: boolean) {
  return defineHandler(hidden ? "archives.unpublish" : "archives.publish", async (request) => {
    const context = await requireAdmin(request, "ADMIN", true);
    const id = archiveId(request, hidden ? "unpublish" : "publish");
    const auth = await getAuthStore();
    const store = await getArchiveStore();
    return accessTransaction(auth, async (transaction) => {
      const actor = await assertCurrentActor(auth, context, transaction, false);
      const before = await store.archives.findOne({ _id: id }, { session: transaction });
      if (!before) throw notFound();
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

// Archive branch of GET /api/admin/sync-logs; the caller has authorized the admin.
export async function archiveSyncLogPage(url: URL) {
  const page = pagination(url);
  const filter: { streamId?: string; externalSubmissionId?: string } = {};
  for (const key of ["streamId", "externalSubmissionId"] as const) {
    const value = filterValue(url, key, 256);
    if (value !== undefined) filter[key] = value;
  }
  const store = await getArchiveStore();
  return findPage(store.syncLogs, filter, { receivedAt: -1, _id: -1 }, page, syncLogView);
}
