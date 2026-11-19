// Request examples shared by the OpenAPI document and the Postman workflows.

// Matches the test runner's ARCHIVE_SOURCE_CONFIG fixture registration.
export const observationExample = {
  protocolVersion: 1, streamId: "http-test-stream", deliveryId: "http-delivery-1", scanSequence: "1", metadataFileId: "http-metadata", metadataDriveVersion: "1", observation: "VALID", sourceCheckedAt: "2026-01-01T00:00:00.000Z", folderId: "http-folder",
  metadata: { schemaVersion: 1, driveFileId: "http-pdf", title: "HTTP archive fixture", description: "Temporary test document", category: "Reports", year: 2026, authors: ["Test ministry"] },
  pdf: { driveFileId: "http-pdf", folderId: "http-folder", mimeType: "application/pdf", sha256: "a".repeat(64), publicReadable: true, size: 100 },
};

export const eventExample = {
  protocolVersion: 1, calendarId: "km-its@group.calendar.google.com",
  events: [
    { eventId: "abc123def456", updated: "2026-11-16T03:00:00.000Z", status: "confirmed", title: "Ministry meeting", description: "Agenda", location: "ITS Surabaya", organization: "Ministry of Education", allDay: false, startAt: "2026-11-20T02:00:00.000Z", endAt: "2026-11-20T04:00:00.000Z" },
    { eventId: "removed789", updated: "2026-11-16T03:05:00.000Z", status: "cancelled" },
  ],
};

export const articleExample = {
  protocolVersion: 1, formId: "1FAIpQLSexampleFormId",
  submissions: [{
    responseId: "2_ABaOnudExampleResponse", submittedAt: "2026-11-16T03:00:00.000Z", submitterEmail: "contributor@example.com",
    article: { schemaVersion: 1, title: "Ministry work programme", summary: "Short teaser.", category: "News", ministry: "Ministry of Education", authors: ["Contributor"], coverImage: { driveFileId: "1AbCdEfGhIjK", alt: "Team photo" }, body: "## Heading\n\nMarkdown body." },
  }],
};
