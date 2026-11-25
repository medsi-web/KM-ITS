import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError } from "../src/lib/http.ts";
import { validateArticleBatch } from "../src/modules/articles/validation.ts";
import { article, articleBatch, FORM, submission } from "./fixtures/articles.ts";

const originalEnvironment = { ...process.env };
process.env.ARTICLE_FORM_ID = FORM;
afterEach(() => { process.env = { ...originalEnvironment, ARTICLE_FORM_ID: FORM }; });

const rejected = (error: unknown) => error instanceof ApiError && error.status === 422 && error.code === "INVALID_ARTICLE_BATCH";
const reasons = (...items: unknown[]) => validateArticleBatch(articleBatch(...items)).items.map(item => item.ok ? "ok" : item.reason);

test("envelope rejects other forms, versions, unknown keys and item counts", () => {
  assert.throws(() => validateArticleBatch({ ...articleBatch(submission()), formId: "other" }), rejected);
  assert.throws(() => validateArticleBatch({ ...articleBatch(submission()), protocolVersion: 2 }), rejected);
  assert.throws(() => validateArticleBatch({ ...articleBatch(submission()), extra: 1 }), rejected);
  assert.throws(() => validateArticleBatch(articleBatch()), rejected);
  process.env.ARTICLE_SYNC_MAX_ITEMS = "1";
  assert.throws(() => validateArticleBatch(articleBatch(submission("a"), submission("b"))), rejected);
  delete process.env.ARTICLE_FORM_ID;
  assert.throws(() => validateArticleBatch(articleBatch(submission())), (error: unknown) => error instanceof ApiError && error.code === "ARTICLES_NOT_CONFIGURED");
});

test("schema v1 defaults optional fields and rejects template violations per item", () => {
  const minimal = validateArticleBatch(articleBatch({ responseId: "min", submittedAt: "2026-11-16T00:00:00Z", article: { schemaVersion: 1, title: "Title", body: "Body" } })).items[0];
  assert.ok(minimal.ok);
  assert.deepEqual(minimal.value.content, { schemaVersion: 1, title: "Title", summary: "", category: "", ministry: "", authors: [], coverImage: null, body: "Body" });
  assert.equal(minimal.value.submitterEmail, null);
  assert.deepEqual(reasons(
    submission("ok"),
    submission("notes", undefined, { notes: "private" }),
    submission("v2", undefined, { schemaVersion: 2 }),
    submission("nobody", undefined, { body: "" }),
    submission("image", undefined, { coverImage: { driveFileId: "bad id" } }),
    submission("mail", undefined, {}, { submitterEmail: "not-an-email" }),
    submission("when", "16/11/2026"),
  ), ["ok", "INVALID_ARTICLE", "INVALID_SCHEMA_VERSION", "INVALID_BODY", "INVALID_COVER_IMAGE_DRIVE_FILE_ID", "INVALID_SUBMITTER_EMAIL", "INVALID_SUBMITTED_AT"]);
});

test("body and summary limits are configurable and fingerprints ignore key order", () => {
  process.env.ARTICLE_BODY_MAX_CHARS = "10";
  process.env.ARTICLE_SUMMARY_MAX_CHARS = "6";
  assert.deepEqual(reasons(submission("long", undefined, { body: "x".repeat(11) }), submission("teaser", undefined, { summary: "seven!!" })), ["INVALID_BODY", "INVALID_SUMMARY"]);
  delete process.env.ARTICLE_BODY_MAX_CHARS; delete process.env.ARTICLE_SUMMARY_MAX_CHARS;
  const reordered = Object.fromEntries(Object.entries(article()).reverse());
  const [first, second] = validateArticleBatch(articleBatch(submission("a"), { ...submission("b"), article: reordered })).items;
  assert.ok(first.ok && second.ok);
  assert.equal(first.value.fingerprint, second.value.fingerprint);
});
