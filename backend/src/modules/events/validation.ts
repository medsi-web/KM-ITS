import { parseBatch, type ParsedItem } from "../../lib/batch-sync.ts";
import { payloadHash } from "../../lib/canonical.ts";
import { FieldError, identifier, instant, record, text } from "../../lib/fields.ts";
import { ApiError } from "../../lib/http.ts";
import { timelineSettings } from "./config.ts";
import type { EventContent, EventStatus } from "./models.ts";

export interface EventItem { eventId: string; updated: Date; status: EventStatus; content: EventContent | null; fingerprint: string }
export interface EventBatch { calendarId: string; items: ParsedItem<EventItem>[] }

const ITEM_KEYS = ["eventId", "updated", "status", "title", "description", "location", "organization", "allDay", "startAt", "endAt"];
const EVENT_ID = /^[A-Za-z0-9_-]{1,1024}$/;

export function invalidEventBatch(): never {
  throw new ApiError(422, "INVALID_EVENT_BATCH", "Event batch does not match the ingestion schema or registered calendar.");
}

export function eventFingerprint(status: EventStatus, content: EventContent | null): string {
  return payloadHash({ status, content });
}

function parseContent(value: Record<string, unknown>, descriptionMaxChars: number): EventContent {
  if (typeof value.allDay !== "boolean") throw new FieldError("allDay");
  const startAt = instant(value.startAt, "startAt");
  const endAt = instant(value.endAt, "endAt");
  if (endAt < startAt) throw new FieldError("endAt");
  return {
    title: text(value.title, 500, "title"),
    description: text(value.description, descriptionMaxChars, "description", ""),
    location: text(value.location, 500, "location", ""),
    organization: text(value.organization, 200, "organization", ""),
    allDay: value.allDay,
    startAt,
    endAt,
  };
}

export function parseEventItem(input: unknown, descriptionMaxChars: number): EventItem {
  const value = record(input, ITEM_KEYS, "event");
  const eventId = identifier(value.eventId, 1024, "eventId");
  const updated = instant(value.updated, "updated");
  if (value.status !== "confirmed" && value.status !== "cancelled") throw new FieldError("status");
  const status: EventStatus = value.status;
  // Cancelled items carry no content; fields Google still includes are ignored.
  const content = status === "confirmed" ? parseContent(value, descriptionMaxChars) : null;
  return { eventId, updated, status, content, fingerprint: eventFingerprint(status, content) };
}

export function validateEventBatch(input: unknown): EventBatch {
  const settings = timelineSettings();
  const items = parseBatch(input, {
    sourceKey: "calendarId", expectedSource: settings.calendarId,
    itemsKey: "events", maxItems: settings.syncMaxItems,
    idKey: "eventId", idPattern: EVENT_ID,
    invalid: invalidEventBatch,
    parseItem: item => parseEventItem(item, settings.descriptionMaxChars),
  });
  return { calendarId: settings.calendarId, items };
}
