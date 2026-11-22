import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import { csrfForSession, opaqueToken, tokenHash } from "../src/modules/auth/security.ts";
import { hashPassword } from "../src/modules/auth/password.ts";
import { archiveCollections, initializeArchives } from "../src/modules/archives/store.ts";
import type { ArchiveRecord } from "../src/modules/archives/models.ts";
import { knowledgeCollections, initializeKnowledge } from "../src/modules/knowledge/store.ts";
import { knowledgeAdminList, knowledgeCreate, knowledgeDelete, knowledgeDetail, knowledgeList, knowledgeUpdate } from "../src/modules/knowledge/handlers.ts";
import { slugify } from "../src/modules/knowledge/validation.ts";

const ORIGIN = "http://localhost:3000";
let replica: MongoMemoryReplSet;
const tokens: Record<"admin" | "temporary", string> = { admin: opaqueToken(), temporary: opaqueToken() };
const originalEnvironment = { ...process.env };

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "knowledge_test";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.ARCHIVE_SOURCE_CONFIG = JSON.stringify([
    { streamId: "finance", ministryId: "finance", folderId: "folder-finance" },
    { streamId: "policy", ministryId: "policy", folderId: "folder-policy" },
    { streamId: "policy-2", ministryId: "policy", folderId: "folder-policy-2" },
  ]);
  const db = await getDatabase();
  await initializeAuth(db);
  await initializeArchives(db);
  await initializeKnowledge(db);
  const auth = authCollections(db);
  const now = new Date();
  for (const [kind, token] of Object.entries(tokens)) {
    const accountId = randomUUID();
    await auth.accounts.insertOne({ _id: accountId, username: kind, passwordHash: await hashPassword("Integration-Password-123!"),
      requirePasswordChange: kind === "temporary", name: kind, role: "ADMIN", active: true, authVersion: 0, createdBy: "test", createdAt: now, updatedAt: now });
    await auth.sessions.insertOne({ _id: tokenHash(token), accountId, authVersion: 0, createdAt: now, expiresAt: new Date(Date.now() + 3600000) });
  }
});
beforeEach(async () => {
  const db = await getDatabase();
  await knowledgeCollections(db).groups.deleteMany({});
  await archiveCollections(db).archives.deleteMany({});
});
after(async () => {
  if (replica) { await (await getMongoClient()).close(); await replica.stop(); }
  process.env = originalEnvironment;
});

