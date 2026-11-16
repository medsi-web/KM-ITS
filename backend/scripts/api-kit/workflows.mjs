// Destructive localhost-only Postman workflows for fresh temporary databases.
import { observationExample } from "./fixtures.mjs";
import { anonymous, assertCode, COLLECTION_SCHEMA, commonChecks, integration, item } from "./postman.mjs";

// ---- Shared steps ----------------------------------------------------------

const capture = (prefix = "") => [
  `if (pm.response.code === 200) { const d = pm.response.json().data; const c = pm.response.headers.all().filter(h => h.key.toLowerCase() === "set-cookie").map(h => h.value).join("; ").match(/(?:__Host-)?kmits_session=[A-Za-z0-9_-]{43}/); pm.test("Session cookie exists", () => pm.expect(c).not.to.eql(null)); if(c) pm.environment.set("${prefix}sessionCookie", c[0]); pm.environment.set("${prefix}csrfToken", d.csrfToken); }`,
];
const ownerLogin = name => item(name, "POST", "/api/auth/login", { username: "{{username}}", password: "{{password}}" }, 200, capture(), { session: false, csrf: false });
const outcomes = expected => [`pm.test("Outcomes", () => pm.expect(pm.response.json().data.results.map(r => r.outcome)).to.eql(${JSON.stringify(expected)}));`];
const total = count => [`pm.test("Total ${count}", () => pm.expect(pm.response.json().data.total).to.eql(${count}));`];

const ownerLogout = [
  item("Logout owner", "POST", "/api/auth/logout", {}, 200, ['pm.test("Cookie cleared",()=>pm.expect(pm.response.headers.get("Set-Cookie")).to.include("Max-Age=0"));']),
  item("Logged out session rejected", "GET", "/api/auth/me", undefined, 401),
];

// ---- Auth and accounts -------------------------------------------------------

const tempOptions = { session: "tempsessionCookie", csrf: "tempcsrfToken" };
const authSteps = [
  ownerLogin("Login with actual bootstrap credentials"),
  item("Fixed 24-hour session", "GET", "/api/auth/me", undefined, 200, ['pm.test("24h bound", () => { const remaining = Date.parse(pm.response.json().data.expiresAt) - Date.now(); pm.expect(remaining).to.be.above(86300000); pm.expect(remaining).to.be.at.most(86400000); });']),
  item("Accounts require CSRF", "POST", "/api/admin/accounts", { username: "http-admin", name: "HTTP admin" }, 403, [assertCode("CSRF_REJECTED")], { csrf: false }),
  item("Create temporary account", "POST", "/api/admin/accounts", { username: "http-admin", name: "HTTP admin" }, 200, ['const d=pm.response.json().data; pm.environment.set("accountId",d.account.id); pm.environment.set("temporaryPassword",d.temporaryPassword); pm.test("Temporary credential",()=>{pm.expect(d.account.requirePasswordChange).to.eql(true);pm.expect(d.temporaryPassword.length).to.be.at.least(32);});']),
  item("Login temporary account", "POST", "/api/auth/login", { username: "http-admin", password: "{{temporaryPassword}}" }, 200, capture("temp"), { session: false, csrf: false }),
  item("Temporary session restricted", "GET", "/api/admin/archives", undefined, 403, [assertCode("PASSWORD_CHANGE_REQUIRED")], tempOptions),
  item("Temporary account may read me", "GET", "/api/auth/me", undefined, 200, [], tempOptions),
  item("Change temporary password", "POST", "/api/auth/password", { oldPassword: "{{temporaryPassword}}", newPassword: "{{newPassword}}" }, 200, ['pm.test("Must re-login",()=>pm.expect(pm.response.json().data.reloginRequired).to.eql(true));'], tempOptions),
  item("Changed password revokes session", "GET", "/api/auth/me", undefined, 401, [], tempOptions),
  item("Login permanent admin", "POST", "/api/auth/login", { username: "http-admin", password: "{{newPassword}}" }, 200, capture("temp"), { session: false, csrf: false }),
  item("Ordinary admin cannot manage accounts", "GET", "/api/admin/accounts", undefined, 403, [], tempOptions),
  item("Reset another account", "POST", "/api/admin/accounts/{{accountId}}/reset-password", {}, 200, ['pm.environment.set("resetPassword",pm.response.json().data.temporaryPassword);']),
  item("Reset revokes old session", "GET", "/api/auth/me", undefined, 401, [], tempOptions),
  item("Old permanent password rejected", "POST", "/api/auth/login", { username: "http-admin", password: "{{newPassword}}" }, 401, [assertCode("INVALID_CREDENTIALS")], { session: false, csrf: false }),
  item("Reset password works", "POST", "/api/auth/login", { username: "http-admin", password: "{{resetPassword}}" }, 200, capture("temp"), { session: false, csrf: false }),
  item("Reset session remains restricted", "GET", "/api/admin/archives", undefined, 403, [assertCode("PASSWORD_CHANGE_REQUIRED")], tempOptions),
  item("Temporary logout allowed", "POST", "/api/auth/logout", {}, 200, [], tempOptions),
];
const accountCleanup = [
  item("Disable test account", "PATCH", "/api/admin/accounts/{{accountId}}", { active: false }, 200),
  item("Account list omits hashes", "GET", "/api/admin/accounts", undefined, 200, ['pm.test("No credentials",()=>{pm.expect(pm.response.text()).not.to.include("passwordHash");pm.expect(pm.response.text()).not.to.include("temporaryPassword");});']),
];

