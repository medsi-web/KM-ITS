import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { ingestArticles } from "../src/modules/articles/ingestion.ts";
import { articleCollections, initializeArticles } from "../src/modules/articles/store.ts";
import { syncArticles } from "../src/modules/sync/handlers.ts";
import { articleBatch, FORM, submission } from "./fixtures/articles.ts";

let replica: MongoMemoryReplSet;
const secret = "articles-integration-secret-not-for-deployment";
before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "articles_sync_test";
  process.env.APPS_SCRIPT_INGESTION_SECRET = secret;
  process.env.ARTICLE_FORM_ID = FORM;
});
after(async () => { await (await getMongoClient()).close(); await replica?.stop(); });

const outcomes = async (...items: unknown[]) => (await ingestArticles(articleBatch(...items))).results.map(result => result.outcome);

test("requests fail closed before Article setup", async () => {
  await assert.rejects(ingestArticles(articleBatch(submission())), (error: { code?: string }) => error.code === "ARTICLES_NOT_INITIALIZED");
  await initializeArticles(await getDatabase());
});

test("new submissions are stored unpublished with draft equal to source", async () => {
  const store = articleCollections(await getDatabase());
  assert.deepEqual(await outcomes(submission("r1")), ["applied"]);
  const record = (await store.articles.findOne({ responseId: "r1" }))!;
  assert.equal(record.isPublished, false);
  assert.equal(record.published, null);
  assert.equal(record.draft.revision, 1);
  assert.equal(record.draft.fingerprint, record.source.fingerprint);
  assert.equal(record.submitterEmail, "contributor@example.com");
});

test("ordering, retries and conflicts", async () => {
  const store = articleCollections(await getDatabase());
  assert.deepEqual(await outcomes(submission("r1")), ["unchanged"]);
  assert.deepEqual(await outcomes(submission("r1", undefined, { title: "Same time, other content" })), ["conflict"]);
  assert.deepEqual(await outcomes(submission("r1", "2026-11-15T00:00:00Z", { title: "Older" })), ["stale"]);
  assert.deepEqual(await outcomes(submission("r1", "2026-11-17T00:00:00Z")), ["unchanged"]);
  const record = (await store.articles.findOne({ responseId: "r1" }))!;
  assert.equal(record.submittedAt.toISOString(), "2026-11-17T00:00:00.000Z");
  assert.equal(record.draft.revision, 1);
  assert.equal(record.source.content.title, "Ministry programme");
});

test("source updates follow unedited drafts, flag edited drafts and never change the published copy", async () => {
  const store = articleCollections(await getDatabase());
  // Simulate an existing publication of revision 1.
  const original = (await store.articles.findOne({ responseId: "r1" }))!;
  await store.articles.updateOne({ _id: original._id }, { $set: { isPublished: true, published: { ...original.source, publishedAt: new Date(), publishedBy: "admin" }, firstPublishedAt: new Date() } });

  assert.deepEqual(await outcomes(submission("r1", "2026-11-18T00:00:00Z", { title: "Contributor update" })), ["applied"]);
  let record = (await store.articles.findOne({ responseId: "r1" }))!;
  assert.equal(record.published?.content.title, "Ministry programme");
  assert.equal(record.draft.content.title, "Contributor update");
  assert.equal(record.draft.revision, 2);
  assert.equal(record.sourceUpdatePending, false);

  // After an admin edit, the draft is kept and the update is flagged.
  await store.articles.updateOne({ _id: original._id }, { $set: { "draft.content.title": "Admin title", "draft.editedBy": "admin", "draft.fingerprint": "edited", "draft.revision": 3 } });
  assert.deepEqual(await outcomes(submission("r1", "2026-11-19T00:00:00Z", { title: "Second update" })), ["applied"]);
  record = (await store.articles.findOne({ responseId: "r1" }))!;
  assert.equal(record.draft.content.title, "Admin title");
  assert.equal(record.draft.revision, 3);
  assert.equal(record.source.content.title, "Second update");
  assert.equal(record.sourceUpdatePending, true);
  assert.equal(record.published?.content.title, "Ministry programme");
  assert.equal(record.isPublished, true);
});

test("invalid items are logged without content and concurrent first deliveries create one record", async () => {
  const store = articleCollections(await getDatabase());
  const result = await ingestArticles(articleBatch(submission("bad", undefined, { title: "" }), submission("r2")));
  assert.deepEqual(result.results, [
    { index: 0, responseId: "bad", outcome: "invalid", reason: "INVALID_TITLE" },
    { index: 1, responseId: "r2", outcome: "applied" },
  ]);
  assert.ok(!JSON.stringify(await store.syncLogs.find({}).toArray()).includes("Body text"));
  const race = await Promise.all([1, 2, 3].map(() => outcomes(submission("race"))));
  assert.deepEqual(race.flat().sort(), ["applied", "unchanged", "unchanged"]);
  assert.equal(await store.articles.countDocuments({ responseId: "race" }), 1);
});

test("HTTP handler authenticates, maps envelope errors to 422 and logs rejected requests", async () => {
  const store = articleCollections(await getDatabase());
  const post = (body: string, authorization = `Bearer ${secret}`) => syncArticles(new Request("http://localhost/api/internal/sync/articles", {
    method: "POST", body, headers: { "content-type": "application/json", authorization } }));
  assert.equal((await post(JSON.stringify(articleBatch(submission())), "Bearer wrong")).status, 401);
  const before = await store.syncLogs.countDocuments({ responseId: null });
  assert.equal((await post("{broken")).status, 400);
  assert.equal((await post(JSON.stringify({ ...articleBatch(submission()), formId: "other" }))).status, 422);
  assert.equal(await store.syncLogs.countDocuments({ responseId: null }), before + 2);
  const response = await post(JSON.stringify(articleBatch(submission("http"))));
  assert.equal(response.status, 200);
});
