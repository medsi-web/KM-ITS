// Creates the Apps Script ingestion secret. The plaintext goes into the Apps
// Script project (Script Properties > KMITS_INGESTION_SECRET); only its SHA-256
// goes into the server environment. With --hash, reads an existing secret from
// stdin and prints just its hash line.
import { randomBytes } from "node:crypto";
import { ingestionSecretHash, MIN_INGESTION_SECRET_LENGTH } from "../src/integrations/apps-script.ts";

let secret;
if (process.argv.includes("--hash")) {
  secret = "";
  for await (const chunk of process.stdin) secret += chunk;
  secret = secret.trim();
  if (secret.length < MIN_INGESTION_SECRET_LENGTH) {
    console.error(`The secret must contain at least ${MIN_INGESTION_SECRET_LENGTH} characters.`);
    process.exit(1);
  }
} else {
  secret = randomBytes(36).toString("base64url");
  console.log("Apps Script > Project Settings > Script Properties:");
  console.log(`  KMITS_INGESTION_SECRET = ${secret}\n`);
}
console.log("Server environment (frontend/.env.local or the host's secret store):");
console.log(`  APPS_SCRIPT_INGESTION_SECRET_SHA256=${ingestionSecretHash(secret)}`);