// ---- Archive ---------------------------------------------------------------

const archivePath = "/api/archives/{{archiveId}}";
const archiveSteps = [
  item("Sync a valid archive", "POST", "/api/internal/sync/archives", observationExample, 200, ['pm.test("Applied",()=>pm.expect(pm.response.json().data.outcome).to.eql("applied"));'], integration),
  item("Duplicate delivery is idempotent", "POST", "/api/internal/sync/archives", observationExample, 200, ['pm.test("Duplicate",()=>pm.expect(pm.response.json().data.outcome).to.eql("duplicate"));'], integration),
  item("Public archive list", "GET", "/api/archives", undefined, 200, ['const d=pm.response.json().data; pm.test("Visible fixture",()=>pm.expect(d.total).to.eql(1)); pm.environment.set("archiveId",d.items[0].id); pm.test("Private source omitted",()=>{pm.expect(d.items[0]).not.to.have.property("sourceFolderId");pm.expect(d.items[0]).not.to.have.property("snapshot");});'], anonymous),
  item("Public archive detail", "GET", archivePath, undefined, 200, ['pm.test("Title",()=>pm.expect(pm.response.json().data.title).to.eql("HTTP archive fixture"));'], anonymous),
  item("Missing Drive config fails closed", "GET", `${archivePath}/open`, undefined, 503, [assertCode("DRIVE_NOT_CONFIGURED")], anonymous),
  item("Admin archive detail", "GET", "/api/admin/archives/{{archiveId}}", undefined, 200),
  item("Hide archive", "POST", "/api/admin/archives/{{archiveId}}/unpublish", {}, 200, ['pm.test("Hidden",()=>pm.expect(pm.response.json().data.manualHidden).to.eql(true));']),
  item("Hidden detail is 404", "GET", archivePath, undefined, 404, [], anonymous),
  item("Hidden list is empty", "GET", "/api/archives", undefined, 200, ['pm.test("Empty",()=>pm.expect(pm.response.json().data.total).to.eql(0));'], anonymous),
  item("Restore archive visibility", "POST", "/api/admin/archives/{{archiveId}}/publish", {}, 200, ['pm.test("Visible",()=>pm.expect(pm.response.json().data.effectiveVisibility).to.eql(true));']),
  item("Restored public detail", "GET", archivePath, undefined, 200, [], anonymous),
  item("Read sync logs", "GET", "/api/admin/sync-logs?streamId=http-test-stream", undefined, 200, ['pm.test("Recorded deliveries",()=>pm.expect(pm.response.json().data.items.length).to.be.at.least(2));']),
];

