import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import { eventsAdminDetail, eventsAdminList, eventsUpdate } from "../src/modules/events/admin.ts";
import { ingestEvents } from "../src/modules/events/ingestion.ts";
import { eventsDetail, eventsList } from "../src/modules/events/public.ts";
import { eventCollections, initializeEvents } from "../src/modules/events/store.ts";
import { syncLogs } from "../src/modules/sync/handlers.ts";
import { adminRequest, adminSessions, data, ORIGIN } from "./fixtures/admin.ts";
import { batch, CALENDAR, calendarEvent } from "./fixtures/events.ts";

let replica: MongoMemoryReplSet;
let tokens: { admin: string; superAdmin: string };
const day = 24 * 3600 * 1000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();
type PublicEvent = { id: string; title: string; status: string; startAt: string };
type Page<T> = { items: T[]; total: number; limit: number; offset: number };

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "events_api_test";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.EVENT_CALENDAR_ID = CALENDAR;
  const database = await getDatabase();
  await initializeAuth(database);
  await initializeEvents(database);
  tokens = await adminSessions(database);
  await ingestEvents(batch(
    calendarEvent("finished", undefined, { title: "Finished", startAt: iso(-3 * day), endAt: iso(-2 * day) }),
    calendarEvent("ongoing", undefined, { title: "Ongoing", startAt: iso(-day), endAt: iso(day), allDay: true }),
    calendarEvent("upcoming", undefined, { title: "Upcoming", startAt: iso(2 * day), endAt: iso(3 * day) }),
    calendarEvent("cancelled", undefined, { title: "Cancelled", startAt: iso(2 * day), endAt: iso(3 * day) }),
  ));
  await ingestEvents(batch({ eventId: "cancelled", updated: "2026-11-17T00:00:00Z", status: "cancelled" }));
});
after(async () => { await (await getMongoClient()).close(); await replica?.stop(); });

const list = async (query = "") => data<Page<PublicEvent>>(await eventsList(new Request(`${ORIGIN}/api/events${query}`)));

test("public list orders visible events, derives status and filters by window and status", async () => {
  const all = await list();
  assert.deepEqual(all.items.map(item => [item.title, item.status]), [["Finished", "FINISHED"], ["Ongoing", "ONGOING"], ["Upcoming", "UPCOMING"]]);
  assert.equal(all.total, 3);
  assert.ok(!("calendarId" in all.items[0]) && !("manualHidden" in all.items[0]));
  for (const status of ["UPCOMING", "ONGOING", "FINISHED"]) {
    assert.deepEqual((await list(`?status=${status}`)).items.map(item => item.status), [status]);
  }
  const window = await list(`?from=${encodeURIComponent(iso(-1.5 * day))}&to=${encodeURIComponent(iso(1.5 * day))}`);
  assert.deepEqual(window.items.map(item => item.title), ["Ongoing"]);
  assert.equal((await list("?limit=1&offset=1")).items[0].title, "Ongoing");
});

test("public query and identifier errors", async () => {
  for (const query of ["?from=yesterday", `?from=${iso(day)}&to=${iso(-day)}`, "?status=LIVE", "?search=x", "?limit=201"]) {
    assert.equal((await eventsList(new Request(`${ORIGIN}/api/events${query.replace(/\+/g, "%2B")}`))).status, 400, query);
  }
  process.env.EVENT_PAGE_MAX_LIMIT = "2";
  assert.equal((await eventsList(new Request(`${ORIGIN}/api/events?limit=3`))).status, 400);
  assert.equal((await list()).limit, 2);
  delete process.env.EVENT_PAGE_MAX_LIMIT;
  assert.equal((await eventsDetail(new Request(`${ORIGIN}/api/events/not-a-uuid`))).status, 404);
  const cancelled = await eventCollections(await getDatabase()).events.findOne({ eventId: "cancelled" });
  assert.equal((await eventsDetail(new Request(`${ORIGIN}/api/events/${cancelled!._id}`))).status, 404);
});

