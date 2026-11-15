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
  return { name, protocolProfileBehavior: { followRedirects: false, disableCookies: true }, request: { method, url: `{{baseUrl}}${route}`, header, ...(body === undefined ? {} : { body: { mode: "raw", raw: JSON.stringify(body), options: { raw: { language: "json" } } } }) }, event: event([`pm.test("Expected status", () => pm.response.to.have.status(${status}));`, ...lines]) };
}
const page = schema => object({ items: { type: "array", items: schema }, total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } });
for (const [id, endpoint] of Object.entries(endpoints)) {
  const protectedRoute = ["admin", "super-admin"].includes(endpoint.access);
  const integration = endpoint.access === "integration";
  const implemented = endpoint.implemented === true;
  const data = ["auth.login", "auth.me"].includes(id) ? ref("Session") : ["accounts.create", "accounts.resetPassword"].includes(id) ? ref("TemporaryCredential") : id === "accounts.update" ? ref("Account") : id === "accounts.list" ? object({ items: { type: "array", items: ref("Account") }, limit: { type: "integer" }, offset: { type: "integer" } }) : id === "archives.list" ? page(ref("PublicArchive")) : id === "archives.detail" ? ref("PublicArchive") : id === "auth.password" ? object({ passwordChanged: { const: true }, reloginRequired: { const: true } }) : id === "sync.archives" ? object({ outcome: { enum: ["applied", "unchanged", "duplicate", "stale", "invalid", "conflict"] }, receivedAt: string }) : { type: "object" };
  const responses = implemented ? { 200: response(endpoint.summary, data) } : { 501: response("Reserved feature; no domain mutation.", undefined, true) };
  if (protectedRoute) { responses[401] = response("Missing, expired or revoked session.", undefined, true); responses[403] = response("Role, temporary-password restriction or CSRF rejected.", undefined, true); }
  if (integration || id === "auth.login") responses[401] = response(id === "auth.login" ? "Invalid username/password or login rate limit. Same generic error." : "Invalid integration bearer credential.", undefined, true);
  if (implemented || integration) responses[503] = response("Required server configuration or transactional storage unavailable.", undefined, true);
  if (endpoint.path.includes("{id}")) responses[404] = response("Record missing or not publicly visible.", undefined, true);
  if (id === "archives.open") { delete responses[200]; responses[302] = { description: "Verified public PDF; redirect to its Drive URL.", headers: { Location: { schema: { type: "string", format: "uri" } } } }; }
  if (endpoint.method !== "GET") for (const status of [400, 409, 413, 415]) responses[status] = response("Invalid input, conflict, oversized body or unsupported media type.", undefined, true);
  if (id === "sync.archives") responses[422] = response("Observation violates schema or registered source.", undefined, true);
  const operation = { operationId: id, summary: endpoint.summary, tags: [endpoint.group], "x-implementation-status": implemented ? "implemented" : "reserved", security: protectedRoute ? [{ adminCookie: [] }] : integration ? [{ integrationBearer: [] }] : [], responses };
  operation.parameters = endpoint.path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }] : [];
  if (endpoint.method !== "GET" && (protectedRoute || id === "auth.login")) operation.parameters.push({ name: "Origin", in: "header", required: true, schema: string, description: "Exactly APP_ORIGIN." });
  if (endpoint.method !== "GET" && protectedRoute) operation.parameters.push({ name: "X-CSRF-Token", in: "header", required: true, schema: string });
  const input = { "auth.login": "Login", "auth.password": "PasswordChange", "accounts.create": "AccountCreate", "accounts.update": "AccountUpdate", "sync.archives": "ArchiveObservation" }[id];
  if (input || integration) operation.requestBody = { required: true, content: { "application/json": { schema: input ? ref(input) : { type: "object" }, ...(id === "sync.archives" ? { example: observationExample } : {}) } } };
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
const collection = { info: { name: "KM ITS - Anonymous API Probes", schema: workflow.info.schema, description: "Anonymous probes; initialized local database required for public archives. Configure expected readiness/integration statuses. Use Auth workflow for authenticated operations." }, event: common, item: probes };
const environment = { name: "KM ITS - Local", _postman_variable_scope: "environment", values: Object.entries({ baseUrl: "http://localhost:3000", recordId: "00000000-0000-4000-8000-000000000001", readyExpectedStatus: "503", loginExpectedStatus: "401", integrationProbeStatus: "401", username: "", password: "", newPassword: "", ingestionSecret: "", sessionCookie: "", csrfToken: "" }).map(([key,value]) => ({ key,value,enabled:true,...(/password|secret|cookie|token/i.test(key)?{type:"secret"}:{}) })) };
const openapi = { openapi: "3.1.0", info: { title: "KM ITS API", version: "0.3.0", description: "Local password authentication, fixed 24-hour sessions, admin accounts and Archive ingestion/publication. Articles and Timeline remain explicitly reserved. Login returns generic 401 for invalid credentials and rate limits. Temporary passwords permit only me/password/logout." }, servers: [{ url: "http://localhost:3000" }], paths, components: { schemas, securitySchemes: { adminCookie: { type: "apiKey", in: "cookie", name: "kmits_session", description: "HTTPS uses __Host-kmits_session. Mutations require exact Origin and session CSRF token." }, integrationBearer: { type: "http", scheme: "bearer", description: "APPS_SCRIPT_INGESTION_SECRET; server-to-server only." } } } };
for (const [relative, content] of [["openapi.json",openapi],["postman/KMITS.postman_collection.json",collection],["postman/Local.postman_environment.json",environment],["postman/Auth.postman_collection.json",workflow],["postman/Archive.postman_collection.json",archiveWorkflow]]) {
  const file=path.join(root,relative), serialized=JSON.stringify(content,null,2)+"\n";
  if(check) { if((await readFile(file,"utf8")).replace(/\r\n/g,"\n")!==serialized) throw Error(`${relative} is out of date.`); }
  else { await mkdir(path.dirname(file),{recursive:true});await writeFile(file,serialized); }
}
console.log(`${check?"Verified":"Generated"} ${Object.keys(endpoints).length} operations and ${workflow.item.length} workflow requests.`);
