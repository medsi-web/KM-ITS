export type ItemOutcome = "applied" | "unchanged" | "stale" | "conflict" | "invalid";

export interface ArticleContent {
  schemaVersion: 1; title: string; summary: string; category: string; ministry: string;
  authors: string[]; coverImage: { driveFileId: string; alt: string } | null; body: string;
}
// `fingerprint` hashes the content only, so draft and published copies compare directly.
export interface ArticleVersion { content: ArticleContent; fingerprint: string }
export interface ArticleDraft extends ArticleVersion {
  revision: number; editedBy: string | null; editedAt: Date | null;
}
export interface ArticlePublished extends ArticleVersion { publishedAt: Date; publishedBy: string }

export interface ArticleRecord {
  _id: string; formId: string; responseId: string;
  submittedAt: Date; submitterEmail: string | null;
  // Hash of the whole source item (content and submitter) for retry detection.
  sourceFingerprint: string;
  source: ArticleVersion; draft: ArticleDraft; sourceUpdatePending: boolean;
  published: ArticlePublished | null; isPublished: boolean; firstPublishedAt: Date | null;
  lastReceivedAt: Date; createdAt: Date; updatedAt: Date;
}
export interface ArticleSyncLog {
  _id: string; formId: string; responseId: string | null; submittedAt: Date | null;
  receivedAt: Date; outcome: ItemOutcome; reason?: string;
}

export function hasUnpublishedChanges(record: ArticleRecord): boolean {
  return !record.published || record.draft.fingerprint !== record.published.fingerprint;
}
