import { readFile } from "node:fs/promises";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { migrateAuth } from "../src/modules/auth/migration.ts";
import { ApiError } from "../src/lib/http.ts";

try {
  const file = process.argv.find(value => value.startsWith("--mapping="))?.slice("--mapping=".length);
  if (!file) throw new ApiError(400, "INVALID_MIGRATION", "Supply --mapping=<private-json-file> and --confirm-index-migration while the application is stopped.");
  const input = JSON.parse(await readFile(file, "utf8"));
  await migrateAuth(await getDatabase(), input, process.argv.includes("--confirm-index-migration"));
  console.log("Authentication migration complete. Account IDs, roles and history preserved; legacy sessions revoked. Distribute mapped passwords privately.");
} catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : "Authentication migration failed. Inspect configuration and retry; credentials are never logged.");
  process.exitCode = 1;
} finally {
  const client = await getMongoClient().catch(() => undefined);
  await client?.close();
}
