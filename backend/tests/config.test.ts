import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { integerSetting, sourceIdSetting } from "../src/lib/config.ts";
import { FieldError, identifier, instant, record, text, textList } from "../src/lib/fields.ts";
import { ApiError, MAX_JSON_BYTES, maxJsonBytes, readJsonObject } from "../src/lib/http.ts";
import { readPagination, rejectUnknownQuery } from "../src/lib/pagination.ts";

const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; });

const code = (status: number, value: string) => (error: unknown) => error instanceof ApiError && error.status === status && error.code === value;

test("integer settings use defaults, accept valid overrides and fail closed on invalid values", () => {
  delete process.env.TEST_LIMIT;
  assert.equal(integerSetting("TEST_LIMIT", 50, 1, 100), 50);
  process.env.TEST_LIMIT = " 75 ";
  assert.equal(integerSetting("TEST_LIMIT", 50, 1, 100), 75);
  for (const value of ["0", "101", "1.5", "-3", "abc"]) {
    process.env.TEST_LIMIT = value;
    assert.throws(() => integerSetting("TEST_LIMIT", 50, 1, 100), code(503, "CONFIGURATION_INVALID"));
  }
});

test("source identifiers are required and reject whitespace", () => {
  delete process.env.TEST_SOURCE;
  assert.throws(() => sourceIdSetting("TEST_SOURCE", "TEST_NOT_CONFIGURED", "Test"), code(503, "TEST_NOT_CONFIGURED"));
  process.env.TEST_SOURCE = "calendar id";
  assert.throws(() => sourceIdSetting("TEST_SOURCE", "TEST_NOT_CONFIGURED", "Test"), code(503, "CONFIGURATION_INVALID"));
  process.env.TEST_SOURCE = "km-its@group.calendar.google.com";
  assert.equal(sourceIdSetting("TEST_SOURCE", "TEST_NOT_CONFIGURED", "Test"), "km-its@group.calendar.google.com");
});

test("request body limit is configurable", async () => {
  assert.equal(maxJsonBytes(), MAX_JSON_BYTES);
  process.env.API_MAX_JSON_BYTES = "1024";
  const body = JSON.stringify({ text: "x".repeat(2000) });
  await assert.rejects(readJsonObject(new Request("http://localhost/api", { method: "POST", body, headers: { "content-type": "application/json" } })), code(413, "PAYLOAD_TOO_LARGE"));
  process.env.API_MAX_JSON_BYTES = "100";
  assert.throws(() => maxJsonBytes(), code(503, "CONFIGURATION_INVALID"));
});

test("pagination honours configured bounds and unknown query parameters are rejected", () => {
  assert.deepEqual(readPagination(new URL("http://x/?limit=150"), 50, 200), { limit: 150, offset: 0 });
  assert.deepEqual(readPagination(new URL("http://x/"), 50, 20), { limit: 20, offset: 0 });
  assert.throws(() => readPagination(new URL("http://x/?limit=201"), 50, 200), code(400, "INVALID_PAGINATION"));
  assert.throws(() => readPagination(new URL("http://x/?offset=-1"), 50, 200), code(400, "INVALID_PAGINATION"));
  assert.throws(() => rejectUnknownQuery(new URL("http://x/?search=a"), ["limit"]), code(400, "UNSUPPORTED_QUERY"));
});

test("field validators name the failing field without echoing its value", () => {
  const reason = (action: () => unknown) => { try { action(); } catch (error) { return error instanceof FieldError ? error.reason : "other"; } return "none"; };
  assert.equal(reason(() => text("", 10, "title")), "INVALID_TITLE");
  assert.equal(text(undefined, 10, "summary", ""), "");
  assert.equal(text("  padded  ", 10, "title"), "padded");
  assert.equal(reason(() => instant("2026-11-16", "startAt")), "INVALID_START_AT");
  assert.equal(instant("2026-11-16T07:00:00+07:00", "startAt").toISOString(), "2026-11-16T00:00:00.000Z");
  assert.equal(reason(() => identifier("bad id", 20, "eventId")), "INVALID_EVENT_ID");
  assert.equal(reason(() => record({ extra: 1 }, ["known"], "coverImage")), "INVALID_COVER_IMAGE");
  assert.equal(reason(() => textList(["a", ""], 5, 10, "authors")), "INVALID_AUTHORS");
});
