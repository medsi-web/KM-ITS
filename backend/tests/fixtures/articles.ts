// Shared Article fixtures, outside *.test.ts so imports register no hooks.
export const FORM = "1FAIpQLSkmitsTestForm";

export function article(overrides: Record<string, unknown> = {}) {
  return { schemaVersion: 1, title: "Ministry programme", summary: "Teaser", category: "News", ministry: "Ministry of Education",
    authors: ["Contributor"], coverImage: { driveFileId: "cover-image-id", alt: "Team photo" }, body: "## Heading\n\nBody text.", ...overrides };
}

export function submission(responseId = "response1", submittedAt = "2026-11-16T00:00:00.000Z", articleOverrides: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) {
  return { responseId, submittedAt, submitterEmail: "contributor@example.com", article: article(articleOverrides), ...extra };
}

export function articleBatch(...submissions: unknown[]) { return { protocolVersion: 1, formId: FORM, submissions }; }
