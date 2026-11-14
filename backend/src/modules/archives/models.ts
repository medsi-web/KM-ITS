export type SourceState = "VALID" | "INVALID" | "MISSING" | "UNAVAILABLE" | "UNKNOWN";
export interface ArchiveSnapshot {
  metadata: { schemaVersion: 1; driveFileId: string; title: string; description: string; category: string; year: number | null; authors: string[] };
  pdf: { driveFileId: string; mimeType: "application/pdf"; sha256: string; size?: number; name?: string; publicReadable: boolean };
  fingerprint: string;
}
export interface ArchiveRecord {
  _id: string; externalSubmissionId: string; ministryId: string; sourceFolderId: string; streamId: string;
  metadataDriveVersion: string | null; scanSequence: string; sourceState: SourceState; suppressionReason: string | null;
  manualHidden: boolean; snapshot: ArchiveSnapshot | null; generation: number;
  lastSourceCheckedAt: Date | null; lastReceivedAt: Date; createdAt: Date; updatedAt: Date;
}
export type IngestionOutcome = "applied" | "unchanged" | "duplicate" | "stale" | "invalid" | "conflict";
export interface ArchiveSyncLog {
  _id: string; streamId: string; deliveryId: string; externalSubmissionId: string | null; scanSequence: string;
  receivedAt: Date; sourceCheckedAt: Date | null; observation: string; outcome: IngestionOutcome; reason?: string;
}
export interface ArchiveDelivery { _id: string; streamId: string; deliveryId: string; scanSequence: string; payloadHash: string; receivedAt: Date }
export function isArchiveVisible(record: ArchiveRecord): boolean {
  return record.sourceState === "VALID" && !!record.snapshot && !record.manualHidden && record.snapshot.pdf.publicReadable;
}