// ---- Timeline ----------------------------------------------------------------

const timelineEvent = (eventId, startAt, endAt, extra = {}) => ({ eventId, updated: "2026-01-01T00:00:00.000Z", status: "confirmed", title: `Timeline ${eventId}`, description: "Fixture", location: "ITS", organization: "Test ministry", allDay: false, startAt, endAt, ...extra });
const eventBatch = (...events) => ({ protocolVersion: 1, calendarId: "{{calendarId}}", events });
const pastEvent = timelineEvent("tl-past", "2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z");
const futureEvent = timelineEvent("tl-future", "2099-01-01T00:00:00.000Z", "2099-01-02T00:00:00.000Z", { allDay: true });
const cancelledEvent = { eventId: "tl-cancelled", updated: "2026-01-01T00:00:00.000Z", status: "cancelled" };
const eventPath = "/api/events/{{eventId}}";
const timelineSteps = [
  item("Sync event batch", "POST", "/api/internal/sync/events", eventBatch(pastEvent, futureEvent, cancelledEvent), 200, outcomes(["applied", "applied", "applied"]), integration),
  item("Retried batch is unchanged", "POST", "/api/internal/sync/events", eventBatch(pastEvent, futureEvent, cancelledEvent), 200, outcomes(["unchanged", "unchanged", "unchanged"]), integration),
  item("Older update is stale", "POST", "/api/internal/sync/events", eventBatch({ ...futureEvent, updated: "2025-01-01T00:00:00.000Z", title: "Older" }), 200, outcomes(["stale"]), integration),
  item("Invalid item does not block others", "POST", "/api/internal/sync/events", eventBatch({ ...pastEvent, eventId: "tl-invalid", title: "" }), 200, [...outcomes(["invalid"]), 'pm.test("Reason", () => pm.expect(pm.response.json().data.results[0].reason).to.eql("INVALID_TITLE"));'], integration),
  item("Unregistered calendar is rejected", "POST", "/api/internal/sync/events", { ...eventBatch(pastEvent), calendarId: "other-calendar" }, 422, [assertCode("INVALID_EVENT_BATCH")], integration),
  item("Public event list", "GET", "/api/events", undefined, 200, [...total(2), 'const d = pm.response.json().data; pm.test("Derived status", () => pm.expect(d.items.map(e => e.status)).to.eql(["FINISHED", "UPCOMING"])); pm.environment.set("eventId", d.items[1].id); pm.test("Source identity omitted", () => pm.expect(d.items[0]).not.to.have.property("calendarId"));'], anonymous),
  item("Status filter", "GET", "/api/events?status=UPCOMING", undefined, 200, total(1), anonymous),
  item("Window filter", "GET", "/api/events?from=2098-12-31T00:00:00Z&to=2099-01-03T00:00:00Z", undefined, 200, total(1), anonymous),
  item("Invalid status filter", "GET", "/api/events?status=LIVE", undefined, 400, [assertCode("INVALID_STATUS")], anonymous),
  item("Public event detail", "GET", eventPath, undefined, 200, ['pm.test("Title", () => pm.expect(pm.response.json().data.title).to.eql("Timeline tl-future"));'], anonymous),
  item("Admin event list", "GET", "/api/admin/events", undefined, 200, total(3)),
  item("Admin event detail", "GET", "/api/admin/events/{{eventId}}", undefined, 200, ['pm.test("Latest sync", () => pm.expect(pm.response.json().data.lastSync.outcome).to.eql("stale"));']),
  item("Hiding requires CSRF", "PATCH", "/api/admin/events/{{eventId}}", { hidden: true }, 403, [assertCode("CSRF_REJECTED")], { csrf: false }),
  item("Hide event", "PATCH", "/api/admin/events/{{eventId}}", { hidden: true }, 200, ['pm.test("Hidden", () => pm.expect(pm.response.json().data.effectiveVisibility).to.eql(false));']),
  item("Hidden event is 404", "GET", eventPath, undefined, 404, [], anonymous),
  item("Show event", "PATCH", "/api/admin/events/{{eventId}}", { hidden: false }, 200, ['pm.test("Visible", () => pm.expect(pm.response.json().data.effectiveVisibility).to.eql(true));']),
  item("Event sync logs", "GET", "/api/admin/sync-logs?source=events", undefined, 200, ['pm.test("Logged", () => pm.expect(pm.response.json().data.total).to.be.at.least(8));']),
];

