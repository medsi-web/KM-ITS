import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import { bootstrapSuperAdmin } from "../src/modules/auth/identity.ts";
import { ApiError } from "../src/lib/http.ts";

try {
  const database = await getDatabase();
  await initializeAuth(database);
  if (process.argv.includes("--bootstrap")) {
    await bootstrapSuperAdmin(authCollections(database), process.env.BOOTSTRAP_SUPER_ADMIN_EMAIL);
    console.log("Initial super-admin invitation created. Sign in using the configured Google account.");
  } else {
    console.log("Authentication indexes and control record are ready.");
  }
} catch (error) {
  console.error(error instanceof ApiError ? `${error.code}: ${error.message}` : "Authentication setup failed. Check local database configuration.");
  process.exitCode = 1;
} finally {
  const client = await getMongoClient().catch(() => undefined);
  await client?.close();
}
