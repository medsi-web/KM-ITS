import type { Db } from "mongodb";
import { getDatabase } from "../../lib/database.ts";
import { ApiError } from "../../lib/http.ts";
import type { EventRecord, EventSyncLog } from "./models.ts";

export function eventCollections(database: Db) {
  return {
    events: database.collection<EventRecord>("events"),
    syncLogs: database.collection<EventSyncLog>("event_sync_logs"),
  };
}
export type EventStore = ReturnType<typeof eventCollections>;

export async function getEventStore(): Promise<EventStore> {
  const database = await getDatabase();
  const ready = await database.collection<{ _id: string; schemaVersion: number }>("event_control").findOne({ _id: "schema", schemaVersion: 1 });
  if (!ready) throw new ApiError(503, "TIMELINE_NOT_INITIALIZED", "Run Timeline setup before serving event traffic.");
  return eventCollections(database);
}

export async function initializeEvents(database: Db): Promise<void> {
  const store = eventCollections(database);
  await store.events.createIndex({ calendarId: 1, eventId: 1 }, { unique: true });
  await store.events.createIndex({ status: 1, manualHidden: 1, "content.startAt": 1, _id: 1 });
  await store.events.createIndex({ updatedAt: -1, _id: 1 });
  await store.syncLogs.createIndex({ receivedAt: -1, _id: -1 });
  await store.syncLogs.createIndex({ eventId: 1, receivedAt: -1 });
  // Readiness is recorded only after the identity constraint exists.
  await database.collection<{ _id: string; schemaVersion: number }>("event_control")
    .updateOne({ _id: "schema" }, { $set: { schemaVersion: 1 } }, { upsert: true });
}