// ---- Articles ----------------------------------------------------------------

const submissionFixture = (submittedAt, title) => ({ responseId: "http-response", submittedAt, submitterEmail: "contributor@example.com", article: { schemaVersion: 1, title, summary: "Fixture summary", category: "News", ministry: "Test ministry", authors: ["Contributor"], coverImage: { driveFileId: "cover-image-id", alt: "Cover" }, body: "## Fixture\n\nArticle body." } });
const articleBatch = (...submissions) => ({ protocolVersion: 1, formId: "{{formId}}", submissions });
const articleAdmin = "/api/admin/articles/{{articleId}}";
const articlePublic = "/api/articles/{{articleId}}";
const captureRevision = 'pm.environment.set("articleRevision", String(pm.response.json().data.revision));';
const articleTitle = title => [`pm.test("Title", () => pm.expect(pm.response.json().data.title).to.eql(${JSON.stringify(title)}));`];
const articleSteps = [
  item("Sync submission", "POST", "/api/internal/sync/articles", articleBatch(submissionFixture("2026-01-01T00:00:00.000Z", "First title")), 200, outcomes(["applied"]), integration),
  item("Retried submission is unchanged", "POST", "/api/internal/sync/articles", articleBatch(submissionFixture("2026-01-01T00:00:00.000Z", "First title")), 200, outcomes(["unchanged"]), integration),
  item("Unregistered form is rejected", "POST", "/api/internal/sync/articles", { ...articleBatch(submissionFixture("2026-01-01T00:00:00.000Z", "x")), formId: "other-form" }, 422, [assertCode("INVALID_ARTICLE_BATCH")], integration),
  item("Submission is not public", "GET", "/api/articles", undefined, 200, total(0), anonymous),
  item("Review queue", "GET", "/api/admin/articles?published=false", undefined, 200, [...total(1), 'const d = pm.response.json().data.items[0]; pm.environment.set("articleId", d.id); pm.environment.set("articleRevision", String(d.revision));']),
  item("Admin article detail", "GET", articleAdmin, undefined, 200, ['pm.test("Draft equals source", () => { const d = pm.response.json().data; pm.expect(d.draft.content.title).to.eql(d.source.title); pm.expect(d.submitterEmail).to.eql("contributor@example.com"); });']),
  item("Stale revision cannot publish", "POST", `${articleAdmin}/publish`, { revision: 99 }, 409, [assertCode("ARTICLE_CHANGED")]),
  item("Publish reviewed revision", "POST", `${articleAdmin}/publish`, '{"revision":{{articleRevision}}}', 200, ['pm.test("Published", () => pm.expect(pm.response.json().data.isPublished).to.eql(true));']),
  item("Public article list", "GET", "/api/articles", undefined, 200, [...total(1), 'pm.test("List omits body and email", () => { const a = pm.response.json().data.items[0]; pm.expect(a).not.to.have.property("body"); pm.expect(a).not.to.have.property("submitterEmail"); });'], anonymous),
  item("Public article detail", "GET", articlePublic, undefined, 200, [...articleTitle("First title"), 'pm.test("Body", () => pm.expect(pm.response.json().data.body).to.include("Article body"));'], anonymous),
  item("Contributor update", "POST", "/api/internal/sync/articles", articleBatch(submissionFixture("2026-01-02T00:00:00.000Z", "Contributor update")), 200, outcomes(["applied"]), integration),
  item("Public copy unchanged", "GET", articlePublic, undefined, 200, articleTitle("First title"), anonymous),
  item("Draft follows source", "GET", articleAdmin, undefined, 200, [captureRevision, 'pm.test("Pending publish", () => { const d = pm.response.json().data; pm.expect(d.draft.content.title).to.eql("Contributor update"); pm.expect(d.hasUnpublishedChanges).to.eql(true); });']),
  item("Edit draft", "PATCH", articleAdmin, '{"revision":{{articleRevision}},"title":"Admin edited title"}', 200, [captureRevision, 'pm.test("Edited", () => pm.expect(pm.response.json().data.draftEdited).to.eql(true));']),
  item("Edit with old revision", "PATCH", articleAdmin, { revision: 1, title: "Lost update" }, 409, [assertCode("ARTICLE_CHANGED")]),
  item("Publish edited draft", "POST", `${articleAdmin}/publish`, '{"revision":{{articleRevision}}}', 200),
  item("Public shows edited copy", "GET", articlePublic, undefined, 200, articleTitle("Admin edited title"), anonymous),
  item("Unpublish article", "POST", `${articleAdmin}/unpublish`, {}, 200, ['pm.test("Hidden", () => pm.expect(pm.response.json().data.isPublished).to.eql(false));']),
  item("Unpublished article is 404", "GET", articlePublic, undefined, 404, [], anonymous),
  item("Article sync logs", "GET", "/api/admin/sync-logs?source=articles&responseId=http-response", undefined, 200, total(3)),
];

