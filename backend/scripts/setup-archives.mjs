import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { archiveSources } from "../src/modules/archives/sources.ts";
import { initializeArchives } from "../src/modules/archives/store.ts";

let client;
try {
  const sources = archiveSources();
  client = await getMongoClient();
  await initializeArchives(await getDatabase());
  console.log(`Archive indexes are ready; ${sources.length} environment source registrations validated.`);
} catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : "Archive setup failed. Check database configuration and index conflicts.");
  process.exitCode = 1;
} finally {
  await client?.close();
}
