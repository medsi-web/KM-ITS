import type { Db } from "mongodb";
import { getDatabase } from "../../lib/database.ts";
import { markSchemaReady, requireSchema } from "../../lib/schema.ts";
import type { ArchiveDelivery, ArchiveRecord, ArchiveSyncLog } from "./models.ts";

export function archiveCollections(database: Db) {
  return {
    archives: database.collection<ArchiveRecord>("archives"),
    deliveries: database.collection<ArchiveDelivery>("archive_deliveries"),
    syncLogs: database.collection<ArchiveSyncLog>("archive_sync_logs"),
  };
}
export type ArchiveStore = ReturnType<typeof archiveCollections>;

export async function getArchiveStore() {
  const database = await getDatabase();
  await requireSchema(database, "archive_control", "ARCHIVE_NOT_INITIALIZED", "Run Archive setup before serving document traffic.");
  return archiveCollections(database);
}

export async function initializeArchives(database: Db) {
  const store = archiveCollections(database);
  await store.archives.createIndex({ externalSubmissionId: 1 }, { unique: true });
  await store.archives.createIndex({ ministryId: 1, sourceState: 1, manualHidden: 1 });
  await store.deliveries.createIndex({ streamId: 1, deliveryId: 1 }, { unique: true });
  await store.deliveries.createIndex({ streamId: 1, scanSequence: 1 }, { unique: true });
  await store.syncLogs.createIndex({ receivedAt: -1, _id: -1 });
  await markSchemaReady(database, "archive_control");
}