// ---- Collections ---------------------------------------------------------------

const localOnly = { listen: "prerequest", script: { type: "text/javascript", exec: ['if (!/^http:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(pm.environment.get("baseUrl") || "")) throw new Error("Local test server required");'] } };
const authInfo = { name: "KM ITS - Auth and Archive Workflow", schema: COLLECTION_SCHEMA, description: "Destructive localhost-only workflow for a fresh temporary database. Real HTTP login, temporary credentials, reset, sync, visibility and logout. Use scripts/test-http-auth.mjs. Never use production credentials." };
const workflowEvents = [localOnly, ...commonChecks];

export const authWorkflow = {
  info: authInfo,
  event: workflowEvents,
  item: [...authSteps, ...archiveSteps, ...accountCleanup, ...ownerLogout],
};

export const archiveWorkflow = {
  info: { ...authInfo, name: "KM ITS - Archive Workflow", description: "Local temporary database only. Requires a ready super-admin username/password and the ingestion secret. Exercises ingestion, public metadata, admin hide/unhide and sync logs. Drive credentials must be unset for the configured open failure assertion. Use a fresh database for each run." },
  event: workflowEvents,
  item: [ownerLogin("Login archive operator"), ...archiveSteps, ...ownerLogout],
};

export const timelineWorkflow = {
  info: { ...authInfo, name: "KM ITS - Timeline Workflow", description: "Local temporary database only. Requires a ready super-admin, the ingestion secret and calendarId equal to EVENT_CALENDAR_ID. Exercises batch sync ordering, public window/status filters, admin hiding and sync logs. Use a fresh database for each run." },
  event: workflowEvents,
  item: [ownerLogin("Login timeline operator"), ...timelineSteps, ...ownerLogout],
};

export const articlesWorkflow = {
  info: { ...authInfo, name: "KM ITS - Articles Workflow", description: "Local temporary database only. Requires a ready super-admin, the ingestion secret and formId equal to ARTICLE_FORM_ID. Exercises unpublished ingestion, revision-checked publish, draft editing, source updates and unpublish. Use a fresh database for each run." },
  event: workflowEvents,
  item: [ownerLogin("Login article reviewer"), ...articleSteps, ...ownerLogout],
};
