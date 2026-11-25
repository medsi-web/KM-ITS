import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { before, beforeEach, after, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ApiError } from "../src/lib/http.ts";
import { DriveSourceMissing } from "../src/integrations/drive-reader.ts";
import { archiveCollections, initializeArchives } from "../src/modules/archives/store.ts";
import { archivesDetail, archivesList, createArchiveOpen } from "../src/modules/archives/public.ts";
import type { ArchiveRecord } from "../src/modules/archives/models.ts";

let replica: MongoMemoryReplSet | undefined;
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "archive_public_integration";
  await initializeArchives(await getDatabase());
});
beforeEach(async () => { await archiveCollections(await getDatabase()).archives.deleteMany({}); });
after(async () => {
  if (replica) { await (await getMongoClient()).close(); await replica.stop(); }
});
async function fixture(overrides: Partial<ArchiveRecord> = {}): Promise<ArchiveRecord> {
  const now = new Date();
  const record: ArchiveRecord = {
    _id: randomUUID(), externalSubmissionId: randomUUID(), ministryId: "ministry", sourceFolderId: "folder", streamId: "stream",
    metadataDriveVersion: "1", scanSequence: "1", sourceState: "VALID", suppressionReason: null, manualHidden: false,
    snapshot: { metadata: { schemaVersion: 1, driveFileId: "pdf-one", title: "Report", description: "", category: "", year: null, authors: [] }, pdf: { driveFileId: "pdf-one", mimeType: "application/pdf", sha256: "a".repeat(64), publicReadable: true }, fingerprint: "fingerprint-one" },
    generation: 1, lastSourceCheckedAt: now, lastReceivedAt: now, createdAt: now, updatedAt: now, ...overrides,
  };
  await archiveCollections(await getDatabase()).archives.insertOne(record);
  return record;
}
function request(record: ArchiveRecord, open = true) { return new Request(`http://localhost/api/archives/${record._id}${open ? "/open" : ""}`); }

