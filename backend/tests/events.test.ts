import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError } from "../src/lib/http.ts";
import { timeStatus } from "../src/modules/events/models.ts";
import { validateEventBatch } from "../src/modules/events/validation.ts";
import { batch, CALENDAR, calendarEvent } from "./fixtures/events.ts";

const originalEnvironment = { ...process.env };
process.env.EVENT_CALENDAR_ID = CALENDAR;
afterEach(() => { process.env = { ...originalEnvironment, EVENT_CALENDAR_ID: CALENDAR }; });

const rejected = (error: unknown) => error instanceof ApiError && error.status === 422 && error.code === "INVALID_EVENT_BATCH";

test("envelope rejects other calendars, versions, unknown keys and item counts", () => {
  assert.throws(() => validateEventBatch({ ...batch(calendarEvent()), calendarId: "other@group.calendar.google.com" }), rejected);
  assert.throws(() => validateEventBatch({ ...batch(calendarEvent()), protocolVersion: 2 }), rejected);
  assert.throws(() => validateEventBatch({ ...batch(calendarEvent()), extra: true }), rejected);
  assert.throws(() => validateEventBatch(batch()), rejected);
  process.env.EVENT_SYNC_MAX_ITEMS = "2";
  assert.throws(() => validateEventBatch(batch(calendarEvent("a"), calendarEvent("b"), calendarEvent("c"))), rejected);
  delete process.env.EVENT_CALENDAR_ID;
  assert.throws(() => validateEventBatch(batch(calendarEvent())), (error: unknown) => error instanceof ApiError && error.code === "TIMELINE_NOT_CONFIGURED");
});

test("items are validated one by one with field-specific reasons", () => {
  const result = validateEventBatch(batch(
    calendarEvent("good"),
    calendarEvent("backwards", undefined, { endAt: "2098-01-01T00:00:00.000Z" }),
    calendarEvent("untitled", undefined, { title: "  " }),
    calendarEvent("bad id!"),
    calendarEvent("extra", undefined, { attendees: [] }),
    { eventId: "gone", updated: "2026-11-16T00:00:00Z", status: "cancelled", title: "ignored" },
  ));
  assert.deepEqual(result.items.map(item => item.ok ? "ok" : item.reason), ["ok", "INVALID_END_AT", "INVALID_TITLE", "INVALID_EVENT_ID", "INVALID_EVENT", "ok"]);
  const cancelled = result.items[5];
  assert.ok(cancelled.ok && cancelled.value.content === null);
  assert.equal(result.items[3].ok ? "" : result.items[3].id, null);
});

test("optional text defaults, offsets normalize to UTC and description length is configurable", () => {
  const parsed = validateEventBatch(batch(calendarEvent("tz", "2026-11-16T07:00:00+07:00", { description: undefined, location: undefined, organization: undefined, startAt: "2099-01-01T07:00:00+07:00" }))).items[0];
  assert.ok(parsed.ok);
  assert.equal(parsed.value.updated.toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(parsed.value.content?.startAt.toISOString(), "2099-01-01T00:00:00.000Z");
  assert.equal(parsed.value.content?.description, "");
  process.env.EVENT_DESCRIPTION_MAX_CHARS = "5";
  const long = validateEventBatch(batch(calendarEvent("long", undefined, { description: "too long" }))).items[0];
  assert.equal(long.ok ? "" : long.reason, "INVALID_DESCRIPTION");
});

test("lifecycle status is derived from the current time", () => {
  const content = { title: "t", description: "", location: "", organization: "", allDay: false,
    startAt: new Date("2026-11-16T00:00:00Z"), endAt: new Date("2026-11-17T00:00:00Z") };
  assert.equal(timeStatus(content, new Date("2026-11-15T23:59:59Z")), "UPCOMING");
  assert.equal(timeStatus(content, new Date("2026-11-16T00:00:00Z")), "ONGOING");
  assert.equal(timeStatus(content, new Date("2026-11-17T00:00:00Z")), "FINISHED");
});
