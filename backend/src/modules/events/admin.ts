import { ApiError, defineHandler, readJsonObject } from "../../lib/http.ts";
import { filterValue, findPage, readPagination } from "../../lib/pagination.ts";
import { pathId } from "../../lib/request.ts";
import { assertCurrentActor, requireAdmin } from "../auth/session.ts";
import { accessTransaction, audit, getAuthStore } from "../auth/store.ts";
import { timelineSettings } from "./config.ts";
import { isEventVisible, timeStatus, type EventRecord, type EventSyncLog } from "./models.ts";
import { getEventStore } from "./store.ts";

function notFound() { return new ApiError(404, "EVENT_NOT_FOUND", "Event not found."); }

export function adminEvent(record: EventRecord) {
  return {
    id: record._id, calendarId: record.calendarId, eventId: record.eventId, status: record.status,
    content: record.content, timeStatus: record.content ? timeStatus(record.content) : null,
    manualHidden: record.manualHidden, effectiveVisibility: isEventVisible(record),
    sourceUpdatedAt: record.sourceUpdatedAt, generation: record.generation,
    lastReceivedAt: record.lastReceivedAt, createdAt: record.createdAt, updatedAt: record.updatedAt,
  };
}

export function eventSyncLogView(log: EventSyncLog) {
  return { id: log._id, calendarId: log.calendarId, eventId: log.eventId, sourceUpdatedAt: log.sourceUpdatedAt,
    status: log.status, receivedAt: log.receivedAt, outcome: log.outcome, reason: log.reason ?? null };
}

export const eventsAdminList = defineHandler("events.adminList", async (request) => {
  await requireAdmin(request, "ADMIN");
  const settings = timelineSettings();
  const page = readPagination(new URL(request.url), settings.pageDefaultLimit, settings.pageMaxLimit);
  const { events } = await getEventStore();
  return findPage(events, {}, { updatedAt: -1, _id: 1 }, page, adminEvent);
});

// Events branch of GET /api/admin/sync-logs; the caller has authorized the admin.
export async function eventSyncLogPage(url: URL) {
  const settings = timelineSettings();
  const page = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
  const eventId = filterValue(url, "eventId", 1024);
  const store = await getEventStore();
  return findPage(store.syncLogs, eventId ? { eventId } : {}, { receivedAt: -1, _id: -1 }, page, eventSyncLogView);
}

export const eventsAdminDetail = defineHandler("events.adminDetail", async (request) => {
  await requireAdmin(request, "ADMIN");
  const store = await getEventStore();
  const record = await store.events.findOne({ _id: pathId(request) ?? "" });
  if (!record) throw notFound();
  const lastSync = await store.syncLogs.findOne({ calendarId: record.calendarId, eventId: record.eventId }, { sort: { receivedAt: -1, _id: -1 } });
  return { ...adminEvent(record), lastSync: lastSync ? eventSyncLogView(lastSync) : null };
});

// Only website visibility is editable; event content belongs to Google Calendar.
export const eventsUpdate = defineHandler("events.update", async (request) => {
  const context = await requireAdmin(request, "ADMIN", true);
  const body = await readJsonObject(request);
  if (Object.keys(body).join(",") !== "hidden" || typeof body.hidden !== "boolean") {
    throw new ApiError(400, "INVALID_EVENT_UPDATE", "Send exactly { \"hidden\": true } or { \"hidden\": false }.");
  }
  const hidden = body.hidden;
  const id = pathId(request) ?? "";
  const auth = await getAuthStore();
  const store = await getEventStore();
  return accessTransaction(auth, async (transaction) => {
    const actor = await assertCurrentActor(auth, context, transaction, false);
    const before = await store.events.findOne({ _id: id }, { session: transaction });
    if (!before) throw notFound();
    const changed = before.manualHidden !== hidden;
    const after = changed ? { ...before, manualHidden: hidden, generation: before.generation + 1, updatedAt: new Date() } : before;
    if (changed) {
      await store.events.updateOne({ _id: id }, { $set: { manualHidden: hidden, updatedAt: after.updatedAt }, $inc: { generation: 1 } }, { session: transaction });
    }
    const state = (record: EventRecord) => ({ manualHidden: record.manualHidden, status: record.status, effectiveVisibility: isEventVisible(record), generation: record.generation });
    await audit(auth, transaction, hidden ? "event.hidden" : "event.unhidden", actor._id, id, {
      actor: { id: actor._id, username: actor.username, role: actor.role }, changed, before: state(before), after: state(after),
    });
    return adminEvent(after);
  });
});