function call(method: string, path: string, body?: unknown, token: string | null = tokens.admin, csrf = true) {
  const headers: Record<string, string> = {};
  if (token) Object.assign(headers, { cookie: `kmits_session=${token}`, origin: ORIGIN, ...(csrf ? { "x-csrf-token": csrfForSession(token) } : {}) });
  if (body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${path}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
}
async function json<T = Record<string, unknown>>(response: Response, status = 200): Promise<T> {
  const body = await response.json() as { data: T; error?: { code: string } };
  assert.equal(response.status, status, JSON.stringify(body));
  return (status === 200 ? body.data : body.error) as T;
}
async function document(ministryId: string, updatedAt: Date, visible = true) {
  const record: ArchiveRecord = {
    _id: randomUUID(), externalSubmissionId: randomUUID(), ministryId, sourceFolderId: `folder-${ministryId}`, streamId: ministryId,
    metadataDriveVersion: "1", scanSequence: "1", sourceState: visible ? "VALID" : "MISSING", suppressionReason: null, manualHidden: false, generation: 1,
    snapshot: { metadata: { schemaVersion: 1, driveFileId: "pdf", title: "Doc", description: "", category: "", year: null, authors: [] },
      pdf: { driveFileId: "pdf", mimeType: "application/pdf", sha256: "a".repeat(64), publicReadable: true }, fingerprint: "f" },
    lastSourceCheckedAt: updatedAt, lastReceivedAt: updatedAt, createdAt: updatedAt, updatedAt,
  };
  await archiveCollections(await getDatabase()).archives.insertOne(record);
}
const group = (extra: Record<string, unknown> = {}) => ({
  ministryId: "finance", name: "Kastrat & Kebijakan Publik", description: "Kajian strategis", driveUrl: "https://drive.google.com/drive/folders/abc", ...extra,
});
type Admin = { id: string; slug: string; revision: number; documentCount: number; lastDocumentAt: string | null; hidden: boolean; name: string };

test("admins create, edit, hide and delete groups with CSRF, revisions, uniqueness and audit", async () => {
  assert.equal((await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group(), null))).status, 401);
  assert.equal((await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group(), tokens.admin, false))).status, 403);
  assert.equal((await json(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group(), tokens.temporary)), 403) as { code: string }).code, "PASSWORD_CHANGE_REQUIRED");

  for (const invalid of [group({ ministryId: "unknown" }), group({ driveUrl: "http://drive.google.com/x" }), group({ driveUrl: "https://evil.example/drive.google.com" }),
    group({ driveUrl: "https://drive.google.com:444/x" }), group({ driveUrl: `https://drive.google.com/${"é".repeat(200)}` }),
    group({ name: " " }), group({ description: undefined }), group({ slug: "Bad Slug" }), group({ order: -1 }), group({ notes: "x" })]) {
    assert.equal((await json(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", invalid)), 400) as { code: string }).code, "INVALID_KNOWLEDGE_GROUP", JSON.stringify(invalid));
  }

  await document("finance", new Date("2026-01-02T00:00:00Z"));
  await document("finance", new Date("2026-01-05T00:00:00Z"));
  await document("finance", new Date("2026-02-01T00:00:00Z"), false);
  await document("FINANCE", new Date("2026-01-03T00:00:00Z"));
  const created = await json<Admin>(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group())));
  assert.equal(created.slug, "kastrat-kebijakan-publik");
  assert.equal(created.revision, 1);
  assert.equal(created.documentCount, 3, "only visible documents count, matched like the archive filter (case-insensitive)");
  assert.equal(created.lastDocumentAt, "2026-01-05T00:00:00.000Z");

  assert.equal((await json(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group({ slug: "other" }))), 409) as { code: string }).code, "KNOWLEDGE_GROUP_EXISTS");
  assert.equal((await json(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group({ ministryId: "policy" }))), 409) as { code: string }).code, "KNOWLEDGE_GROUP_SLUG_TAKEN");

  const path = `/api/admin/knowledge-groups/${created.id}`;
  assert.equal((await json(await knowledgeUpdate(call("PATCH", path, { revision: 1 })), 400) as { code: string }).code, "INVALID_KNOWLEDGE_GROUP");
  const edited = await json<Admin>(await knowledgeUpdate(call("PATCH", path, { revision: 1, name: "Kajian Strategis", order: 5 })));
  assert.equal(edited.revision, 2); assert.equal(edited.name, "Kajian Strategis"); assert.equal(edited.slug, "kastrat-kebijakan-publik", "the slug does not follow the name");
  assert.equal((await json(await knowledgeUpdate(call("PATCH", path, { revision: 1, name: "Lost update" })), 409) as { code: string }).code, "KNOWLEDGE_GROUP_CHANGED");
  assert.equal((await knowledgeUpdate(call("PATCH", `/api/admin/knowledge-groups/${randomUUID()}`, { revision: 1, name: "x" }))).status, 404);

  // Concurrent edits at the same revision: exactly one wins.
  const races = await Promise.all([knowledgeUpdate(call("PATCH", path, { revision: 2, title: "A" })), knowledgeUpdate(call("PATCH", path, { revision: 2, title: "B" }))]);
  assert.deepEqual(races.map(response => response.status).sort(), [200, 409]);

  const hidden = await json<Admin>(await knowledgeUpdate(call("PATCH", path, { revision: 3, hidden: true })));
  assert.equal(hidden.hidden, true);
  const adminList = await json<{ items: Admin[]; total: number; unassignedMinistries: string[] }>(await knowledgeAdminList(call("GET", "/api/admin/knowledge-groups")));
  assert.equal(adminList.total, 1, "hidden groups stay visible to admins");
  assert.deepEqual(adminList.unassignedMinistries, ["policy"], "ministries are listed once even with several folders");

  assert.equal((await knowledgeDelete(call("DELETE", path, undefined, tokens.admin, false))).status, 403);
  assert.deepEqual(await json(await knowledgeDelete(call("DELETE", path))), { id: created.id, deleted: true });
  assert.equal((await knowledgeDelete(call("DELETE", path))).status, 404);
  assert.equal(await archiveCollections(await getDatabase()).archives.countDocuments({ ministryId: { $in: ["finance", "FINANCE"] } }), 4, "documents stay after deleting the group");

  const audit = await authCollections(await getDatabase()).audit.find({ targetId: created.id }).sort({ at: 1 }).toArray();
  assert.deepEqual(audit.map(entry => entry.action), ["knowledge.created", "knowledge.updated", "knowledge.updated", "knowledge.updated", "knowledge.deleted"]);
  assert.equal((audit[1].changes as { before: { name: string } }).before.name, "Kastrat & Kebijakan Publik");
});

