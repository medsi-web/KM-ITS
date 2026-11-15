import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { endpoints } from "../src/contracts/endpoints.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const ref = name => ({ $ref: `#/components/schemas/${name}` });
const string = { type: "string" };
const object = (properties, required = Object.keys(properties), extra = false) => ({ type: "object", properties, required, additionalProperties: extra });
const username = { type: "string", minLength: 3, maxLength: 64, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$" };
const password = { type: "string", minLength: 12, maxLength: 128, writeOnly: true, description: "At most 512 UTF-8 bytes." };
const role = { type: "string", enum: ["ADMIN", "SUPER_ADMIN"] };
const meta = object({ requestId: { type: "string", format: "uuid" }, timestamp: { type: "string", format: "date-time" } });
const schemas = {
  Failure: object({ success: { const: false }, error: object({ code: string, message: string }), meta }),
  Account: object({ id: string, username: { type: ["string", "null"] }, name: string, role, active: { type: "boolean" }, requirePasswordChange: { type: "boolean" }, createdAt: string, updatedAt: string, lastLoginAt: { type: ["string", "null"] } }),
  Login: object({ username, password }),
  PasswordChange: object({ oldPassword: password, newPassword: password }),
  AccountCreate: object({ username, name: { type: "string", minLength: 1, maxLength: 120 }, role }, ["username", "name"]),
  AccountUpdate: { ...object({ name: { type: "string", minLength: 1, maxLength: 120 }, active: { type: "boolean" }, role }, []), minProperties: 1 },
  Session: object({ account: ref("Account"), expiresAt: { type: "string", format: "date-time" }, csrfToken: string }),
  TemporaryCredential: object({ account: ref("Account"), temporaryPassword: { type: "string", description: "Returned once; distribute privately. Login is restricted until password change." } }),
  PublicArchive: object({ id: string, title: string, description: string, category: string, year: { type: ["integer", "null"] }, authors: { type: "array", items: string }, ministryId: string, updatedAt: string, openUrl: string }),
};
const observationExample = {
  protocolVersion: 1, streamId: "http-test-stream", deliveryId: "http-delivery-1", scanSequence: "1", metadataFileId: "http-metadata", metadataDriveVersion: "1", observation: "VALID", sourceCheckedAt: "2026-01-01T00:00:00.000Z", folderId: "http-folder",
  metadata: { schemaVersion: 1, driveFileId: "http-pdf", title: "HTTP archive fixture", description: "Temporary test document", category: "Reports", year: 2026, authors: ["Test ministry"] },
  pdf: { driveFileId: "http-pdf", folderId: "http-folder", mimeType: "application/pdf", sha256: "a".repeat(64), publicReadable: true, size: 100 },
};
const decimal = { type: "string", pattern: "^(0|[1-9][0-9]{0,99})$" };
const driveId = { type: "string", pattern: "^[A-Za-z0-9_-]{1,200}$" };
schemas.ArchiveObservation = {
  ...object({ protocolVersion: { const: 1 }, streamId: driveId, deliveryId: driveId, scanSequence: decimal, metadataFileId: driveId, metadataDriveVersion: { anyOf: [decimal, { type: "null" }] }, observation: { enum: ["VALID", "INVALID", "MISSING", "UNAVAILABLE", "SYNC_ERROR"] }, sourceCheckedAt: { type: "string", format: "date-time" }, folderId: driveId, diagnostics: { type: "string", maxLength: 2000 },
    metadata: object({ schemaVersion: { const: 1 }, driveFileId: driveId, title: { type: "string", minLength: 1, maxLength: 300 }, description: { type: "string", maxLength: 5000 }, category: { type: "string", maxLength: 100 }, year: { type: ["integer", "null"], minimum: 1900, maximum: 9999 }, authors: { type: "array", maxItems: 30, items: { type: "string", maxLength: 200 } } }, ["schemaVersion", "driveFileId", "title"]),
    pdf: object({ driveFileId: driveId, folderId: driveId, mimeType: { const: "application/pdf" }, sha256: { type: "string", pattern: "^[a-fA-F0-9]{64}$" }, publicReadable: { type: "boolean" }, size: { type: "integer", minimum: 1 }, name: { type: "string", maxLength: 300 } }, ["driveFileId", "folderId", "mimeType", "sha256", "publicReadable"]),
  }, ["protocolVersion", "streamId", "deliveryId", "scanSequence", "metadataFileId", "metadataDriveVersion", "observation", "sourceCheckedAt", "folderId"]),
  allOf: [{ if: { properties: { observation: { const: "VALID" } } }, then: { required: ["metadata", "pdf"], properties: { metadataDriveVersion: decimal } }, else: { not: { anyOf: [{ required: ["metadata"] }, { required: ["pdf"] }] } } }],
  description: "Stream and folder must match ARCHIVE_SOURCE_CONFIG. Metadata driveFileId equals PDF driveFileId. Sequences are decimal strings; sourceCheckedAt is diagnostic, not ordering authority. SYNC_ERROR never proves source absence.",
};
const instant = { type: "string", format: "date-time", description: "ISO 8601 with Z or an offset." };
const text = (maxLength, minLength = 0) => ({ type: "string", minLength, maxLength });
const outcome = { enum: ["applied", "unchanged", "stale", "conflict", "invalid"] };
schemas.EventItem = { ...object({ eventId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,1024}$" }, updated: instant, status: { enum: ["confirmed", "cancelled"] }, title: text(500, 1), description: { type: "string", description: "Up to EVENT_DESCRIPTION_MAX_CHARS (default 8000)." }, location: text(500), organization: text(200), allDay: { type: "boolean" }, startAt: instant, endAt: instant }, ["eventId", "updated", "status"]),
  allOf: [{ if: { properties: { status: { const: "confirmed" } } }, then: { required: ["title", "allDay", "startAt", "endAt"] } }], description: "Confirmed events need title, allDay, startAt and endAt (endAt >= startAt). Content on cancelled items is ignored." };
schemas.EventBatch = { ...object({ protocolVersion: { const: 1 }, calendarId: { type: "string", description: "Must equal EVENT_CALENDAR_ID." }, events: { type: "array", minItems: 1, items: ref("EventItem"), description: "1 to EVENT_SYNC_MAX_ITEMS (default 50)." } }), description: "Each item is ordered by its Calendar updated timestamp and committed separately." };
schemas.ArticleContent = object({ schemaVersion: { const: 1 }, title: text(300, 1), summary: { type: "string", description: "Up to ARTICLE_SUMMARY_MAX_CHARS (default 1000)." }, category: text(100), ministry: text(200), authors: { type: "array", maxItems: 30, items: text(200, 1) }, coverImage: { anyOf: [{ type: "null" }, object({ driveFileId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,200}$" }, alt: text(300) }, ["driveFileId"])] }, body: { type: "string", minLength: 1, description: "Markdown, up to ARTICLE_BODY_MAX_CHARS (default 50000)." } }, ["schemaVersion", "title", "body"]);
schemas.ArticleSubmission = object({ responseId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,512}$" }, submittedAt: instant, submitterEmail: { type: ["string", "null"], maxLength: 320 }, article: ref("ArticleContent") }, ["responseId", "submittedAt", "article"]);
schemas.ArticleBatch = { ...object({ protocolVersion: { const: 1 }, formId: { type: "string", description: "Must equal ARTICLE_FORM_ID." }, submissions: { type: "array", minItems: 1, items: ref("ArticleSubmission"), description: "1 to ARTICLE_SYNC_MAX_ITEMS (default 20)." } }), description: "Submissions are stored unpublished; source updates never change the published copy." };
schemas.BatchResult = object({ receivedAt: instant, results: { type: "array", items: object({ index: { type: "integer" }, eventId: { type: ["string", "null"] }, responseId: { type: ["string", "null"] }, outcome, reason: string }, ["index", "outcome"]) } });
schemas.PublicEvent = object({ id: string, title: string, description: string, location: string, organization: string, allDay: { type: "boolean" }, startAt: instant, endAt: instant, status: { enum: ["UPCOMING", "ONGOING", "FINISHED"] }, updatedAt: instant });
schemas.PublicArticle = object({ id: string, title: string, summary: string, category: string, ministry: string, authors: { type: "array", items: string }, coverImage: { anyOf: [{ type: "null" }, object({ driveFileId: string, alt: string })] }, publishedAt: instant, updatedAt: instant, body: { type: "string", description: "Detail only." } }, ["id", "title", "summary", "category", "ministry", "authors", "coverImage", "publishedAt", "updatedAt"]);
schemas.EventUpdate = object({ hidden: { type: "boolean" } });
schemas.ArticleUpdate = { ...object({ revision: { type: "integer", minimum: 1 }, resetToSource: { const: true }, title: text(300, 1), summary: string, category: text(100), ministry: text(200), authors: { type: "array", maxItems: 30, items: text(200, 1) }, coverImage: schemas.ArticleContent.properties.coverImage, body: { type: "string", minLength: 1 } }, ["revision"]), minProperties: 2, description: "revision plus either resetToSource: true alone or one or more content fields. 409 ARTICLE_CHANGED when revision is not current." };
schemas.ArticlePublish = object({ revision: { type: "integer", minimum: 1 } });
const eventExample = { protocolVersion: 1, calendarId: "km-its@group.calendar.google.com", events: [{ eventId: "abc123def456", updated: "2026-11-16T03:00:00.000Z", status: "confirmed", title: "Ministry meeting", description: "Agenda", location: "ITS Surabaya", organization: "Ministry of Education", allDay: false, startAt: "2026-11-20T02:00:00.000Z", endAt: "2026-11-20T04:00:00.000Z" }, { eventId: "removed789", updated: "2026-11-16T03:05:00.000Z", status: "cancelled" }] };
const articleExample = { protocolVersion: 1, formId: "1FAIpQLSexampleFormId", submissions: [{ responseId: "2_ABaOnudExampleResponse", submittedAt: "2026-11-16T03:00:00.000Z", submitterEmail: "contributor@example.com", article: { schemaVersion: 1, title: "Ministry work programme", summary: "Short teaser.", category: "News", ministry: "Ministry of Education", authors: ["Contributor"], coverImage: { driveFileId: "1AbCdEfGhIjK", alt: "Team photo" }, body: "## Heading\n\nMarkdown body." } }] };
const queryParameters = {
  "archives.list": ["limit", "offset"],
  "events.list": ["from", "to", "status", "limit", "offset"],
  "events.adminList": ["limit", "offset"],
  "articles.list": ["limit", "offset"],
  "articles.adminList": ["published", "limit", "offset"],
  "sync.logs": ["source", "streamId", "externalSubmissionId", "eventId", "responseId", "limit", "offset"],
};
const queryDescriptions = { from: "Window start (ISO 8601).", to: "Window end (ISO 8601).", status: "UPCOMING, ONGOING or FINISHED, evaluated at request time.", limit: "Page size; bounds come from the feature's *_PAGE_* settings.", offset: "0-10000.", published: "true or false.", source: "archives (default), events or articles.", streamId: "Archive only.", externalSubmissionId: "Archive only.", eventId: "Events only.", responseId: "Articles only." };
const envelope = data => object({ success: { const: true }, data, meta });
const response = (description, data, failure = false) => ({ description, content: { "application/json": { schema: failure ? ref("Failure") : envelope(data ?? { type: "object" }) } } });
const paths = {};
const probes = [];
const event = lines => [{ listen: "test", script: { type: "text/javascript", exec: lines } }];
const assertCode = code => `pm.test("Error code", () => pm.expect(pm.response.json().error.code).to.eql("${code}"));`;
function item(name, method, route, body, status, lines = [], options = {}) {
  const header = [];
  if (options.session !== false) header.push({ key: "Cookie", value: `{{${options.session ?? "sessionCookie"}}}` });
  if (method !== "GET") header.push({ key: "Content-Type", value: "application/json" }, { key: "Origin", value: "{{baseUrl}}" });
  if (method !== "GET" && options.csrf !== false) header.push({ key: "X-CSRF-Token", value: `{{${options.csrf ?? "csrfToken"}}}` });
  if (options.integration) header.push({ key: "Authorization", value: "Bearer {{ingestionSecret}}" });
  return { name, protocolProfileBehavior: { followRedirects: false, disableCookies: true }, request: { method, url: `{{baseUrl}}${route}`, header, ...(body === undefined ? {} : { body: { mode: "raw", raw: typeof body === "string" ? body : JSON.stringify(body), options: { raw: { language: "json" } } } }) }, event: event([`pm.test("Expected status", () => pm.response.to.have.status(${status}));`, ...lines]) };
}
const page = schema => object({ items: { type: "array", items: schema }, total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } });
for (const [id, endpoint] of Object.entries(endpoints)) {
  const protectedRoute = ["admin", "super-admin"].includes(endpoint.access);
  const integration = endpoint.access === "integration";
  const implemented = endpoint.implemented === true;
  const data = ["auth.login", "auth.me"].includes(id) ? ref("Session") : ["accounts.create", "accounts.resetPassword"].includes(id) ? ref("TemporaryCredential") : id === "accounts.update" ? ref("Account") : id === "accounts.list" ? object({ items: { type: "array", items: ref("Account") }, limit: { type: "integer" }, offset: { type: "integer" } }) : id === "archives.list" ? page(ref("PublicArchive")) : id === "archives.detail" ? ref("PublicArchive") : id === "auth.password" ? object({ passwordChanged: { const: true }, reloginRequired: { const: true } }) : id === "sync.archives" ? object({ outcome: { enum: ["applied", "unchanged", "duplicate", "stale", "invalid", "conflict"] }, receivedAt: string }) : ["sync.events", "sync.articles"].includes(id) ? ref("BatchResult") : id === "events.list" ? page(ref("PublicEvent")) : id === "events.detail" ? ref("PublicEvent") : id === "articles.list" ? page(ref("PublicArticle")) : id === "articles.detail" ? ref("PublicArticle") : { type: "object" };
  const responses = implemented ? { 200: response(endpoint.summary, data) } : { 501: response("Reserved feature; no domain mutation.", undefined, true) };
  if (protectedRoute) { responses[401] = response("Missing, expired or revoked session.", undefined, true); responses[403] = response("Role, temporary-password restriction or CSRF rejected.", undefined, true); }
  if (integration || id === "auth.login") responses[401] = response(id === "auth.login" ? "Invalid username/password or login rate limit. Same generic error." : "Invalid integration bearer credential.", undefined, true);
  if (implemented || integration) responses[503] = response("Required server configuration or transactional storage unavailable.", undefined, true);
  if (endpoint.path.includes("{id}")) responses[404] = response("Record missing or not publicly visible.", undefined, true);
  if (id === "archives.open") { delete responses[200]; responses[302] = { description: "Verified public PDF; redirect to its Drive URL.", headers: { Location: { schema: { type: "string", format: "uri" } } } }; }
  if (endpoint.method !== "GET") for (const status of [400, 409, 413, 415]) responses[status] = response("Invalid input, conflict, oversized body or unsupported media type.", undefined, true);
  if (["sync.events", "sync.articles"].includes(id)) responses[422] = response("Batch envelope violates the schema, registered source or item limit; nothing is applied.", undefined, true);
  if (id === "sync.archives") responses[422] = response("Observation violates schema or registered source.", undefined, true);
  const operation = { operationId: id, summary: endpoint.summary, tags: [endpoint.group], "x-implementation-status": implemented ? "implemented" : "reserved", security: protectedRoute ? [{ adminCookie: [] }] : integration ? [{ integrationBearer: [] }] : [], responses };
  operation.parameters = endpoint.path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }] : [];
  for (const name of queryParameters[id] ?? []) operation.parameters.push({ name, in: "query", required: false, schema: string, description: queryDescriptions[name] });
  if (endpoint.method !== "GET" && (protectedRoute || id === "auth.login")) operation.parameters.push({ name: "Origin", in: "header", required: true, schema: string, description: "Exactly APP_ORIGIN." });
  if (endpoint.method !== "GET" && protectedRoute) operation.parameters.push({ name: "X-CSRF-Token", in: "header", required: true, schema: string });
  const input = { "auth.login": "Login", "auth.password": "PasswordChange", "accounts.create": "AccountCreate", "accounts.update": "AccountUpdate", "sync.archives": "ArchiveObservation", "sync.events": "EventBatch", "sync.articles": "ArticleBatch", "events.update": "EventUpdate", "articles.update": "ArticleUpdate", "articles.publish": "ArticlePublish" }[id];
  if (id === "articles.unpublish") operation.requestBody = { required: true, content: { "application/json": { schema: object({}) } } };
  if (input || integration) operation.requestBody = { required: true, content: { "application/json": { schema: input ? ref(input) : { type: "object" }, ...({ "sync.archives": { example: observationExample }, "sync.events": { example: eventExample }, "sync.articles": { example: articleExample } }[id] ?? {}) } } };
  paths[endpoint.path] ??= {}; paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
  const status = protectedRoute ? 401 : integration ? 'Number(pm.environment.get("integrationProbeStatus") || "401")' : id === "auth.login" ? 'Number(pm.environment.get("loginExpectedStatus") || "401")' : id === "system.ready" ? 'Number(pm.environment.get("readyExpectedStatus") || "503")' : ["system.health", "archives.list", "events.list", "articles.list"].includes(id) ? 200 : 404;
  probes.push(item(`${endpoint.method} ${endpoint.path}`, endpoint.method, endpoint.path.replace("{id}", "{{recordId}}"), id === "auth.login" ? { username: "nonexistent-probe", password: "incorrect probe password" } : endpoint.method !== "GET" ? {} : undefined, status, protectedRoute ? [assertCode("UNAUTHENTICATED")] : [], { session: false, csrf: false }));
}
const common = event([
  'pm.test("JSON envelope", () => { const b = pm.response.json(); pm.expect(b.success).to.eql(pm.response.code < 400); pm.expect(b.meta.requestId).to.match(/^[0-9a-f-]{36}$/); pm.expect(Date.parse(b.meta.timestamp)).not.to.be.NaN; pm.expect(pm.response.headers.get("X-Request-Id")).to.eql(b.meta.requestId); });',
  'pm.test("No caching", () => pm.expect(pm.response.headers.get("Cache-Control")).to.include("no-store"));',
]);
const capture = (prefix = "") => [
  `if (pm.response.code === 200) { const d = pm.response.json().data; const c = pm.response.headers.all().filter(h => h.key.toLowerCase() === "set-cookie").map(h => h.value).join("; ").match(/(?:__Host-)?kmits_session=[A-Za-z0-9_-]{43}/); pm.test("Session cookie exists", () => pm.expect(c).not.to.eql(null)); if(c) pm.environment.set("${prefix}sessionCookie", c[0]); pm.environment.set("${prefix}csrfToken", d.csrfToken); }`,
];
const ownerLogin = name => item(name, "POST", "/api/auth/login", { username: "{{username}}", password: "{{password}}" }, 200, capture(), { session: false, csrf: false });
const tempOptions = { session: "tempsessionCookie", csrf: "tempcsrfToken" };
const archivePath = "/api/archives/{{archiveId}}";
const workflow = {
  info: { name: "KM ITS - Auth and Archive Workflow", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json", description: "Destructive localhost-only workflow for a fresh temporary database. Real HTTP login, temporary credentials, reset, sync, visibility and logout. Use scripts/test-http-auth.mjs. Never use production credentials." },
  event: [{ listen: "prerequest", script: { type: "text/javascript", exec: ['if (!/^http:\\/\\/(localhost|127\\.0\\.0\\.1)(:\\d+)?$/.test(pm.environment.get("baseUrl") || "")) throw new Error("Local test server required");'] } }, ...common],
  item: [
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
    item("Sync a valid archive", "POST", "/api/internal/sync/archives", observationExample, 200, ['pm.test("Applied",()=>pm.expect(pm.response.json().data.outcome).to.eql("applied"));'], { integration: true, session: false, csrf: false }),
    item("Duplicate delivery is idempotent", "POST", "/api/internal/sync/archives", observationExample, 200, ['pm.test("Duplicate",()=>pm.expect(pm.response.json().data.outcome).to.eql("duplicate"));'], { integration: true, session: false, csrf: false }),
    item("Public archive list", "GET", "/api/archives", undefined, 200, ['const d=pm.response.json().data; pm.test("Visible fixture",()=>pm.expect(d.total).to.eql(1)); pm.environment.set("archiveId",d.items[0].id); pm.test("Private source omitted",()=>{pm.expect(d.items[0]).not.to.have.property("sourceFolderId");pm.expect(d.items[0]).not.to.have.property("snapshot");});'], { session: false }),
    item("Public archive detail", "GET", archivePath, undefined, 200, ['pm.test("Title",()=>pm.expect(pm.response.json().data.title).to.eql("HTTP archive fixture"));'], { session: false }),
    item("Missing Drive config fails closed", "GET", `${archivePath}/open`, undefined, 503, [assertCode("DRIVE_NOT_CONFIGURED")], { session: false }),
    item("Admin archive detail", "GET", "/api/admin/archives/{{archiveId}}", undefined, 200),
    item("Hide archive", "POST", "/api/admin/archives/{{archiveId}}/unpublish", {}, 200, ['pm.test("Hidden",()=>pm.expect(pm.response.json().data.manualHidden).to.eql(true));']),
    item("Hidden detail is 404", "GET", archivePath, undefined, 404, [], { session: false }),
    item("Hidden list is empty", "GET", "/api/archives", undefined, 200, ['pm.test("Empty",()=>pm.expect(pm.response.json().data.total).to.eql(0));'], { session: false }),
    item("Restore archive visibility", "POST", "/api/admin/archives/{{archiveId}}/publish", {}, 200, ['pm.test("Visible",()=>pm.expect(pm.response.json().data.effectiveVisibility).to.eql(true));']),
    item("Restored public detail", "GET", archivePath, undefined, 200, [], { session: false }),
    item("Read sync logs", "GET", "/api/admin/sync-logs?streamId=http-test-stream", undefined, 200, ['pm.test("Recorded deliveries",()=>pm.expect(pm.response.json().data.items.length).to.be.at.least(2));']),
    item("Disable test account", "PATCH", "/api/admin/accounts/{{accountId}}", { active: false }, 200),
    item("Account list omits hashes", "GET", "/api/admin/accounts", undefined, 200, ['pm.test("No credentials",()=>{pm.expect(pm.response.text()).not.to.include("passwordHash");pm.expect(pm.response.text()).not.to.include("temporaryPassword");});']),
    item("Logout owner", "POST", "/api/auth/logout", {}, 200, ['pm.test("Cookie cleared",()=>pm.expect(pm.response.headers.get("Set-Cookie")).to.include("Max-Age=0"));']),
    item("Logged out session rejected", "GET", "/api/auth/me", undefined, 401),
  ],
};
const archiveWorkflow = { ...workflow, info: { ...workflow.info, name: "KM ITS - Archive Workflow", description: "Local temporary database only. Requires a ready super-admin username/password and the ingestion secret. Exercises ingestion, public metadata, admin hide/unhide and sync logs. Drive credentials must be unset for the configured open failure assertion. Use a fresh database for each run." }, item: [ownerLogin("Login archive operator"), ...workflow.item.slice(17, 29), ...workflow.item.slice(-2)] };
const integration = { integration: true, session: false, csrf: false };
const anonymous = { session: false };
const outcomes = expected => [`pm.test("Outcomes", () => pm.expect(pm.response.json().data.results.map(r => r.outcome)).to.eql(${JSON.stringify(expected)}));`];
const total = count => [`pm.test("Total ${count}", () => pm.expect(pm.response.json().data.total).to.eql(${count}));`];
const timelineEvent = (eventId, startAt, endAt, extra = {}) => ({ eventId, updated: "2026-01-01T00:00:00.000Z", status: "confirmed", title: `Timeline ${eventId}`, description: "Fixture", location: "ITS", organization: "Test ministry", allDay: false, startAt, endAt, ...extra });
const eventBatch = (...events) => ({ protocolVersion: 1, calendarId: "{{calendarId}}", events });
const pastEvent = timelineEvent("tl-past", "2020-01-01T00:00:00.000Z", "2020-01-02T00:00:00.000Z");
const futureEvent = timelineEvent("tl-future", "2099-01-01T00:00:00.000Z", "2099-01-02T00:00:00.000Z", { allDay: true });
const cancelledEvent = { eventId: "tl-cancelled", updated: "2026-01-01T00:00:00.000Z", status: "cancelled" };
const eventPath = "/api/events/{{eventId}}";
const timelineWorkflow = { info: { ...workflow.info, name: "KM ITS - Timeline Workflow", description: "Local temporary database only. Requires a ready super-admin, the ingestion secret and calendarId equal to EVENT_CALENDAR_ID. Exercises batch sync ordering, public window/status filters, admin hiding and sync logs. Use a fresh database for each run." }, item: [
  ownerLogin("Login timeline operator"),
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
  ...workflow.item.slice(-2),
] };
const submissionFixture = (submittedAt, title) => ({ responseId: "http-response", submittedAt, submitterEmail: "contributor@example.com", article: { schemaVersion: 1, title, summary: "Fixture summary", category: "News", ministry: "Test ministry", authors: ["Contributor"], coverImage: { driveFileId: "cover-image-id", alt: "Cover" }, body: "## Fixture\n\nArticle body." } });
const articleBatch = (...submissions) => ({ protocolVersion: 1, formId: "{{formId}}", submissions });
const articleAdmin = "/api/admin/articles/{{articleId}}";
const articlePublic = "/api/articles/{{articleId}}";
const captureRevision = 'pm.environment.set("articleRevision", String(pm.response.json().data.revision));';
const articleTitle = title => [`pm.test("Title", () => pm.expect(pm.response.json().data.title).to.eql(${JSON.stringify(title)}));`];
const articlesWorkflow = { info: { ...workflow.info, name: "KM ITS - Articles Workflow", description: "Local temporary database only. Requires a ready super-admin, the ingestion secret and formId equal to ARTICLE_FORM_ID. Exercises unpublished ingestion, revision-checked publish, draft editing, source updates and unpublish. Use a fresh database for each run." }, item: [
  ownerLogin("Login article reviewer"),
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
  ...workflow.item.slice(-2),
] };
const collection = { info: { name: "KM ITS - Anonymous API Probes", schema: workflow.info.schema, description: "Anonymous probes; initialized local database required for public archives. Configure expected readiness/integration statuses. Use Auth workflow for authenticated operations." }, event: common, item: probes };
const environment = { name: "KM ITS - Local", _postman_variable_scope: "environment", values: Object.entries({ baseUrl: "http://localhost:3000", recordId: "00000000-0000-4000-8000-000000000001", readyExpectedStatus: "503", loginExpectedStatus: "401", integrationProbeStatus: "401", username: "", password: "", newPassword: "", ingestionSecret: "", calendarId: "", formId: "", sessionCookie: "", csrfToken: "" }).map(([key,value]) => ({ key,value,enabled:true,...(/password|secret|cookie|token/i.test(key)?{type:"secret"}:{}) })) };
const openapi = { openapi: "3.1.0", info: { title: "KM ITS API", version: "0.4.0", description: "Local password authentication, fixed 24-hour sessions, admin accounts, Archive ingestion/publication, Timeline event sync and visibility, and Article review/publication. Limits marked with environment names are configurable. Login returns generic 401 for invalid credentials and rate limits. Temporary passwords permit only me/password/logout." }, servers: [{ url: "http://localhost:3000" }], paths, components: { schemas, securitySchemes: { adminCookie: { type: "apiKey", in: "cookie", name: "kmits_session", description: "HTTPS uses __Host-kmits_session. Mutations require exact Origin and session CSRF token." }, integrationBearer: { type: "http", scheme: "bearer", description: "APPS_SCRIPT_INGESTION_SECRET; server-to-server only." } } } };
for (const [relative, content] of [["openapi.json",openapi],["postman/KMITS.postman_collection.json",collection],["postman/Local.postman_environment.json",environment],["postman/Auth.postman_collection.json",workflow],["postman/Archive.postman_collection.json",archiveWorkflow],["postman/Timeline.postman_collection.json",timelineWorkflow],["postman/Articles.postman_collection.json",articlesWorkflow]]) {
  const file=path.join(root,relative), serialized=JSON.stringify(content,null,2)+"\n";
  if(check) { if((await readFile(file,"utf8")).replace(/\r\n/g,"\n")!==serialized) throw Error(`${relative} is out of date.`); }
  else { await mkdir(path.dirname(file),{recursive:true});await writeFile(file,serialized); }
}
console.log(`${check?"Verified":"Generated"} ${Object.keys(endpoints).length} operations and ${workflow.item.length} Auth, ${timelineWorkflow.item.length} Timeline and ${articlesWorkflow.item.length} Articles workflow requests.`);
