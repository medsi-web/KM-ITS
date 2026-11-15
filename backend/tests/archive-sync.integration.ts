import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { archiveCollections, initializeArchives } from "../src/modules/archives/store.ts";
import { ingestArchive } from "../src/modules/archives/ingestion.ts";
import { isArchiveVisible } from "../src/modules/archives/models.ts";
import { observation } from "./archive-sync.test.ts";
let replica: MongoMemoryReplSet;
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri(); process.env.MONGODB_DATABASE = "archive_sync_test";
  await initializeArchives(await getDatabase());
});
after(async () => { await (await getMongoClient()).close(); await replica?.stop(); });
test("auto-publish, retry ledger, suppression recovery, sequencing and manual hiding", async () => {
  const store = archiveCollections(await getDatabase());
  assert.equal((await ingestArchive(observation())).outcome, "applied");
  assert.ok(isArchiveVisible((await store.archives.findOne({ externalSubmissionId: "metadata" }))!));
  assert.equal((await ingestArchive(observation())).outcome, "duplicate");
  assert.equal((await ingestArchive({ ...observation(), metadata: { ...observation().metadata, title: "conflict" } })).outcome, "conflict");
  const { metadata: _metadata, pdf: _pdf, ...missing } = observation("3");
  void _metadata; void _pdf;
  assert.equal((await ingestArchive({ ...missing, observation: "MISSING" })).outcome, "applied");
  assert.equal((await ingestArchive(observation("2"))).outcome, "stale");
  await store.archives.updateOne({ externalSubmissionId: "metadata" }, { $set: { manualHidden: true } });
  await ingestArchive(observation("4"));
  const recovered = (await store.archives.findOne({ externalSubmissionId: "metadata" }))!;
  assert.equal(recovered.sourceState, "VALID"); assert.equal(isArchiveVisible(recovered), false);
  const generation = recovered.generation;
  assert.equal((await ingestArchive(observation("5"))).outcome, "unchanged");
  assert.equal((await store.archives.findOne({ _id: recovered._id }))!.generation, generation);
  await ingestArchive({ ...missing, deliveryId: "scan-error-99", scanSequence: "99", observation: "SYNC_ERROR" });
  assert.equal((await store.archives.findOne({ _id: recovered._id }))!.scanSequence, "5");
  assert.equal((await ingestArchive(observation("0", "another"))).outcome, "applied");
  assert.equal(await store.archives.countDocuments(), 2);
  await assert.rejects(ingestArchive({ ...observation("6"), metadata: {} }));
  // One log per ingestion call above, including the rejected invalid payload.
  assert.equal(await store.syncLogs.countDocuments(), 10);
});
test("scan failures reserve delivery identity and lower versions conflict without state changes", async () => {
  const input = observation("100", "ledger-check");
  const { metadata: _metadata, pdf: _pdf, ...envelope } = input;
  void _metadata; void _pdf;
  const failure = { ...envelope, observation: "SYNC_ERROR", diagnostics: "page failed" };
  assert.equal((await ingestArchive(failure)).outcome, "unchanged");
  assert.equal((await ingestArchive(failure)).outcome, "duplicate");
  assert.equal((await ingestArchive({ ...failure, diagnostics: "different failure" })).outcome, "conflict");
  assert.equal((await ingestArchive(input)).outcome, "conflict");
  assert.equal((await ingestArchive({ ...input, deliveryId: "another-delivery" })).outcome, "conflict");
  const store = archiveCollections(await getDatabase());
  assert.equal(await store.archives.countDocuments({ externalSubmissionId: "ledger-check" }), 0);
  assert.equal((await ingestArchive(observation("101", "ledger-check"))).outcome, "applied");
  assert.equal((await ingestArchive({ ...observation("102", "ledger-check"), metadataDriveVersion: "100" })).outcome, "conflict");
  assert.equal((await store.archives.findOne({ externalSubmissionId: "ledger-check" }))!.scanSequence, "101");
});
test("current PDF identity rejects changed content and accepts a new PDF identity", async () => {
  const first = observation("200", "pdf-immutability");
  assert.equal((await ingestArchive(first)).outcome, "applied");
  const changed = observation("201", "pdf-immutability");
  changed.pdf.sha256 = "b".repeat(64);
  assert.equal((await ingestArchive(changed)).outcome, "conflict");
  const store = archiveCollections(await getDatabase());
  const retained = (await store.archives.findOne({ externalSubmissionId: "pdf-immutability" }))!;
  assert.equal(retained.scanSequence, "200");
  assert.equal(retained.snapshot!.pdf.sha256, first.pdf.sha256);
  const replacement = observation("202", "pdf-immutability");
  replacement.metadata.driveFileId = "replacement-pdf";
  replacement.pdf.driveFileId = "replacement-pdf";
  replacement.pdf.sha256 = "b".repeat(64);
  assert.equal((await ingestArchive(replacement)).outcome, "applied");
  assert.equal((await store.archives.findOne({ externalSubmissionId: "pdf-immutability" }))!.snapshot!.pdf.driveFileId, "replacement-pdf");
});
test("identity follows metadata file ID, not titles or names, and receipt time comes from the backend", async () => {
  const store = archiveCollections(await getDatabase());
  // Same title and authors under two metadata files stay separate documents.
  assert.equal((await ingestArchive(observation("300", "same-title-a"))).outcome, "applied");
  // Every distinct file observation needs its own stream sequence.
  assert.equal((await ingestArchive(observation("310", "same-title-b"))).outcome, "applied");
  const twins = await store.archives.find({ externalSubmissionId: { $in: ["same-title-a", "same-title-b"] } }).toArray();
  assert.equal(twins.length, 2);
  assert.notEqual(twins[0]._id, twins[1]._id);
  // Renaming files without changing the metadata ID updates the same record.
  const original = (await store.archives.findOne({ externalSubmissionId: "same-title-a" }))!;
  const renamed = observation("301", "same-title-a");
  (renamed.pdf as Record<string, unknown>).name = "renamed-report.pdf";
  assert.equal((await ingestArchive(renamed)).outcome, "applied");
  const updated = (await store.archives.findOne({ externalSubmissionId: "same-title-a" }))!;
  assert.equal(updated._id, original._id);
  assert.equal(updated.snapshot!.pdf.name, "renamed-report.pdf");
  // Payload-supplied receipt time is rejected; the backend clock is recorded.
  await assert.rejects(ingestArchive({ ...observation("302", "same-title-a"), receivedAt: "2000-01-01T00:00:00Z" }));
  const receivedAt = new Date("2026-11-16T03:00:00Z");
  const result = await ingestArchive(observation("303", "same-title-a"), receivedAt);
  assert.equal(result.receivedAt, receivedAt.toISOString());
  assert.equal((await store.archives.findOne({ externalSubmissionId: "same-title-a" }))!.lastReceivedAt.toISOString(), receivedAt.toISOString());
});
test("concurrent first deliveries and cross-source claims never fork identity", async () => {
  const input = observation("20", "concurrent");
  const results = await Promise.all([ingestArchive(input), ingestArchive(input), ingestArchive(input)]);
  assert.deepEqual(results.map(result => result.outcome).sort(), ["applied", "duplicate", "duplicate"]);
  const store = archiveCollections(await getDatabase());
  assert.equal(await store.archives.countDocuments({ externalSubmissionId: "concurrent" }), 1);
  process.env.ARCHIVE_SOURCE_CONFIG = JSON.stringify([{ streamId: "stream", ministryId: "ministry", folderId: "folder" }, { streamId: "other", ministryId: "other", folderId: "other" }]);
  assert.equal((await ingestArchive({ ...input, streamId: "other", folderId: "other", pdf: { ...input.pdf, folderId: "other" } })).outcome, "conflict");
});