test("public list and detail show only visible groups, with search, sort and pagination", async () => {
  await document("finance", new Date("2026-01-01T00:00:00Z"));
  await document("policy", new Date("2026-03-01T00:00:00Z"));
  await document("policy", new Date("2026-02-01T00:00:00Z"));
  const finance = await json<Admin>(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group({ name: "Zakat Finance", order: 1 }))));
  const policy = await json<Admin>(await knowledgeCreate(call("POST", "/api/admin/knowledge-groups", group({ ministryId: "policy", name: "Advokasi", description: "Kebijakan kampus", order: 2 }))));
  const ids = async (query = "") => (await json<{ items: { id: string }[] }>(await knowledgeList(call("GET", `/api/knowledge-groups${query}`, undefined, null)))).items.map(item => item.id);
  assert.deepEqual(await ids(), [finance.id, policy.id], "admin order first");
  assert.deepEqual(await ids("?sort=name"), [policy.id, finance.id]);
  assert.deepEqual(await ids("?sort=newest"), [policy.id, finance.id]);
  assert.deepEqual(await ids("?q=KAMPUS"), [policy.id]);
  assert.deepEqual(await ids("?q=a.*"), []);
  assert.deepEqual(await ids("?limit=1&offset=1"), [policy.id]);
  for (const query of ["?sort=random", "?q=", "?ministryId=finance", "?limit=101"]) {
    assert.equal((await knowledgeList(call("GET", `/api/knowledge-groups${query}`, undefined, null))).status, 400, query);
  }

  const detail = await json<Admin & { driveUrl: string; documentsUrl: string }>(await knowledgeDetail(call("GET", "/api/knowledge-groups/advokasi", undefined, null)));
  assert.equal(detail.documentCount, 2); assert.equal(detail.documentsUrl, "/api/archives?ministryId=policy");
  assert.equal("revision" in detail, false, "admin fields are not public");
  await knowledgeUpdate(call("PATCH", `/api/admin/knowledge-groups/${policy.id}`, { revision: 1, hidden: true }));
  assert.equal((await knowledgeDetail(call("GET", "/api/knowledge-groups/advokasi", undefined, null))).status, 404);
  assert.deepEqual(await ids(), [finance.id]);
  assert.equal((await knowledgeDetail(call("GET", "/api/knowledge-groups/..%2Fetc", undefined, null))).status, 404);
});

test("slugs come from names without accents or symbols", () => {
  assert.equal(slugify("Kastrat & Kebijakan Publik"), "kastrat-kebijakan-publik");
  assert.equal(slugify("  Énergie — Riset 2026! "), "energie-riset-2026");
  assert.equal(slugify("***"), "");
  assert.equal(slugify("a".repeat(100)).length, 80);
});
