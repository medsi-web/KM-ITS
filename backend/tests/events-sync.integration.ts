import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ingestEvents } from "../src/modules/events/ingestion.ts";
import { isEventVisible } from "../src/modules/events/models.ts";
import { eventCollections, initializeEvents } from "../src/modules/events/store.ts";
import { syncEvents } from "../src/modules/sync/handlers.ts";
import { batch, calendarEvent, CALENDAR } from "./fixtures/events.ts";
import { ingestionSecretHash } from "../src/integrations/apps-script.ts";

let replica: MongoMemoryReplSet;
const secret = "events-integration-secret-not-for-deployment";
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "events_sync_test";
  process.env.APPS_SCRIPT_INGESTION_SECRET_SHA256 = ingestionSecretHash(secret);
  process.env.EVENT_CALENDAR_ID = CALENDAR;
});
after(async () => { await (await getMongoClient()).close(); await replica?.stop(); });

const outcomes = async (input: unknown) => (await ingestEvents(input)).results.map(result => result.outcome);

test("requests fail closed before Timeline setup", async () => {
  await assert.rejects(ingestEvents(batch(calendarEvent())), (error: { code?: string }) => error.code === "TIMELINE_NOT_INITIALIZED");
  await initializeEvents(await getDatabase());
});

test("ordering, retries, conflicts, cancellation and manual hiding", async () => {
  const store = eventCollections(await getDatabase());
  assert.deepEqual(await outcomes(batch(calendarEvent("e1", "2026-11-16T01:00:00Z"), calendarEvent("e2", "2026-11-16T01:00:00Z"))), ["applied", "applied"]);
  assert.deepEqual(await outcomes(batch(calendarEvent("e1", "2026-11-16T01:00:00Z"))), ["unchanged"]);
  assert.deepEqual(await outcomes(batch(calendarEvent("e1", "2026-11-16T01:00:00Z", { title: "Changed" }))), ["conflict"]);
  assert.deepEqual(await outcomes(batch(calendarEvent("e1", "2026-11-16T00:00:00Z", { title: "Older" }))), ["stale"]);
  assert.equal((await store.events.findOne({ eventId: "e1" }))?.content?.title, "Ministry meeting");

  // Same content with a newer timestamp advances the watermark only.
  const before = (await store.events.findOne({ eventId: "e1" }))!;
  assert.deepEqual(await outcomes(batch(calendarEvent("e1", "2026-11-16T02:00:00Z"))), ["unchanged"]);
  const advanced = (await store.events.findOne({ eventId: "e1" }))!;
  assert.equal(advanced.generation, before.generation);
  assert.equal(advanced.sourceUpdatedAt.toISOString(), "2026-11-16T02:00:00.000Z");

  // Manual hiding survives source updates.
  await store.events.updateOne({ eventId: "e1" }, { $set: { manualHidden: true } });
  assert.deepEqual(await outcomes(batch(calendarEvent("e1", "2026-11-16T03:00:00Z", { title: "Renamed" }))), ["applied"]);
  const renamed = (await store.events.findOne({ eventId: "e1" }))!;
  assert.equal(renamed.content?.title, "Renamed");
  assert.equal(renamed.manualHidden, true);
  assert.equal(isEventVisible(renamed), false);

  // Cancellation keeps content for history and hides the event.
  assert.deepEqual(await outcomes(batch({ eventId: "e2", updated: "2026-11-16T04:00:00Z", status: "cancelled" })), ["applied"]);
  const cancelled = (await store.events.findOne({ eventId: "e2" }))!;
  assert.equal(cancelled.status, "cancelled");
  assert.equal(cancelled.content?.title, "Ministry meeting");
  assert.equal(isEventVisible(cancelled), false);

  // A cancellation for an unknown event blocks an older confirmed copy.
  assert.deepEqual(await outcomes(batch({ eventId: "e3", updated: "2026-11-16T05:00:00Z", status: "cancelled" })), ["applied"]);
  assert.deepEqual(await outcomes(batch(calendarEvent("e3", "2026-11-16T04:00:00Z"))), ["stale"]);
  assert.equal((await store.events.findOne({ eventId: "e3" }))?.content, null);
  // A newer confirmed copy restores it.
  assert.deepEqual(await outcomes(batch(calendarEvent("e3", "2026-11-16T06:00:00Z"))), ["applied"]);
  assert.equal(isEventVisible((await store.events.findOne({ eventId: "e3" }))!), true);
});

test("invalid items do not block valid ones and every item is logged without content", async () => {
  const store = eventCollections(await getDatabase());
  const logsBefore = await store.syncLogs.countDocuments();
  const result = await ingestEvents(batch(calendarEvent("bad", undefined, { title: "" }), calendarEvent("e4")));
  assert.deepEqual(result.results, [
    { index: 0, eventId: "bad", outcome: "invalid", reason: "INVALID_TITLE" },
    { index: 1, eventId: "e4", outcome: "applied" },
  ]);
  assert.equal(await store.events.countDocuments({ eventId: "bad" }), 0);
  assert.equal(await store.syncLogs.countDocuments(), logsBefore + 2);
  const logs = JSON.stringify(await store.syncLogs.find({}).toArray());
  assert.ok(!logs.includes("Agenda"));
});

test("concurrent first deliveries of one event create one record", async () => {
  const store = eventCollections(await getDatabase());
  const results = await Promise.all([1, 2, 3, 4].map(() => outcomes(batch(calendarEvent("race", "2026-11-16T01:00:00Z")))));
  assert.deepEqual(results.flat().sort(), ["applied", "unchanged", "unchanged", "unchanged"]);
  assert.equal(await store.events.countDocuments({ eventId: "race" }), 1);
});

test("HTTP handler authenticates, maps envelope errors to 422 and logs rejected requests", async () => {
  const store = eventCollections(await getDatabase());
  const post = (body: string, authorization = `Bearer ${secret}`) => syncEvents(new Request("http://localhost/api/internal/sync/events", {
    method: "POST", body, headers: { "content-type": "application/json", authorization } }));
  assert.equal((await post(JSON.stringify(batch(calendarEvent())), "Bearer wrong")).status, 401);
  const logsBefore = await store.syncLogs.countDocuments({ eventId: null });
  assert.equal((await post("{broken")).status, 400);
  assert.equal((await post(JSON.stringify({ ...batch(calendarEvent()), calendarId: "other" }))).status, 422);
  assert.equal(await store.syncLogs.countDocuments({ eventId: null }), logsBefore + 2);
  const response = await post(JSON.stringify(batch(calendarEvent("http"))));
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { data: { results: { outcome: string }[] } }).data.results[0].outcome, "applied");
});
