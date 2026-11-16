import type { Filter } from "mongodb";
import { isInstant } from "../../lib/fields.ts";
import { ApiError, defineHandler } from "../../lib/http.ts";
import { readPagination, rejectUnknownQuery } from "../../lib/pagination.ts";
import { pathId, UUID_PATTERN } from "../../lib/request.ts";
import { timelineSettings } from "./config.ts";
import { timeStatus, type EventRecord, type TimeStatus } from "./models.ts";
import { getEventStore } from "./store.ts";

const visibleQuery: Filter<EventRecord> = { status: "confirmed", manualHidden: false, content: { $ne: null } };
const STATUSES: TimeStatus[] = ["UPCOMING", "ONGOING", "FINISHED"];

function notFound() { return new ApiError(404, "EVENT_NOT_FOUND", "The event was not found."); }

export function publicEvent(record: EventRecord, now = new Date()) {
  const content = record.content!;
  return {
    id: record._id, title: content.title, description: content.description, location: content.location,
    organization: content.organization, allDay: content.allDay, startAt: content.startAt, endAt: content.endAt,
    status: timeStatus(content, now), updatedAt: record.updatedAt,
  };
}

function instantParameter(url: URL, key: string): Date | null {
  const raw = url.searchParams.get(key);
  if (raw === null) return null;
  if (!isInstant(raw)) throw new ApiError(400, "INVALID_RANGE", "from and to must be ISO 8601 instants with Z or an offset.");
  return new Date(raw);
}

// Window overlap plus lifecycle status, both evaluated at request time.
export function eventFilter(url: URL, now: Date): Filter<EventRecord> {
  const from = instantParameter(url, "from"), to = instantParameter(url, "to");
  if (from && to && from >= to) throw new ApiError(400, "INVALID_RANGE", "from must be earlier than to.");
  const status = url.searchParams.get("status");
  if (status !== null && !STATUSES.includes(status as TimeStatus)) throw new ApiError(400, "INVALID_STATUS", "status must be UPCOMING, ONGOING or FINISHED.");
  const conditions: Filter<EventRecord>[] = [visibleQuery];
  // Zero-length events starting exactly at `from` still belong to the window.
  if (from) conditions.push({ $or: [{ "content.endAt": { $gt: from } }, { "content.startAt": { $gte: from } }] });
  if (to) conditions.push({ "content.startAt": { $lt: to } });
  if (status === "UPCOMING") conditions.push({ "content.startAt": { $gt: now } });
  if (status === "ONGOING") conditions.push({ "content.startAt": { $lte: now }, "content.endAt": { $gt: now } });
  if (status === "FINISHED") conditions.push({ "content.endAt": { $lte: now } });
  return { $and: conditions };
}

export const eventsList = defineHandler("events.list", async (request) => {
  const url = new URL(request.url);
  rejectUnknownQuery(url, ["from", "to", "status", "limit", "offset"]);
  const settings = timelineSettings();
  const { limit, offset } = readPagination(url, settings.pageDefaultLimit, settings.pageMaxLimit);
  const now = new Date();
  const filter = eventFilter(url, now);
  const { events } = await getEventStore();
  const [records, total] = await Promise.all([
    events.find(filter).sort({ "content.startAt": 1, _id: 1 }).skip(offset).limit(limit).toArray(),
    events.countDocuments(filter),
  ]);
  return { items: records.map(record => publicEvent(record, now)), total, limit, offset };
});

export const eventsDetail = defineHandler("events.detail", async (request) => {
  const id = pathId(request);
  if (!id || !UUID_PATTERN.test(id)) throw notFound();
  const { events } = await getEventStore();
  const record = await events.findOne({ _id: id, ...visibleQuery });
  if (!record) throw notFound();
  return publicEvent(record);
});
