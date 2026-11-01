// Isolated integration runner, never imported by the application. No HTTP login
// bypass exists: fixtures call backend services directly in this test process.
import assert from "node:assert/strict";
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
import { issueGoogleSession } from "../src/modules/auth/session.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";

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
  await new Promise((resolve) => listener.close(resolve));
  const origin = `http://127.0.0.1:${port}`;
  const env = {
    ...process.env,
    MONGODB_URI: replica.getUri(), MONGODB_DATABASE: "kmits_http_auth_test",
    APP_ORIGIN: origin, GOOGLE_CLIENT_ID: "local-test-client", GOOGLE_CLIENT_SECRET: "local-test-secret",
    APPS_SCRIPT_INGESTION_SECRET: "", BOOTSTRAP_SUPER_ADMIN_EMAIL: "",
  };
  Object.assign(process.env, env);
  const database = await getDatabase();
  await initializeAuth(database);
  const store = authCollections(database);
  await bootstrapSuperAdmin(store, "owner@gmail.com");
  const issued = await issueGoogleSession(store, { sub: "isolated-test-owner", email: "owner@gmail.com", emailVerified: true });
  child = spawn(process.execPath, [
    fileURLToPath(new URL("../../frontend/node_modules/next/dist/bin/next", import.meta.url)),
    "start", "--hostname", "127.0.0.1", "--port", String(port),
  ], { cwd: fileURLToPath(new URL("../../frontend/", import.meta.url)), env, stdio: "ignore", windowsHide: true });
  let started = false;
  for (let attempt = 0; attempt < 150; attempt++) {
    if (child.exitCode !== null) throw new Error("Local test server exited before startup. Run pnpm build first.");
    try {
      const response = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(1000) });
      if (response.ok) { started = true; break; }
    } catch { /* Server not listening yet. */ }
    await delay(200);
  }
  assert.ok(started, "Local Next.js test server must start. Run pnpm build first.");
  assert.equal((await fetch(`${origin}/api/ready`)).status, 200);

  const runCollection = async (file, values) => {
    const collection = JSON.parse(await readFile(new URL(`../postman/${file}`, import.meta.url), "utf8"));
    const summary = await new Promise((resolve, reject) => {
      newman.run({
        collection, environment: { values: Object.entries(values).map(([key, value]) => ({ key, value, enabled: true })) },
        timeoutRequest: 10000, reporters: "cli", reporter: { cli: { noAssertions: true, noSuccessAssertions: true } },
        bail: true,
      }, (error, result) => error ? reject(error) : resolve(result));
    });
    assert.equal(summary.run.failures.length, 0, `${file} must pass`);
    return summary.run.stats.requests.total;
  };
  const smoke = await runCollection("KMITS.postman_collection.json", {
    baseUrl: origin, recordId: "00000000-0000-4000-8000-000000000001",
    readyExpectedStatus: "200", loginExpectedStatus: "302", callbackExpectedStatus: "400",
    integrationConfigured: "false", ingestionSecret: "",
  });
  const workflow = await runCollection("Auth.postman_collection.json", {
    baseUrl: origin, sessionCookie: `kmits_session=${issued.token}`,
    inviteEmail: "isolated-postman-invite@gmail.com", csrfToken: "",
  });
  assert.equal(await store.sessions.countDocuments({ _id: issued.session._id }), 0);
  assert.equal((await store.accounts.findOne({ email: "isolated-postman-invite@gmail.com" }))?.active, false);
  console.log(`PASS: ${smoke} anonymous HTTP probes and ${workflow} authenticated workflow requests. Temporary database only; no real Google login claimed.`);
} finally {
  if (child && child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill();
    await ended;
  }
  await (await getMongoClient().catch(() => undefined))?.close();
  await replica?.stop();
}