test("admin monitoring and manual hiding with CSRF, audit and both roles", async () => {
  const store = eventCollections(await getDatabase());
  const upcoming = (await store.events.findOne({ eventId: "upcoming" }))!;
  const path = `/api/admin/events/${upcoming._id}`;
  for (const handler of [eventsAdminList, eventsAdminDetail, eventsUpdate]) assert.equal((await handler(adminRequest(path))).status, 401);

  const adminList = await data<Page<{ eventId: string; effectiveVisibility: boolean }>>(await eventsAdminList(adminRequest("/api/admin/events", { token: tokens.admin })));
  assert.equal(adminList.total, 4);
  assert.equal(adminList.items.find(item => item.eventId === "cancelled")?.effectiveVisibility, false);
  const detail = await data<{ lastSync: { outcome: string }; timeStatus: string }>(await eventsAdminDetail(adminRequest(path, { token: tokens.admin })));
  assert.equal(detail.lastSync.outcome, "applied");
  assert.equal(detail.timeStatus, "UPCOMING");

  const patch = (body: unknown, token = tokens.admin, csrf = true) => eventsUpdate(adminRequest(path, { token, method: "PATCH", body, csrf }));
  assert.equal((await patch({ hidden: true }, tokens.admin, false)).status, 403);
  for (const body of [{}, { hidden: "yes" }, { hidden: true, title: "x" }]) assert.equal((await patch(body)).status, 400);
  assert.equal((await data<{ manualHidden: boolean }>(await patch({ hidden: true }))).manualHidden, true);
  assert.equal((await eventsDetail(new Request(`${ORIGIN}/api/events/${upcoming._id}`))).status, 404);
  assert.equal((await list()).total, 2);

  // Hiding persists across a newer source update.
  await ingestEvents(batch(calendarEvent("upcoming", "2026-11-18T00:00:00Z", { title: "Upcoming renamed", startAt: iso(2 * day), endAt: iso(3 * day) })));
  assert.equal((await list()).total, 2);
  assert.equal((await data<{ effectiveVisibility: boolean }>(await patch({ hidden: false }, tokens.superAdmin))).effectiveVisibility, true);
  assert.equal((await data<PublicEvent>(await eventsDetail(new Request(`${ORIGIN}/api/events/${upcoming._id}`)))).title, "Upcoming renamed");

  // Unhiding never shows a cancelled event.
  const cancelled = (await store.events.findOne({ eventId: "cancelled" }))!;
  const unhide = await eventsUpdate(adminRequest(`/api/admin/events/${cancelled._id}`, { token: tokens.admin, method: "PATCH", body: { hidden: false } }));
  assert.equal((await data<{ effectiveVisibility: boolean }>(unhide)).effectiveVisibility, false);

  const audits = await authCollections(await getDatabase()).audit.find({ targetId: upcoming._id }).sort({ at: 1 }).toArray();
  assert.deepEqual(audits.map(entry => entry.action), ["event.hidden", "event.unhidden"]);
  assert.equal((audits[1].changes?.actor as { role: string }).role, "SUPER_ADMIN");
  assert.equal((await eventsUpdate(adminRequest("/api/admin/events/unknown", { token: tokens.admin, method: "PATCH", body: { hidden: true } }))).status, 404);
});

test("sync logs are readable per source with source-specific filters", async () => {
  const read = (query: string) => syncLogs(adminRequest(`/api/admin/sync-logs${query}`, { token: tokens.admin }));
  const logs = await data<{ source: string; items: { eventId: string; outcome: string }[]; total: number }>(await read("?source=events&eventId=cancelled"));
  assert.equal(logs.source, "events");
  assert.deepEqual(logs.items.map(item => item.outcome), ["applied", "applied"]);
  assert.ok(logs.items.every(item => item.eventId === "cancelled"));
  assert.equal((await read("?source=events&streamId=x")).status, 400);
  assert.equal((await read("?source=calendar")).status, 400);
  assert.equal((await syncLogs(adminRequest("/api/admin/sync-logs?source=events"))).status, 401);
});
