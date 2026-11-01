import { readFile, mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { endpoints } from "../src/contracts/endpoints.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const check = process.argv.includes("--check");
const entries = Object.entries(endpoints);
const errorResponse = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Failure" } } },
});
const successResponse = (description) => ({
  description,
  content: { "application/json": { schema: { $ref: "#/components/schemas/Success" } } },
});

const paths = {};
const groups = new Map();
for (const [id, endpoint] of entries) {
  const implemented = "implemented" in endpoint && endpoint.implemented;
  const internal = endpoint.access === "integration";
  const protectedRoute = endpoint.access === "admin" || endpoint.access === "super-admin";
  const oauth = id === "auth.login" || id === "auth.callback";
  const responses = implemented
    ? { 200: successResponse(endpoint.summary) }
    : { 501: errorResponse("Reserved operation. No domain data is read or saved.") };
  if (id === "system.ready") responses[503] = errorResponse("MongoDB is not configured or is unavailable.");
  if (protectedRoute) {
    responses[401] = errorResponse("Admin session missing, expired, revoked, or account inactive.");
    responses[403] = errorResponse("Role or mutation CSRF/origin check failed.");
    responses[503] = errorResponse("Authentication storage is unavailable or not initialized.");
  }
  if (oauth) {
    delete responses[200];
    responses[302] = { description: id === "auth.login" ? "Redirect to Google authorization; sets a temporary HttpOnly OAuth cookie." : "Sets the 24-hour admin session cookie and redirects to /api/auth/me.", headers: { Location: { schema: { type: "string", format: "uri" } }, "Set-Cookie": { schema: { type: "string" } } } };
    responses[503] = errorResponse("Google login or database not configured/initialized or storage unavailable.");
    if (id === "auth.login") responses[429] = errorResponse("Login attempt limit reached.");
    else Object.assign(responses, { 400: errorResponse("Invalid/expired/used OAuth state or browser binding."), 401: errorResponse("Google login cancelled or token/code verification failed."), 403: errorResponse("Google account not allowlisted or active.") });
  }
  if (id === "accounts.create" || id === "accounts.update") {
    Object.assign(responses, { 400: errorResponse("Invalid account fields, ID, or JSON."), 409: errorResponse("Duplicate account, last super admin, or successor not ready."), 413: errorResponse("Payload exceeds 256 KiB."), 415: errorResponse("Use application/json.") });
    if (id === "accounts.update") responses[404] = errorResponse("Account does not exist.");
  }
  if (id === "accounts.list") responses[400] = errorResponse("Invalid pagination parameters.");
  if (internal) {
    Object.assign(responses, {
      400: errorResponse("Invalid JSON or non-object body."),
      401: errorResponse("Missing or invalid integration credential."),
      413: errorResponse("Payload exceeds 256 KiB."),
      415: errorResponse("Content-Type must be application/json."),
      503: errorResponse("Ingestion secret is missing or shorter than 32 characters."),
    });
  }
  const operation = {
    operationId: id, summary: endpoint.summary, tags: [endpoint.group],
    description: implemented
      ? "Implemented foundation operation. Database readiness does not certify domain feature readiness."
      : "Reserved domain adapter, returning 501 after any required session, role, CSRF, or integration checks. Domain schemas and behavior remain unimplemented.",
    "x-implementation-status": implemented ? "implemented" : "reserved",
    "x-intended-access": endpoint.access,
    security: internal ? [{ appsScriptBearer: [] }] : protectedRoute ? [{ adminCookie: [] }] : [],
    responses,
  };
  if (endpoint.path.includes("{id}")) {
    operation.parameters = [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Application record ID. Domain ID validation is not implemented yet." }];
  }
  if (protectedRoute && endpoint.method !== "GET") {
    operation.parameters = [...(operation.parameters ?? []),
      { name: "Origin", in: "header", required: true, schema: { type: "string", format: "uri" }, description: "Must exactly match configured APP_ORIGIN." },
      { name: "X-CSRF-Token", in: "header", required: true, schema: { type: "string" }, description: "Session-bound token returned by GET /api/auth/me." },
    ];
  }
  if (id === "accounts.create" || id === "accounts.update") {
    operation.requestBody = { required: true, content: { "application/json": { schema: id === "accounts.create"
      ? { type: "object", additionalProperties: false, required: ["email", "name"], properties: { email: { type: "string", format: "email", maxLength: 254 }, name: { type: "string", minLength: 1, maxLength: 120 } } }
      : { type: "object", additionalProperties: false, minProperties: 1, properties: { name: { type: "string", minLength: 1, maxLength: 120 }, active: { type: "boolean" }, role: { type: "string", enum: ["ADMIN", "SUPER_ADMIN"] } } } } } };
  }
  if (id === "accounts.list") operation.parameters = [
    { name: "limit", in: "query", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    { name: "offset", in: "query", schema: { type: "integer", minimum: 0, maximum: 10000, default: 0 } },
  ];
  if (internal) {
    operation.requestBody = {
      required: true,
      description: "Transport-only JSON object, maximum 256 KiB. This is NOT a finalized ingestion schema. Even valid transport returns 501 and is not saved.",
      content: { "application/json": { schema: { type: "object", additionalProperties: true }, example: {} } },
    };
  }
  paths[endpoint.path] ??= {};
  paths[endpoint.path][endpoint.method.toLowerCase()] = operation;

  const expected = id === "system.health" ? "200"
    : id === "system.ready" ? 'Number(pm.environment.get("readyExpectedStatus") || "503")'
    : oauth ? `Number(pm.environment.get("${id === "auth.login" ? "loginExpectedStatus" : "callbackExpectedStatus"}") || "503")`
    : protectedRoute ? "401"
    : internal ? '(pm.environment.get("integrationConfigured") === "true" ? (pm.environment.get("ingestionSecret") ? 501 : 401) : 503)'
    : "501";
  const request = {
    method: endpoint.method,
    header: internal ? [{ key: "Authorization", value: "Bearer {{ingestionSecret}}" }, { key: "Content-Type", value: "application/json" }] : [],
    url: "{{baseUrl}}" + endpoint.path.replace("{id}", "{{recordId}}"),
    description: `${endpoint.summary}. Intended access: ${endpoint.access}. ${implemented ? "Implemented foundation operation." : "Reserved: expect 501, no domain processing."}`,
  };
  if (internal) request.body = { mode: "raw", raw: "{}", options: { raw: { language: "json" } } };
  const item = {
    name: `${endpoint.method} ${endpoint.path} (${id})`, request,
    protocolProfileBehavior: { followRedirects: false, disableCookies: true },
    event: [{ listen: "test", script: { type: "text/javascript", exec: [
      `pm.test("Expected foundation status", function () { pm.response.to.have.status(${expected}); });`,
      ...(internal ? [
        'pm.test("Integration error code", function () { const expected = pm.environment.get("integrationConfigured") !== "true" ? "INTEGRATION_NOT_CONFIGURED" : pm.environment.get("ingestionSecret") ? "FEATURE_NOT_IMPLEMENTED" : "UNAUTHORIZED_INTEGRATION"; pm.expect(pm.response.json().error.code).to.eql(expected); });',
      ] : protectedRoute ? [
        'pm.test("Anonymous access is denied", function () { pm.expect(pm.response.json().error.code).to.eql("UNAUTHENTICATED"); });',
      ] : !implemented ? [
        'pm.test("Reserved operation is explicit", function () { pm.expect(pm.response.json().error.code).to.eql("FEATURE_NOT_IMPLEMENTED"); });',
      ] : []),
    ] } }],
  };
  if (!groups.has(endpoint.group)) groups.set(endpoint.group, []);
  groups.get(endpoint.group).push(item);
}

const integrationCases = [
  ["Missing credential", undefined, "application/json", "{}", 401, "UNAUTHORIZED_INTEGRATION"],
  ["Incorrect credential", "Bearer deliberately-incorrect", "application/json", "{}", 401, "UNAUTHORIZED_INTEGRATION"],
  ["Malformed JSON", "Bearer {{ingestionSecret}}", "application/json", "{broken", 400, "INVALID_JSON"],
  ["Unsupported media type", "Bearer {{ingestionSecret}}", "text/plain", "{}", 415, "UNSUPPORTED_MEDIA_TYPE"],
  ["Non-object JSON", "Bearer {{ingestionSecret}}", "application/json", "[]", 400, "INVALID_BODY"],
];
const negativeCases = integrationCases.map(([name, authorization, mediaType, raw, status, code]) => ({
  name,
  protocolProfileBehavior: { followRedirects: false, disableCookies: true },
  request: {
    method: "POST", url: "{{baseUrl}}/api/internal/sync/archives",
    header: [
      { key: "Content-Type", value: mediaType },
      ...(authorization ? [{ key: "Authorization", value: authorization }] : []),
    ],
    body: { mode: "raw", raw },
    description: "With the server secret unset, all integration requests fail closed with 503. Configure both server and Postman environment to exercise the credential/input guard.",
  },
  event: [{ listen: "test", script: { type: "text/javascript", exec: [
    'const configured = pm.environment.get("integrationConfigured") === "true";',
    'const supplied = Boolean(pm.environment.get("ingestionSecret"));',
    `const requiresSecret = ${Boolean(authorization === "Bearer {{ingestionSecret}}")} ;`,
    `pm.test("Integration guard status", function () { pm.response.to.have.status(!configured ? 503 : requiresSecret && !supplied ? 401 : ${status}); });`,
    `pm.test("Integration guard code", function () { pm.expect(pm.response.json().error.code).to.eql(!configured ? "INTEGRATION_NOT_CONFIGURED" : requiresSecret && !supplied ? "UNAUTHORIZED_INTEGRATION" : "${code}"); });`,
  ] } }],
}));

const meta = {
  type: "object", required: ["requestId", "timestamp"],
  properties: { requestId: { type: "string", format: "uuid" }, timestamp: { type: "string", format: "date-time" } },
};
const openapi = {
  openapi: "3.1.0",
  info: { title: "KM ITS API", version: "0.2.0", description: `${entries.length} operations. System checks, Google admin login, 24-hour MongoDB sessions, and account management are implemented. Archive/Articles/Timeline ingestion and domain operations remain reserved. Admin guards apply even to reserved routes.` },
  servers: [{ url: "http://localhost:3000", description: "Local Next.js host" }],
  paths,
  components: {
    securitySchemes: {
      adminCookie: { type: "apiKey", in: "cookie", name: "kmits_session", description: "Opaque 24-hour website session. HTTPS deployments use __Host-kmits_session instead. Mutations also require Origin and X-CSRF-Token." },
      appsScriptBearer: { type: "http", scheme: "bearer", description: "Server-side APPS_SCRIPT_INGESTION_SECRET, 32+ characters. Independent of admin login. Never send this from public browser code." },
    },
    schemas: {
      Success: { type: "object", required: ["success", "data", "meta"], properties: { success: { const: true }, data: { type: "object" }, meta } },
      Failure: { type: "object", required: ["success", "error", "meta"], properties: { success: { const: false }, error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } }, meta } },
    },
  },
};
const collection = {
  info: { name: "KM ITS - Backend Foundation", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json", description: `${entries.length} anonymous operation probes and five integration guard cases. Cookie jars and redirects are disabled. Use the separate Auth Workflow collection for authenticated tests. 501 means reserved. Read backend/postman/README.md.` },
  event: [{ listen: "test", script: { type: "text/javascript", exec: [
    'if (pm.response.code !== 302) { pm.test("JSON response", function () { pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json"); }); }',
    'if (pm.response.code !== 302) { pm.test("Response envelope and request metadata", function () { const body = pm.response.json(); pm.expect(body.success).to.eql(pm.response.code < 400); pm.expect(body.meta.requestId).to.match(/^[0-9a-f-]{36}$/); pm.expect(Number.isNaN(Date.parse(body.meta.timestamp))).to.eql(false); pm.expect(pm.response.headers.get("X-Request-Id")).to.eql(body.meta.requestId); if (body.success) { pm.expect(body).to.have.property("data"); } else { pm.expect(body.error.code).to.be.a("string"); pm.expect(body).not.to.have.property("data"); } }); } else { pm.test("OAuth redirect", function () { pm.expect(pm.response.headers.get("Location").startsWith("https://accounts.google.com/")).to.eql(true); pm.expect(pm.response.headers.get("Set-Cookie")).to.include("HttpOnly"); }); }',
    'pm.test("No response caching", function () { pm.expect(pm.response.headers.get("Cache-Control")).to.include("no-store"); });',
  ] } }],
  item: [...groups].map(([name, item]) => ({ name, item })).concat([{ name: "Integration guard cases", item: negativeCases }]),
};
const environment = {
  name: "KM ITS - Local Foundation", _postman_variable_scope: "environment",
  values: [
    { key: "baseUrl", value: "http://localhost:3000", enabled: true },
    { key: "recordId", value: "000000000000000000000001", enabled: true },
    { key: "readyExpectedStatus", value: "503", enabled: true },
    { key: "loginExpectedStatus", value: "503", enabled: true },
    { key: "callbackExpectedStatus", value: "503", enabled: true },
    { key: "sessionCookie", value: "", enabled: true, type: "secret" },
    { key: "csrfToken", value: "", enabled: true, type: "secret" },
    { key: "inviteEmail", value: "", enabled: true },
    { key: "integrationConfigured", value: "false", enabled: true },
    { key: "ingestionSecret", value: "", enabled: true, type: "secret" },
  ],
};

const workflowRequest = (name, method, route, body, status, assertions = [], csrf = true) => ({
  name, protocolProfileBehavior: { disableCookies: true, followRedirects: false },
  request: {
    method, url: `{{baseUrl}}${route}`,
    header: [
      { key: "Cookie", value: "{{sessionCookie}}" },
      ...(method !== "GET" ? [
        { key: "Origin", value: "{{baseUrl}}" },
        { key: "Content-Type", value: "application/json" },
        ...(csrf ? [{ key: "X-CSRF-Token", value: "{{csrfToken}}" }] : []),
      ] : []),
    ],
    ...(body !== undefined ? { body: { mode: "raw", raw: JSON.stringify(body), options: { raw: { language: "json" } } } } : {}),
  },
  event: [{ listen: "test", script: { type: "text/javascript", exec: [
    `pm.test("Expected status", function () { pm.response.to.have.status(${status}); });`,
    ...assertions,
  ] } }],
});
const workflow = {
  info: { name: "KM ITS - Auth Workflow", schema: collection.info.schema, description: "LOCAL TEST DATA ONLY. Requires an existing SUPER_ADMIN session and a fresh inviteEmail. Creates one invitation, disables it, and logs out your current session. Never run against production. Google browser login is separate; no bypass is provided." },
  event: [
    { listen: "prerequest", script: { type: "text/javascript", exec: [
      String.raw`if (!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(pm.environment.get("baseUrl") || "")) { throw new Error("Auth workflow is limited to localhost test data."); }`,
      'if (!pm.environment.get("sessionCookie") || !pm.environment.get("inviteEmail")) { throw new Error("Set a local super-admin sessionCookie and a fresh test inviteEmail before running."); }',
    ] } },
    ...collection.event,
  ],
  item: [
    workflowRequest("Read session and capture CSRF", "GET", "/api/auth/me", undefined, 200, [
      'if (pm.response.code === 200) { const data = pm.response.json().data; pm.test("Super-admin session", function () { pm.expect(data.account.role).to.eql("SUPER_ADMIN"); const remaining = Date.parse(data.expiresAt) - Date.now(); pm.expect(remaining).to.be.above(0); pm.expect(remaining).to.be.at.most(86400000); }); pm.environment.set("csrfToken", data.csrfToken); }',
    ]),
    workflowRequest("List accounts", "GET", "/api/admin/accounts?limit=10", undefined, 200, [
      'pm.test("Private credential fields omitted", function () { const text = pm.response.text(); pm.expect(text).not.to.include("googleSub"); pm.expect(text).not.to.include("authVersion"); });',
    ]),
    workflowRequest("Reject mutation without CSRF", "POST", "/api/admin/accounts", { email: "{{inviteEmail}}", name: "Postman test invitation" }, 403, [], false),
    workflowRequest("Create test invitation", "POST", "/api/admin/accounts", { email: "{{inviteEmail}}", name: "Postman test invitation" }, 200, [
      'if (pm.response.code === 200) { const account = pm.response.json().data; pm.environment.set("createdAccountId", account.id); pm.test("New account has no elevated access", function () { pm.expect(account.role).to.eql("ADMIN"); pm.expect(account.linked).to.eql(false); }); }',
    ]),
    workflowRequest("Reject unlinked successor promotion", "PATCH", "/api/admin/accounts/{{createdAccountId}}", { role: "SUPER_ADMIN" }, 409, [
      'pm.test("Successor must login first", function () { pm.expect(pm.response.json().error.code).to.eql("SUCCESSOR_NOT_READY"); });',
    ]),
    workflowRequest("Disable test invitation", "PATCH", "/api/admin/accounts/{{createdAccountId}}", { active: false }, 200),
    workflowRequest("Logout current session", "POST", "/api/auth/logout", {}, 200, [
      'pm.test("Session cookie cleared", function () { pm.expect(pm.response.headers.get("Set-Cookie")).to.include("Max-Age=0"); });',
    ]),
    workflowRequest("Reject revoked session", "GET", "/api/auth/me", undefined, 401),
  ],
};

for (const [relative, content] of [
  ["openapi.json", openapi],
  ["postman/KMITS.postman_collection.json", collection],
  ["postman/Local.postman_environment.json", environment],
  ["postman/Auth.postman_collection.json", workflow],
]) {
  const file = path.join(root, relative);
  const serialized = JSON.stringify(content, null, 2) + "\n";
  if (check) {
    const actual = await readFile(file, "utf8");
    if (actual.replace(/\r\n/g, "\n") !== serialized) throw new Error(`${relative} is out of date. Run pnpm api:generate.`);
  } else {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, serialized);
  }
}
console.log(`${check ? "Verified" : "Generated"} API kit: ${entries.length} operations, ${entries.length + negativeCases.length} Postman requests.`);
