// Isolated HTTP runner. Bootstrap is the only direct auth fixture; all sessions
// originate from the real POST /api/auth/login endpoint. Requires a prior build.
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import newman from "newman";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { bootstrapSuperAdmin } from "../src/modules/auth/identity.ts";
import { hashPassword } from "../src/modules/auth/password.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import { initializeArchives, archiveCollections } from "../src/modules/archives/store.ts";
import { initializeEvents } from "../src/modules/events/store.ts";
import { initializeArticles } from "../src/modules/articles/store.ts";
import { ingestionSecretHash } from "../src/integrations/apps-script.ts";

let replica;
let child;
try {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const address = listener.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise(resolve => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const password = randomBytes(32).toString("base64url");
  const ingestionSecret = randomBytes(32).toString("base64url");
  const calendarId = "http-test-calendar@group.calendar.google.com";
  const formId = "http-test-form";
  const env = {
    ...process.env, MONGODB_URI: replica.getUri(), MONGODB_DATABASE: "kmits_http_local_test", APP_ORIGIN: origin,
    APPS_SCRIPT_INGESTION_SECRET_SHA256: ingestionSecretHash(ingestionSecret),
    ARCHIVE_SOURCE_CONFIG: JSON.stringify([{ streamId: "http-test-stream", folderId: "http-folder", ministryId: "http-ministry" }]),
    EVENT_CALENDAR_ID: calendarId, ARTICLE_FORM_ID: formId,
    DRIVE_SERVICE_ACCOUNT_EMAIL: "", DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY: "", DRIVE_PUBLIC_API_KEY: "",
    BOOTSTRAP_SUPER_ADMIN_USERNAME: "", BOOTSTRAP_SUPER_ADMIN_PASSWORD_HASH: "",
  };
  Object.assign(process.env, env);
  const database = await getDatabase();
  await initializeAuth(database);
  await initializeArchives(database);
  await initializeEvents(database);
  await initializeArticles(database);
  const store = authCollections(database);
  await bootstrapSuperAdmin(store, "http-owner", await hashPassword(password));
  child = spawn(process.execPath, [fileURLToPath(new URL("../../frontend/node_modules/next/dist/bin/next", import.meta.url)), "start", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: fileURLToPath(new URL("../../frontend/", import.meta.url)), env, stdio: "ignore", windowsHide: true,
  });
  let startupError;
  child.once("error", error => { startupError = error; });
  let started = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw Error("Local server exited before startup. Build the current frontend first.");
    try { if ((await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) })).ok) { started = true; break; } } catch { /* Startup pending. */ }
    await delay(200);
  }
  assert.ok(started, "Local Next.js test server must start; build current source first.");
  assert.equal((await fetch(`${origin}/api/ready`)).status, 200);
  async function runCollection(file, values) {
    const collection = JSON.parse(await readFile(new URL(`../postman/${file}`, import.meta.url), "utf8"));
    const summary = await new Promise((resolve, reject) => newman.run({
      collection, environment: { values: Object.entries(values).map(([key,value]) => ({key,value,enabled:true})) },
      timeoutRequest: 10000, bail: true,
      // No reporter dumps: responses can contain one-time passwords and cookies.
    }, (error, result) => error ? reject(error) : resolve(result)));
    if (summary.run.failures.length) {
      const names = summary.run.failures.map(failure => failure.source?.name ?? "request assertion").join(", ");
      throw Error(`${file} failed: ${names}. Credentials and response bodies withheld.`);
    }
    return summary.run.stats.requests.total;
  }
  const smoke = await runCollection("KMITS.postman_collection.json", {
    baseUrl: origin, recordId: "00000000-0000-4000-8000-000000000001", readyExpectedStatus: "200", loginExpectedStatus: "401", integrationProbeStatus: "401",
  });
  const workflow = await runCollection("Auth.postman_collection.json", {
    baseUrl: origin, username: "http-owner", password, newPassword: randomBytes(32).toString("base64url"), ingestionSecret,
  });
  const timeline = await runCollection("Timeline.postman_collection.json", { baseUrl: origin, username: "http-owner", password, ingestionSecret, calendarId });
  const articles = await runCollection("Articles.postman_collection.json", { baseUrl: origin, username: "http-owner", password, ingestionSecret, formId });
  assert.equal((await store.accounts.findOne({ username: "http-admin" }))?.active, false);
  assert.equal(await store.sessions.countDocuments({}), 0);
  const archives = archiveCollections(database);
  assert.equal(await archives.archives.countDocuments({ sourceState: "VALID", manualHidden: false }), 1);
  assert.equal(await store.audit.countDocuments({ action: "archive.hidden" }), 1);
  assert.equal(await store.audit.countDocuments({ action: "archive.unhidden" }), 1);
  assert.equal(await store.audit.countDocuments({ action: "event.hidden" }), 1);
  assert.equal(await store.audit.countDocuments({ action: "article.published" }), 2);
  assert.equal(await store.audit.countDocuments({ action: "article.unpublished" }), 1);
  console.log(`PASS: ${smoke} anonymous probes, ${workflow} login/account/Archive, ${timeline} Timeline and ${articles} Articles workflow requests. Temporary database only.`);
} finally {
  if (child?.pid && child.exitCode === null) {
    const ended = once(child, "exit"); child.kill(); await ended;
  }
  await (await getMongoClient().catch(() => undefined))?.close();
  await replica?.stop();
}
