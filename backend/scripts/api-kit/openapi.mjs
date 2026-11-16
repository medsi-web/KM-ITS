// OpenAPI 3.1 document built from the endpoint inventory.
import { articleExample, eventExample, observationExample } from "./fixtures.mjs";

export const ref = name => ({ $ref: `#/components/schemas/${name}` });
export const string = { type: "string" };
export const object = (properties, required = Object.keys(properties), extra = false) => ({ type: "object", properties, required, additionalProperties: extra });
const text = (maxLength, minLength = 0) => ({ type: "string", minLength, maxLength });
const instant = { type: "string", format: "date-time", description: "ISO 8601 with Z or an offset." };
const page = schema => object({ items: { type: "array", items: schema }, total: { type: "integer" }, limit: { type: "integer" }, offset: { type: "integer" } });

// ---- Schemas -------------------------------------------------------------

const username = { type: "string", minLength: 3, maxLength: 64, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]{2,63}$" };
const password = { type: "string", minLength: 12, maxLength: 128, writeOnly: true, description: "At most 512 UTF-8 bytes." };
const role = { type: "string", enum: ["ADMIN", "SUPER_ADMIN"] };
const meta = object({ requestId: { type: "string", format: "uuid" }, timestamp: { type: "string", format: "date-time" } });
const decimal = { type: "string", pattern: "^(0|[1-9][0-9]{0,99})$" };
const driveId = { type: "string", pattern: "^[A-Za-z0-9_-]{1,200}$" };
const outcome = { enum: ["applied", "unchanged", "stale", "conflict", "invalid"] };

