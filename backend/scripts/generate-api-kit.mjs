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
  const responses = implemented
    ? { 200: successResponse(endpoint.summary) }
    : { 501: errorResponse("Reserved operation. No domain data is read or saved.") };
  if (id === "system.ready") responses[503] = errorResponse("MongoDB is not configured or is unavailable.");
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
      : "Reserved foundation adapter, returning 501. Domain schemas and behavior will be implemented separately. Admin/session checks are not implemented; no admin operations are available.",
    "x-implementation-status": implemented ? "implemented" : "reserved",
    "x-intended-access": endpoint.access,
    security: internal ? [{ appsScriptBearer: [] }] : [],
    responses,
  };
  if (endpoint.path.includes("{id}")) {
    operation.parameters = [{ name: "id", in: "path", required: true, schema: { type: "string" }, description: "Application record ID. Domain ID validation is not implemented yet." }];
  }
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
    event: [{ listen: "test", script: { type: "text/javascript", exec: [
      `pm.test("Expected foundation status", function () { pm.response.to.have.status(${expected}); });`,
      ...(internal ? [
        'pm.test("Integration error code", function () { const expected = pm.environment.get("integrationConfigured") !== "true" ? "INTEGRATION_NOT_CONFIGURED" : pm.environment.get("ingestionSecret") ? "FEATURE_NOT_IMPLEMENTED" : "UNAUTHORIZED_INTEGRATION"; pm.expect(pm.response.json().error.code).to.eql(expected); });',
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
  info: { title: "KM ITS API foundation", version: "0.1.0", description: "33 operations: two implemented system checks; 31 reserved adapters. Domain request/response contracts remain draft. No Apps Script synchronization or admin authentication is implemented." },
  servers: [{ url: "http://localhost:3000", description: "Local Next.js host" }],
  paths,
  components: {
    securitySchemes: { appsScriptBearer: { type: "http", scheme: "bearer", description: "Server-side APPS_SCRIPT_INGESTION_SECRET, 32+ characters. Configure the Apps Script connector separately; never send this token from public browser code." } },
    schemas: {
      Success: { type: "object", required: ["success", "data", "meta"], properties: { success: { const: true }, data: { type: "object" }, meta } },
      Failure: { type: "object", required: ["success", "error", "meta"], properties: { success: { const: false }, error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" } } }, meta } },
    },
  },
};
const collection = {
  info: { name: "KM ITS - Backend Foundation", schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json", description: "Foundation smoke tests: 33 operation probes and five integration guard cases. 501 means reserved, not functional success. Import the supplied local environment. Read backend/postman/README.md first." },
  event: [{ listen: "test", script: { type: "text/javascript", exec: [
    'pm.test("JSON response", function () { pm.expect(pm.response.headers.get("Content-Type")).to.include("application/json"); });',
    'pm.test("Response envelope and request metadata", function () { const body = pm.response.json(); pm.expect(body.success).to.eql(pm.response.code < 400); pm.expect(body.meta.requestId).to.match(/^[0-9a-f-]{36}$/); pm.expect(body.meta.timestamp).to.be.a("string"); pm.expect(Number.isNaN(Date.parse(body.meta.timestamp))).to.eql(false); pm.expect(pm.response.headers.get("X-Request-Id")).to.eql(body.meta.requestId); if (body.success) { pm.expect(body).to.have.property("data"); } else { pm.expect(body.error.code).to.be.a("string"); pm.expect(body.error.message).to.be.a("string"); pm.expect(body).not.to.have.property("data"); } });',
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
    { key: "integrationConfigured", value: "false", enabled: true },
    { key: "ingestionSecret", value: "", enabled: true, type: "secret" },
  ],
};

for (const [relative, content] of [
  ["openapi.json", openapi],
  ["postman/KMITS.postman_collection.json", collection],
  ["postman/Local.postman_environment.json", environment],
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
