import assert from "node:assert/strict";
import { test } from "node:test";
import { decimal, payloadHash, validateObservation } from "../src/modules/archives/validation.ts";
process.env.ARCHIVE_SOURCE_CONFIG = JSON.stringify([{ streamId: "stream", ministryId: "ministry", folderId: "folder" }]);
export function observation(sequence = "1", metadataFileId = "metadata") {
  return { protocolVersion: 1, streamId: "stream", deliveryId: `delivery-${sequence}-${metadataFileId}`, scanSequence: sequence, metadataFileId, metadataDriveVersion: sequence, observation: "VALID", sourceCheckedAt: "2026-11-15T00:00:00Z", folderId: "folder", metadata: { schemaVersion: 1, driveFileId: "pdf", title: "Title", description: "", category: "Report", year: 2026, authors: ["Author"] }, pdf: { driveFileId: "pdf", folderId: "folder", mimeType: "application/pdf", sha256: "a".repeat(64), publicReadable: true } };
}
test("normalization rejects unknown metadata, mismatched binding and source authority", () => {
  const input = observation();
  assert.equal(validateObservation(input).source.ministryId, "ministry");
  assert.throws(() => validateObservation({ ...input, ministryId: "attacker" }));
  assert.throws(() => validateObservation({ ...input, metadata: { ...input.metadata, notes: "not public" } }));
  assert.throws(() => validateObservation({ ...input, pdf: { ...input.pdf, driveFileId: "other" } }));
  assert.throws(() => validateObservation({ ...input, pdf: { ...input.pdf, folderId: "other" } }));
  assert.throws(() => decimal("01"));
  assert.equal(decimal("900719925474099312345"), "900719925474099312345");
});
test("optional metadata defaults, version requirement, and canonical payload hashing", () => {
  const input = observation();
  const minimal = validateObservation({ ...input, metadata: { schemaVersion: 1, driveFileId: "pdf", title: "Title" } });
  assert.deepEqual(minimal.snapshot?.metadata, { schemaVersion: 1, driveFileId: "pdf", title: "Title", description: "", category: "", year: null, authors: [] });
  assert.throws(() => validateObservation({ ...input, metadataDriveVersion: null }));
  assert.equal(payloadHash({ z: [{ b: 1, a: 2 }], a: 0 }), payloadHash({ a: 0, z: [{ a: 2, b: 1 }] }));
  assert.notEqual(payloadHash(validateObservation({ ...input, diagnostics: "first" })), payloadHash(validateObservation({ ...input, diagnostics: "second" })));
});
