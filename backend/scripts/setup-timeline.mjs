import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { timelineSettings } from "../src/modules/events/config.ts";
import { initializeEvents } from "../src/modules/events/store.ts";

let client;
try {
  const settings = timelineSettings();
  client = await getMongoClient();
  await initializeEvents(await getDatabase());
  console.log(`Timeline indexes are ready; calendar registration and limits validated (batch ${settings.syncMaxItems}, page ${settings.pageDefaultLimit}/${settings.pageMaxLimit}).`);
} catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : "Timeline setup failed. Check database configuration and index conflicts.");
  process.exitCode = 1;
} finally {
  await client?.close();
}