test("public list/detail filter visibility and open verifies binding before no-store redirect", async () => {
  const visible = await fixture();
  const hidden = await fixture({ manualHidden: true });
  await fixture({ sourceState: "MISSING" });
  await fixture({ snapshot: null });
  const privateRecord = await fixture();
  await archiveCollections(await getDatabase()).archives.updateOne({ _id: privateRecord._id }, { $set: { "snapshot.pdf.publicReadable": false } });
  const listed = await archivesList(new Request("http://localhost/api/archives"));
  assert.equal(listed.status, 200);
  assert.equal(listed.headers.get("cache-control"), "no-store");
  const body = await listed.json() as { data: { items: { id: string }[]; total: number } };
  assert.equal(body.data.total, 1); assert.equal(body.data.items[0].id, visible._id);
  assert.equal((await archivesDetail(request(hidden, false))).status, 404);
  assert.equal((await archivesDetail(request(visible, false))).status, 200);
  const open = createArchiveOpen({ async inspectPdf(id, checksum, folder) {
    assert.equal(id, "pdf-one"); assert.equal(checksum, "a".repeat(64)); assert.equal(folder, "folder");
  } });
  const result = await open(request(visible));
  assert.equal(result.status, 302); assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(result.headers.get("location"), "https://drive.google.com/file/d/pdf-one/view");
  assert.equal((await open(request(hidden))).status, 404);
});
test("public list filters by ministry, category and year, searches text and sorts", async () => {
  const snapshot = (title: string, extra: Partial<NonNullable<ArchiveRecord["snapshot"]>["metadata"]>) => ({
    metadata: { schemaVersion: 1 as const, driveFileId: "pdf", title, description: "", category: "", year: null, authors: [], ...extra },
    pdf: { driveFileId: "pdf", mimeType: "application/pdf" as const, sha256: "a".repeat(64), publicReadable: true }, fingerprint: title,
  });
  const day = (n: number) => new Date(Date.UTC(2026, 0, n));
  const budget = await fixture({ ministryId: "finance", updatedAt: day(3), snapshot: snapshot("budget plan", { category: "Report", year: 2026, authors: ["Treasury Team"] }) });
  const audit = await fixture({ ministryId: "finance", updatedAt: day(1), snapshot: snapshot("Audit", { category: "report", year: 2025, description: "Yearly budget review" }) });
  const policy = await fixture({ ministryId: "policy", updatedAt: day(2), snapshot: snapshot("Campus policy", { category: "Study", year: 2026 }) });
  await fixture({ ministryId: "finance", manualHidden: true, snapshot: snapshot("Hidden budget", { category: "Report" }) });
  const ids = async (query: string) => {
    const response = await archivesList(new Request(`http://localhost/api/archives${query}`));
    assert.equal(response.status, 200, query);
    return ((await response.json()) as { data: { items: { id: string }[] } }).data.items.map(item => item.id);
  };
  assert.deepEqual(await ids("?ministryId=finance"), [budget._id, audit._id]);
  assert.deepEqual(await ids("?category=REPORT&sort=oldest"), [audit._id, budget._id]);
  assert.deepEqual(await ids("?year=2026"), [budget._id, policy._id]);
  assert.deepEqual(await ids("?q=BUDGET"), [budget._id, audit._id]);
  assert.deepEqual(await ids("?q=treasury"), [budget._id]);
  assert.deepEqual(await ids("?q=a.*"), []);
  assert.deepEqual(await ids("?sort=title"), [audit._id, budget._id, policy._id]);
  assert.deepEqual(await ids("?ministryId=finance&year=2025&q=review"), [audit._id]);
  for (const query of ["?year=26", "?year=1800", "?sort=random", "?q=", `?q=${"x".repeat(101)}`, "?tag=x"]) {
    assert.equal((await archivesList(new Request(`http://localhost/api/archives${query}`))).status, 400, query);
  }
});
test("confirmed missing PDF suppresses entry; provider failure preserves publication", async () => {
  const record = await fixture();
  const unavailable = createArchiveOpen({ async inspectPdf() { throw new ApiError(503, "DRIVE_UNAVAILABLE", "Temporary failure"); } });
  const failed = await unavailable(request(record));
  assert.equal(failed.status, 503); assert.equal(failed.headers.get("cache-control"), "no-store");
  const store = archiveCollections(await getDatabase());
  assert.equal((await store.archives.findOne({ _id: record._id }))!.sourceState, "VALID");
  const missing = createArchiveOpen({ async inspectPdf() { throw new DriveSourceMissing("PDF_MISSING_OR_INACCESSIBLE"); } });
  assert.equal((await missing(request(record))).status, 404);
  const suppressed = (await store.archives.findOne({ _id: record._id }))!;
  assert.equal(suppressed.sourceState, "UNAVAILABLE"); assert.equal(suppressed.generation, 2);
  assert.deepEqual(suppressed.snapshot, record.snapshot);
});
test("hide during inspection prevents redirect and replacement is reverified", async () => {
  const store = archiveCollections(await getDatabase());
  const hidden = await fixture();
  const hiding = createArchiveOpen({ async inspectPdf() {
    await store.archives.updateOne({ _id: hidden._id }, { $set: { manualHidden: true }, $inc: { generation: 1 } });
  } });
  const hiddenResult = await hiding(request(hidden));
  assert.equal(hiddenResult.status, 404); assert.equal(hiddenResult.headers.get("location"), null);
  const replaced = await fixture();
  const inspected: string[] = [];
  const replacing = createArchiveOpen({ async inspectPdf(id) {
    inspected.push(id);
    if (id === "pdf-one") await store.archives.updateOne({ _id: replaced._id }, {
      $set: { "snapshot.pdf.driveFileId": "pdf-two", "snapshot.metadata.driveFileId": "pdf-two", "snapshot.pdf.sha256": "b".repeat(64), "snapshot.fingerprint": "fingerprint-two" }, $inc: { generation: 1 },
    });
  } });
  const replacedResult = await replacing(request(replaced));
  assert.equal(replacedResult.status, 302);
  assert.deepEqual(inspected, ["pdf-one", "pdf-two"]);
  assert.equal(replacedResult.headers.get("location"), "https://drive.google.com/file/d/pdf-two/view");
  assert.equal(replacedResult.headers.get("cache-control"), "no-store");
});
