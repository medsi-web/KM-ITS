import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import { csrfForSession, opaqueToken, tokenHash } from "../src/modules/auth/security.ts";
import { hashPassword } from "../src/modules/auth/password.ts";
import { archiveCollections, initializeArchives } from "../src/modules/archives/store.ts";
import { archivesAdminList, archivesAdminDetail, archivesPublish, archivesUnpublish } from "../src/modules/archives/admin.ts";
import { syncLogs as archiveSyncLogs } from "../src/modules/sync/handlers.ts";
import type { ArchiveRecord } from "../src/modules/archives/models.ts";

let replica: MongoMemoryReplSet;
const tokens: string[] = [];
const originalEnvironment = { ...process.env };
const id = randomUUID();
const now = new Date();
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "archive_admin_test";
  process.env.APP_ORIGIN = "http://localhost:3000";
  const db = await getDatabase();
  await initializeAuth(db);
  await initializeArchives(db);
  const auth = authCollections(db);
  for (const role of ["ADMIN", "SUPER_ADMIN"] as const) {
    const accountId = randomUUID();
    const token = opaqueToken();
    tokens.push(token);
    await auth.accounts.insertOne({ _id: accountId, username: role.toLowerCase(), passwordHash: await hashPassword("Integration-Password-123!"),
      requirePasswordChange: false, name: role, role, active: true, authVersion: 0, createdBy: "test", createdAt: now, updatedAt: now });
    await auth.sessions.insertOne({ _id: tokenHash(token), accountId, authVersion: 0, createdAt: now, expiresAt: new Date(Date.now() + 3600000) });
  }
  const record: ArchiveRecord = { _id: id, externalSubmissionId: "metadata", ministryId: "ministry", sourceFolderId: "folder", streamId: "stream",
    metadataDriveVersion: "1", scanSequence: "1", sourceState: "VALID", suppressionReason: null, manualHidden: false, generation: 1,
    snapshot: { metadata: { schemaVersion: 1, driveFileId: "pdf", title: "Title", description: "Description", category: "Category", year: 2026, authors: [] },
      pdf: { driveFileId: "pdf", mimeType: "application/pdf", sha256: "a".repeat(64), publicReadable: true }, fingerprint: "fingerprint" },
    lastSourceCheckedAt: now, lastReceivedAt: now, createdAt: now, updatedAt: now };
  await archiveCollections(db).archives.insertOne(record);
  await archiveCollections(db).syncLogs.insertOne({ _id: "log", streamId: "stream", deliveryId: "delivery", externalSubmissionId: "metadata",
    scanSequence: "1", receivedAt: now, sourceCheckedAt: now, observation: "VALID", outcome: "applied" });
});
after(async () => {
  if (replica) { await (await getMongoClient()).close(); await replica.stop(); }
  process.env = originalEnvironment;
});
function request(path: string, token?: string, mutation = false, validCsrf = true) {
  return new Request(`http://localhost:3000/api/admin/${path}`, { method: mutation ? "POST" : "GET", headers: token ? {
    cookie: `kmits_session=${token}`, origin: "http://localhost:3000", "x-csrf-token": validCsrf ? csrfForSession(token) : "wrong",
  } : {} });
}

test("admin monitoring, manual overrides, audit and sync history enforce access and preserve source health", async () => {
  for (const handler of [archivesAdminList, archivesAdminDetail, archiveSyncLogs, archivesPublish, archivesUnpublish]) {
    assert.equal((await handler(request(`archives/${id}`))).status, 401);
  }
  for (const token of tokens) {
    const response = await archivesAdminList(request("archives?limit=1&offset=0", token));
    assert.equal(response.status, 200);
    assert.equal((await response.json() as { data: { total: number } }).data.total, 1);
  }
  assert.equal((await archivesAdminList(request("archives?limit=101", tokens[0]))).status, 400);
  assert.equal((await archivesUnpublish(request(`archives/${id}/unpublish`, tokens[0], true, false))).status, 403);
  const hide = await archivesUnpublish(request(`archives/${id}/unpublish`, tokens[0], true));
  assert.equal(hide.status, 200);
  assert.equal((await hide.json() as { data: { effectiveVisibility: boolean } }).data.effectiveVisibility, false);
  const store = archiveCollections(await getDatabase());
  assert.equal((await store.archives.findOne({ _id: id }))?.generation, 2);
  await archivesUnpublish(request(`archives/${id}/unpublish`, tokens[0], true));
  assert.equal((await store.archives.findOne({ _id: id }))?.generation, 2);
  // A new source observation does not clear the manual override.
  await store.archives.updateOne({ _id: id }, { $set: { sourceState: "INVALID", suppressionReason: "INVALID_METADATA" }, $inc: { generation: 1 } });
  const publish = await archivesPublish(request(`archives/${id}/publish`, tokens[1], true));
  assert.equal(publish.status, 200);
  const published = (await publish.json() as { data: { manualHidden: boolean; sourceState: string; effectiveVisibility: boolean } }).data;
  assert.equal(published.manualHidden, false);
  assert.equal(published.sourceState, "INVALID");
  assert.equal(published.effectiveVisibility, false);
  const detail = (await (await archivesAdminDetail(request(`archives/${id}`, tokens[0]))).json() as { data: { lastSync: { id: string }; lastSourceCheckedAt: string } }).data;
  assert.equal(detail.lastSync.id, "log");
  assert.equal(detail.lastSourceCheckedAt, now.toISOString());
  const logs = await archiveSyncLogs(request("sync/logs?streamId=stream&limit=1", tokens[0]));
  assert.equal(logs.status, 200);
  assert.equal((await logs.json() as { data: { items: { id: string }[] } }).data.items[0].id, "log");
  const audits = await authCollections(await getDatabase()).audit.find({ targetId: id }).toArray();
  assert.equal(audits.length, 3);
  assert.equal(audits[0].changes?.actor && (audits[0].changes.actor as { role: string }).role, "ADMIN");
  assert.ok(!JSON.stringify(audits).includes("passwordHash"));
  assert.equal((await archivesAdminDetail(request("archives/unknown", tokens[0]))).status, 404);
  assert.equal((await archivesPublish(request("archives/unknown/publish", tokens[0], true))).status, 404);
});

