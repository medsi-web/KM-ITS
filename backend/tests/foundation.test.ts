import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { endpoints } from "../src/contracts/endpoints.ts";
import type { EndpointId } from "../src/contracts/endpoints.ts";
import { requireIngestionSecret } from "../src/integrations/apps-script.ts";
import { pingDatabase } from "../src/lib/database.ts";
import { ApiError, defineHandler, MAX_JSON_BYTES, readJsonObject } from "../src/lib/http.ts";
import { reservedEndpoint } from "../src/lib/reserved-endpoint.ts";
import { createReadinessHandler, health } from "../src/modules/system/handlers.ts";

const originalEnvironment = { ...process.env };
const testSecret = "foundation-test-credential-not-for-deployment";
type TestBody = {
  success: boolean;
  data: { stage: string; checks: { database: string } };
  error: { code: string };
  meta: { requestId: string; timestamp: string };
};
async function responseBody(response: Response): Promise<TestBody> {
  return await response.json() as TestBody;
}
afterEach(() => {
  process.env = { ...originalEnvironment };
  mock.restoreAll();
});

function request(body = "{}", headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/internal/sync/archives", {
    method: "POST", body,
    headers: { "content-type": "application/json", ...headers },
  });
}

function apiError(status: number, code: string) {
  return (error: unknown) => error instanceof ApiError && error.status === status && error.code === code;
}

test("liveness is independent of the database and has fresh, non-cacheable response metadata", async () => {
  delete process.env.MONGODB_URI;
  const first = await health(new Request("http://localhost/api/health"));
  const second = await health(new Request("http://localhost/api/health"));
  const body = await responseBody(first);
  assert.equal(first.status, 200);
  assert.equal(body.success, true);
  assert.equal(body.data.stage, "foundation");
  assert.equal(first.headers.get("cache-control"), "no-store");
  assert.equal(first.headers.get("x-request-id"), body.meta.requestId);
  assert.notEqual(first.headers.get("x-request-id"), second.headers.get("x-request-id"));
  assert.ok(Number.isFinite(Date.parse(body.meta.timestamp)));
});

test("readiness succeeds only after its dependency passes", async () => {
  let calls = 0;
  const handler = createReadinessHandler(async () => { calls++; });
  const response = await handler(new Request("http://localhost/api/ready"));
  assert.equal(calls, 1);
  assert.equal(response.status, 200);
  assert.equal((await responseBody(response)).data.checks.database, "ok");
});

test("missing database configuration produces 503, never a fake ready response", async () => {
  delete process.env.MONGODB_URI;
  delete process.env.MONGODB_DATABASE;
  const response = await createReadinessHandler(pingDatabase)(new Request("http://localhost/api/ready"));
  assert.equal(response.status, 503);
  assert.equal((await responseBody(response)).error.code, "DATABASE_NOT_CONFIGURED");
});

test("database parsing errors are sanitized", async () => {
  process.env.MONGODB_URI = "invalid-uri-with-secret-should-never-be-returned";
  process.env.MONGODB_DATABASE = "kmits";
  const response = await createReadinessHandler(pingDatabase)(new Request("http://localhost/api/ready"));
  assert.equal(response.status, 503);
  const text = await response.text();
  assert.ok(text.includes("DATABASE_UNAVAILABLE"));
  assert.ok(!text.includes(process.env.MONGODB_URI));
});

test("unexpected errors expose only a generic response and safe diagnostic fields", async () => {
  const log = mock.method(console, "error", () => {});
  const handler = defineHandler("test.failure", () => { throw new Error("secret-database-uri"); });
  const response = await handler(new Request("http://localhost/api/test"));
  assert.equal(response.status, 500);
  assert.ok(!(await response.text()).includes("secret-database-uri"));
  assert.equal(log.mock.callCount(), 1);
  assert.ok(!JSON.stringify(log.mock.calls).includes("secret-database-uri"));
});

test("ingestion stays disabled for absent or short configuration", () => {
  for (const value of ["", "too-short"]) {
    process.env.APPS_SCRIPT_INGESTION_SECRET = value;
    assert.throws(() => requireIngestionSecret(request()), apiError(503, "INTEGRATION_NOT_CONFIGURED"));
  }
});

test("configured ingestion rejects missing/wrong credentials and accepts the exact secret", () => {
  process.env.APPS_SCRIPT_INGESTION_SECRET = testSecret;
  for (const authorization of ["", "Basic abc", "Bearer wrong", `Bearer ${testSecret}x`]) {
    assert.throws(() => requireIngestionSecret(request("{}", { authorization })), apiError(401, "UNAUTHORIZED_INTEGRATION"));
  }
  requireIngestionSecret(request("{}", { authorization: `Bearer ${testSecret}` }));
});

test("JSON transport rejects malformed and non-object bodies", async () => {
  for (const body of ["", "{broken"]) {
    await assert.rejects(readJsonObject(request(body)), apiError(400, "INVALID_JSON"));
  }
  for (const body of ["null", "[]", "true", "42", '"text"']) {
    await assert.rejects(readJsonObject(request(body)), apiError(400, "INVALID_BODY"));
  }
  assert.deepEqual(await readJsonObject(request('{"deliveryId":"example"}')), { deliveryId: "example" });
});

test("JSON transport checks media type and enforces actual bytes even without Content-Length", async () => {
  await assert.rejects(readJsonObject(request("{}", { "content-type": "text/plain" })), apiError(415, "UNSUPPORTED_MEDIA_TYPE"));
  await assert.rejects(readJsonObject(request("{}", { "content-length": String(MAX_JSON_BYTES + 1) })), apiError(413, "PAYLOAD_TOO_LARGE"));
  await assert.rejects(readJsonObject(request(JSON.stringify({ text: "é".repeat(MAX_JSON_BYTES) }))), apiError(413, "PAYLOAD_TOO_LARGE"));
});

test("every reserved domain operation fails closed without returning or storing feature data", async () => {
  process.env.APPS_SCRIPT_INGESTION_SECRET = testSecret;
  for (const id of Object.keys(endpoints) as EndpointId[]) {
    if (id.startsWith("system.")) continue;
    const response = await reservedEndpoint(id)(request("{}", { authorization: `Bearer ${testSecret}` }));
    const body = await responseBody(response);
    assert.equal(response.status, 501, id);
    assert.equal(body.error.code, "FEATURE_NOT_IMPLEMENTED", id);
    assert.equal(body.success, false, id);
    assert.equal("data" in body, false, id);
  }
});

test("internal endpoints authenticate before parsing and never acknowledge ingestion", async () => {
  process.env.APPS_SCRIPT_INGESTION_SECRET = testSecret;
  const handler = reservedEndpoint("sync.archives");
  assert.equal((await handler(request("{broken"))).status, 401);
  assert.equal((await handler(request("{broken", { authorization: `Bearer ${testSecret}` }))).status, 400);
  assert.equal((await handler(request("{}", { authorization: `Bearer ${testSecret}` }))).status, 501);
});
