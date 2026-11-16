import type { Db } from "mongodb";
import { getDatabase } from "../../lib/database.ts";
import { markSchemaReady, requireSchema } from "../../lib/schema.ts";
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
  await requireSchema(database, "event_control", "TIMELINE_NOT_INITIALIZED", "Run Timeline setup before serving event traffic.");
  return eventCollections(database);
}

export async function initializeEvents(database: Db): Promise<void> {
  const store = eventCollections(database);
  await store.events.createIndex({ calendarId: 1, eventId: 1 }, { unique: true });
  await store.events.createIndex({ status: 1, manualHidden: 1, "content.startAt": 1, _id: 1 });
  await store.events.createIndex({ updatedAt: -1, _id: 1 });
  await store.syncLogs.createIndex({ receivedAt: -1, _id: -1 });
  await store.syncLogs.createIndex({ eventId: 1, receivedAt: -1 });
  await markSchemaReady(database, "event_control");
}
