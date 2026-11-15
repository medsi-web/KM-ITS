import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { articleSettings } from "../src/modules/articles/config.ts";
import { initializeArticles } from "../src/modules/articles/store.ts";

let client;
try {
  const settings = articleSettings();
  client = await getMongoClient();
  await initializeArticles(await getDatabase());
  console.log(`Article indexes are ready; form registration and limits validated (batch ${settings.syncMaxItems}, page ${settings.pageDefaultLimit}/${settings.pageMaxLimit}).`);
} catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : "Article setup failed. Check database configuration and index conflicts.");
  process.exitCode = 1;
} finally {
  await client?.close();
}