const schemas = {
  // Shared and authentication
  Failure: object({ success: { const: false }, error: object({ code: string, message: string }), meta }),
  Account: object({ id: string, username: { type: ["string", "null"] }, name: string, role, active: { type: "boolean" }, requirePasswordChange: { type: "boolean" }, createdAt: string, updatedAt: string, lastLoginAt: { type: ["string", "null"] } }),
  Login: object({ username, password }),
  PasswordChange: object({ oldPassword: password, newPassword: password }),
  AccountCreate: object({ username, name: { type: "string", minLength: 1, maxLength: 120 }, role }, ["username", "name"]),
  AccountUpdate: { ...object({ name: { type: "string", minLength: 1, maxLength: 120 }, active: { type: "boolean" }, role }, []), minProperties: 1 },
  Session: object({ account: ref("Account"), expiresAt: { type: "string", format: "date-time" }, csrfToken: string }),
  TemporaryCredential: object({ account: ref("Account"), temporaryPassword: { type: "string", description: "Returned once; distribute privately. Login is restricted until password change." } }),

  // Archive
  PublicArchive: object({ id: string, title: string, description: string, category: string, year: { type: ["integer", "null"] }, authors: { type: "array", items: string }, ministryId: string, updatedAt: string, openUrl: string }),
  ArchiveObservation: {
    ...object({
      protocolVersion: { const: 1 }, streamId: driveId, deliveryId: driveId, scanSequence: decimal, metadataFileId: driveId, metadataDriveVersion: { anyOf: [decimal, { type: "null" }] }, observation: { enum: ["VALID", "INVALID", "MISSING", "UNAVAILABLE", "SYNC_ERROR"] }, sourceCheckedAt: { type: "string", format: "date-time" }, folderId: driveId, diagnostics: { type: "string", maxLength: 2000 },
      metadata: object({ schemaVersion: { const: 1 }, driveFileId: driveId, title: { type: "string", minLength: 1, maxLength: 300 }, description: { type: "string", maxLength: 5000 }, category: { type: "string", maxLength: 100 }, year: { type: ["integer", "null"], minimum: 1900, maximum: 9999 }, authors: { type: "array", maxItems: 30, items: { type: "string", maxLength: 200 } } }, ["schemaVersion", "driveFileId", "title"]),
      pdf: object({ driveFileId: driveId, folderId: driveId, mimeType: { const: "application/pdf" }, sha256: { type: "string", pattern: "^[a-fA-F0-9]{64}$" }, publicReadable: { type: "boolean" }, size: { type: "integer", minimum: 1 }, name: { type: "string", maxLength: 300 } }, ["driveFileId", "folderId", "mimeType", "sha256", "publicReadable"]),
    }, ["protocolVersion", "streamId", "deliveryId", "scanSequence", "metadataFileId", "metadataDriveVersion", "observation", "sourceCheckedAt", "folderId"]),
    allOf: [{ if: { properties: { observation: { const: "VALID" } } }, then: { required: ["metadata", "pdf"], properties: { metadataDriveVersion: decimal } }, else: { not: { anyOf: [{ required: ["metadata"] }, { required: ["pdf"] }] } } }],
    description: "Stream and folder must match ARCHIVE_SOURCE_CONFIG. Metadata driveFileId equals PDF driveFileId. Sequences are decimal strings; sourceCheckedAt is diagnostic, not ordering authority. SYNC_ERROR never proves source absence.",
  },

  // Timeline and Article batches
  EventItem: {
    ...object({ eventId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,1024}$" }, updated: instant, status: { enum: ["confirmed", "cancelled"] }, title: text(500, 1), description: { type: "string", description: "Up to EVENT_DESCRIPTION_MAX_CHARS (default 8000)." }, location: text(500), organization: text(200), allDay: { type: "boolean" }, startAt: instant, endAt: instant }, ["eventId", "updated", "status"]),
    allOf: [{ if: { properties: { status: { const: "confirmed" } } }, then: { required: ["title", "allDay", "startAt", "endAt"] } }],
    description: "Confirmed events need title, allDay, startAt and endAt (endAt >= startAt). Content on cancelled items is ignored.",
  },
  EventBatch: { ...object({ protocolVersion: { const: 1 }, calendarId: { type: "string", description: "Must equal EVENT_CALENDAR_ID." }, events: { type: "array", minItems: 1, items: ref("EventItem"), description: "1 to EVENT_SYNC_MAX_ITEMS (default 50)." } }), description: "Each item is ordered by its Calendar updated timestamp and committed separately." },
  ArticleContent: object({ schemaVersion: { const: 1 }, title: text(300, 1), summary: { type: "string", description: "Up to ARTICLE_SUMMARY_MAX_CHARS (default 1000)." }, category: text(100), ministry: text(200), authors: { type: "array", maxItems: 30, items: text(200, 1) }, coverImage: { anyOf: [{ type: "null" }, object({ driveFileId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,200}$" }, alt: text(300) }, ["driveFileId"])] }, body: { type: "string", minLength: 1, description: "Markdown, up to ARTICLE_BODY_MAX_CHARS (default 50000)." } }, ["schemaVersion", "title", "body"]),
  ArticleSubmission: object({ responseId: { type: "string", pattern: "^[A-Za-z0-9_-]{1,512}$" }, submittedAt: instant, submitterEmail: { type: ["string", "null"], maxLength: 320 }, article: ref("ArticleContent") }, ["responseId", "submittedAt", "article"]),
  ArticleBatch: { ...object({ protocolVersion: { const: 1 }, formId: { type: "string", description: "Must equal ARTICLE_FORM_ID." }, submissions: { type: "array", minItems: 1, items: ref("ArticleSubmission"), description: "1 to ARTICLE_SYNC_MAX_ITEMS (default 20)." } }), description: "Submissions are stored unpublished; source updates never change the published copy." },
  BatchResult: object({ receivedAt: instant, results: { type: "array", items: object({ index: { type: "integer" }, eventId: { type: ["string", "null"] }, responseId: { type: ["string", "null"] }, outcome, reason: string }, ["index", "outcome"]) } }),

  // Timeline and Article responses and admin input
  PublicEvent: object({ id: string, title: string, description: string, location: string, organization: string, allDay: { type: "boolean" }, startAt: instant, endAt: instant, status: { enum: ["UPCOMING", "ONGOING", "FINISHED"] }, updatedAt: instant }),
  PublicArticle: object({ id: string, title: string, summary: string, category: string, ministry: string, authors: { type: "array", items: string }, coverImage: { anyOf: [{ type: "null" }, object({ driveFileId: string, alt: string })] }, publishedAt: instant, updatedAt: instant, body: { type: "string", description: "Detail only." } }, ["id", "title", "summary", "category", "ministry", "authors", "coverImage", "publishedAt", "updatedAt"]),
  EventUpdate: object({ hidden: { type: "boolean" } }),
};
schemas.ArticleUpdate = { ...object({ revision: { type: "integer", minimum: 1 }, resetToSource: { const: true }, title: text(300, 1), summary: string, category: text(100), ministry: text(200), authors: { type: "array", maxItems: 30, items: text(200, 1) }, coverImage: schemas.ArticleContent.properties.coverImage, body: { type: "string", minLength: 1 } }, ["revision"]), minProperties: 2, description: "revision plus either resetToSource: true alone or one or more content fields. 409 ARTICLE_CHANGED when revision is not current." };
schemas.ArticlePublish = object({ revision: { type: "integer", minimum: 1 } });

// ---- Per-operation tables -------------------------------------------------

const RESPONSE_DATA = {
  "auth.login": ref("Session"),
  "auth.me": ref("Session"),
  "auth.password": object({ passwordChanged: { const: true }, reloginRequired: { const: true } }),
  "accounts.list": object({ items: { type: "array", items: ref("Account") }, limit: { type: "integer" }, offset: { type: "integer" } }),
  "accounts.create": ref("TemporaryCredential"),
  "accounts.resetPassword": ref("TemporaryCredential"),
  "accounts.update": ref("Account"),
  "archives.list": page(ref("PublicArchive")),
  "archives.detail": ref("PublicArchive"),
  "sync.archives": object({ outcome: { enum: ["applied", "unchanged", "duplicate", "stale", "invalid", "conflict"] }, receivedAt: string }),
  "sync.events": ref("BatchResult"),
  "sync.articles": ref("BatchResult"),
  "events.list": page(ref("PublicEvent")),
  "events.detail": ref("PublicEvent"),
  "articles.list": page(ref("PublicArticle")),
  "articles.detail": ref("PublicArticle"),
};

const REQUEST_SCHEMA = {
  "auth.login": "Login", "auth.password": "PasswordChange", "accounts.create": "AccountCreate", "accounts.update": "AccountUpdate",
  "sync.archives": "ArchiveObservation", "sync.events": "EventBatch", "sync.articles": "ArticleBatch",
  "events.update": "EventUpdate", "articles.update": "ArticleUpdate", "articles.publish": "ArticlePublish",
};
const REQUEST_EXAMPLE = { "sync.archives": observationExample, "sync.events": eventExample, "sync.articles": articleExample };

const QUERY_PARAMETERS = {
  "archives.list": ["limit", "offset"],
  "events.list": ["from", "to", "status", "limit", "offset"],
  "events.adminList": ["limit", "offset"],
  "articles.list": ["limit", "offset"],
  "articles.adminList": ["published", "limit", "offset"],
  "sync.logs": ["source", "streamId", "externalSubmissionId", "eventId", "responseId", "limit", "offset"],
};
const QUERY_DESCRIPTIONS = { from: "Window start (ISO 8601).", to: "Window end (ISO 8601).", status: "UPCOMING, ONGOING or FINISHED, evaluated at request time.", limit: "Page size; bounds come from the feature's *_PAGE_* settings.", offset: "0-10000.", published: "true or false.", source: "archives (default), events or articles.", streamId: "Archive only.", externalSubmissionId: "Archive only.", eventId: "Events only.", responseId: "Articles only." };

// ---- Operations ------------------------------------------------------------

const envelope = data => object({ success: { const: true }, data, meta });
const response = (description, data) => ({ description, content: { "application/json": { schema: envelope(data ?? { type: "object" }) } } });
const failure = description => ({ description, content: { "application/json": { schema: ref("Failure") } } });

function responses(id, endpoint, { protectedRoute, integration, implemented }) {
  const result = implemented ? { 200: response(endpoint.summary, RESPONSE_DATA[id]) } : { 501: failure("Reserved feature; no domain mutation.") };
  if (protectedRoute) {
    result[401] = failure("Missing, expired or revoked session.");
    result[403] = failure("Role, temporary-password restriction or CSRF rejected.");
  }
  if (integration || id === "auth.login") {
    result[401] = failure(id === "auth.login" ? "Invalid username/password or login rate limit. Same generic error." : "Invalid integration bearer credential.");
  }
  if (implemented || integration) result[503] = failure("Required server configuration or transactional storage unavailable.");
  if (endpoint.path.includes("{id}")) result[404] = failure("Record missing or not publicly visible.");
  if (id === "archives.open") {
    delete result[200];
    result[302] = { description: "Verified public PDF; redirect to its Drive URL.", headers: { Location: { schema: { type: "string", format: "uri" } } } };
  }
  if (endpoint.method !== "GET") for (const status of [400, 409, 413, 415]) result[status] = failure("Invalid input, conflict, oversized body or unsupported media type.");
  if (["sync.events", "sync.articles"].includes(id)) result[422] = failure("Batch envelope violates the schema, registered source or item limit; nothing is applied.");
  if (id === "sync.archives") result[422] = failure("Observation violates schema or registered source.");
  return result;
}

function parameters(id, endpoint, protectedRoute) {
  const list = endpoint.path.includes("{id}") ? [{ name: "id", in: "path", required: true, schema: { type: "string" } }] : [];
  for (const name of QUERY_PARAMETERS[id] ?? []) list.push({ name, in: "query", required: false, schema: string, description: QUERY_DESCRIPTIONS[name] });
  if (endpoint.method !== "GET" && (protectedRoute || id === "auth.login")) list.push({ name: "Origin", in: "header", required: true, schema: string, description: "Exactly APP_ORIGIN." });
  if (endpoint.method !== "GET" && protectedRoute) list.push({ name: "X-CSRF-Token", in: "header", required: true, schema: string });
  return list;
}

function requestBody(id, integration) {
  const input = REQUEST_SCHEMA[id];
  if (input || integration) {
    const example = REQUEST_EXAMPLE[id];
    return { required: true, content: { "application/json": { schema: input ? ref(input) : { type: "object" }, ...(example ? { example } : {}) } } };
  }
  if (id === "articles.unpublish") return { required: true, content: { "application/json": { schema: object({}) } } };
  return undefined;
}

export function buildOpenApi(endpoints) {
  const paths = {};
  for (const [id, endpoint] of Object.entries(endpoints)) {
    const access = {
      protectedRoute: ["admin", "super-admin"].includes(endpoint.access),
      integration: endpoint.access === "integration",
      implemented: endpoint.implemented === true,
    };
    const operation = {
      operationId: id, summary: endpoint.summary, tags: [endpoint.group],
      "x-implementation-status": access.implemented ? "implemented" : "reserved",
      security: access.protectedRoute ? [{ adminCookie: [] }] : access.integration ? [{ integrationBearer: [] }] : [],
      responses: responses(id, endpoint, access),
      parameters: parameters(id, endpoint, access.protectedRoute),
    };
    const body = requestBody(id, access.integration);
    if (body) operation.requestBody = body;
    paths[endpoint.path] ??= {};
    paths[endpoint.path][endpoint.method.toLowerCase()] = operation;
  }
  return {
    openapi: "3.1.0",
    info: { title: "KM ITS API", version: "0.4.0", description: "Local password authentication, fixed 24-hour sessions, admin accounts, Archive ingestion/publication, Timeline event sync and visibility, and Article review/publication. Limits marked with environment names are configurable. Login returns generic 401 for invalid credentials and rate limits. Temporary passwords permit only me/password/logout." },
    servers: [{ url: "http://localhost:3000" }],
    paths,
    components: {
      schemas,
      securitySchemes: {
        adminCookie: { type: "apiKey", in: "cookie", name: "kmits_session", description: "HTTPS uses __Host-kmits_session. Mutations require exact Origin and session CSRF token." },
        integrationBearer: { type: "http", scheme: "bearer", description: "APPS_SCRIPT_INGESTION_SECRET; server-to-server only." },
      },
    },
  };
}
