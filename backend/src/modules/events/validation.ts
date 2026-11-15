import { payloadHash } from "../../lib/canonical.ts";
import { FieldError, identifier, instant, itemList, record, text } from "../../lib/fields.ts";
import { ApiError } from "../../lib/http.ts";
import { timelineSettings } from "./config.ts";
import type { EventContent, EventStatus } from "./models.ts";

export interface EventItem { eventId: string; updated: Date; status: EventStatus; content: EventContent | null; fingerprint: string }
export type ParsedItem = { ok: true; value: EventItem } | { ok: false; eventId: string | null; reason: string };
export interface EventBatch { calendarId: string; items: ParsedItem[] }

const ITEM_KEYS = ["eventId", "updated", "status", "title", "description", "location", "organization", "allDay", "startAt", "endAt"];

export function invalidEventBatch(): never {
  throw new ApiError(422, "INVALID_EVENT_BATCH", "Event batch does not match the ingestion schema or registered calendar.");
}

export function eventFingerprint(status: EventStatus, content: EventContent | null): string {
  return payloadHash({ status, content });
}

export function parseEventItem(input: unknown, descriptionMaxChars: number): EventItem {
  const value = record(input, ITEM_KEYS, "event");
  const eventId = identifier(value.eventId, 1024, "eventId");
  const updated = instant(value.updated, "updated");
  if (value.status !== "confirmed" && value.status !== "cancelled") throw new FieldError("status");
  const status: EventStatus = value.status;
  let content: EventContent | null = null;
  // Cancelled items carry no content; fields Google still includes are ignored.
  if (status === "confirmed") {
    if (typeof value.allDay !== "boolean") throw new FieldError("allDay");
    const startAt = instant(value.startAt, "startAt");
    const endAt = instant(value.endAt, "endAt");
    if (endAt < startAt) throw new FieldError("endAt");
    content = {
      title: text(value.title, 500, "title"),
      description: text(value.description, descriptionMaxChars, "description", ""),
      location: text(value.location, 500, "location", ""),
      organization: text(value.organization, 200, "organization", ""),
      allDay: value.allDay, startAt, endAt,
    };
  }
  return { eventId, updated, status, content, fingerprint: eventFingerprint(status, content) };
}

export function validateEventBatch(input: unknown): EventBatch {
  const settings = timelineSettings();
  if (!input || typeof input !== "object" || Array.isArray(input)) invalidEventBatch();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["protocolVersion", "calendarId", "events"].includes(key))) invalidEventBatch();
  if (value.protocolVersion !== 1 || value.calendarId !== settings.calendarId) invalidEventBatch();
  const events = itemList(value.events, settings.syncMaxItems);
  if (!events) invalidEventBatch();
  const items = events.map((item): ParsedItem => {
    try { return { ok: true, value: parseEventItem(item, settings.descriptionMaxChars) }; }
    catch (error) {
      if (!(error instanceof FieldError)) throw error;
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>).eventId : undefined;
      const eventId = typeof raw === "string" && /^[A-Za-z0-9_-]{1,1024}$/.test(raw) ? raw : null;
      return { ok: false, eventId, reason: error.reason };
    }
  });
  return { calendarId: settings.calendarId, items };
}
