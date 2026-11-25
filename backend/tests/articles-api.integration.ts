import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { getDatabase, getMongoClient } from "../src/lib/database.ts";
import { articlesAdminDetail, articlesAdminList, articlesPublish, articlesUnpublish, articlesUpdate } from "../src/modules/articles/admin.ts";
import { ingestArticles } from "../src/modules/articles/ingestion.ts";
import { articlesDetail, articlesList } from "../src/modules/articles/public.ts";
import { articleCollections, initializeArticles } from "../src/modules/articles/store.ts";
import { authCollections, initializeAuth } from "../src/modules/auth/store.ts";
import { syncLogs } from "../src/modules/sync/handlers.ts";
import { adminRequest, adminSessions, data, ORIGIN } from "./fixtures/admin.ts";
import { articleBatch, FORM, submission } from "./fixtures/articles.ts";

let replica: MongoMemoryReplSet;
let tokens: { admin: string; superAdmin: string };
let id: string;
type Detail = { revision: number; isPublished: boolean; hasUnpublishedChanges: boolean; sourceUpdatePending: boolean; draftEdited: boolean;
  draft: { content: { title: string; body: string } }; source: { title: string }; published: { content: { title: string } } | null; lastSync?: { outcome: string } };
type PublicArticle = { id: string; title: string; body?: string; publishedAt: string; updatedAt: string };

before(async () => {
  replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  process.env.MONGODB_URI = replica.getUri();
  process.env.MONGODB_DATABASE = "articles_api_test";
  process.env.APP_ORIGIN = ORIGIN;
  process.env.ARTICLE_FORM_ID = FORM;
  const database = await getDatabase();
  await initializeAuth(database);
  await initializeArticles(database);
  tokens = await adminSessions(database);
  await ingestArticles(articleBatch(submission("r1")));
  id = (await articleCollections(database).articles.findOne({ responseId: "r1" }))!._id;
});
after(async () => { await (await getMongoClient()).close(); await replica?.stop(); });

const path = () => `/api/admin/articles/${id}`;
const detail = async () => data<Detail>(await articlesAdminDetail(adminRequest(path(), { token: tokens.admin })));
const publicList = async () => data<{ items: PublicArticle[]; total: number }>(await articlesList(new Request(`${ORIGIN}/api/articles`)));
const publicDetail = (articleId = id) => articlesDetail(new Request(`${ORIGIN}/api/articles/${articleId}`));
const edit = (body: unknown, token = tokens.admin) => articlesUpdate(adminRequest(path(), { token, method: "PATCH", body }));
const publish = (revision: number, token = tokens.admin) => articlesPublish(adminRequest(`${path()}/publish`, { token, method: "POST", body: { revision } }));

test("submissions are never public before an admin publishes them", async () => {
  assert.equal((await publicList()).total, 0);
  assert.equal((await publicDetail()).status, 404);
  const queue = await data<{ items: { id: string; isPublished: boolean }[]; total: number }>(await articlesAdminList(adminRequest("/api/admin/articles?published=false", { token: tokens.admin })));
  assert.deepEqual(queue.items.map(item => item.id), [id]);
  assert.equal((await articlesAdminList(adminRequest("/api/admin/articles?published=maybe", { token: tokens.admin }))).status, 400);
  const current = await detail();
  assert.equal(current.revision, 1);
  assert.equal(current.hasUnpublishedChanges, true);
  assert.equal(current.lastSync?.outcome, "applied");
});

test("access guards: session, CSRF and request shape", async () => {
  for (const handler of [articlesAdminList, articlesAdminDetail, articlesUpdate, articlesPublish, articlesUnpublish]) {
    assert.equal((await handler(adminRequest(path()))).status, 401);
  }
  assert.equal((await articlesPublish(adminRequest(`${path()}/publish`, { token: tokens.admin, method: "POST", body: { revision: 1 }, csrf: false }))).status, 403);
  for (const body of [{ revision: 1 }, { title: "No revision" }, { revision: 1, notes: "x" }, { revision: 1, resetToSource: false }, { revision: 1, resetToSource: true, title: "x" }, { revision: 1, title: "" }]) {
    assert.equal((await edit(body)).status, 400, JSON.stringify(body));
  }
  assert.equal((await articlesPublish(adminRequest(`${path()}/publish`, { token: tokens.admin, method: "POST", body: {} }))).status, 400);
  assert.equal((await articlesUnpublish(adminRequest(`${path()}/unpublish`, { token: tokens.admin, method: "POST", body: { revision: 1 } }))).status, 400);
  assert.equal((await articlesAdminDetail(adminRequest("/api/admin/articles/unknown", { token: tokens.admin }))).status, 404);
});

test("publish requires the reviewed revision and exposes only the published copy", async () => {
  const stale = await publish(2);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json() as { error: { code: string } }).error.code, "ARTICLE_CHANGED");
  assert.equal((await publish(1)).status, 200);
  const list = await publicList();
  assert.equal(list.total, 1);
  assert.equal(list.items[0].title, "Ministry programme");
  assert.ok(!("body" in list.items[0]) && !("submitterEmail" in list.items[0]));
  const article = await data<PublicArticle>(await publicDetail());
  assert.equal(article.body, "## Heading\n\nBody text.");
  assert.ok(!JSON.stringify(article).includes("contributor@example.com"));
  assert.equal((await detail()).hasUnpublishedChanges, false);
});

test("source updates and admin edits stay out of public view until republished", async () => {
  // Unedited draft follows the source; public copy unchanged.
  await ingestArticles(articleBatch(submission("r1", "2026-11-17T00:00:00Z", { title: "Contributor update" })));
  let current = await detail();
  assert.equal(current.draft.content.title, "Contributor update");
  assert.equal(current.revision, 2);
  assert.equal(current.hasUnpublishedChanges, true);
  assert.equal((await data<PublicArticle>(await publicDetail())).title, "Ministry programme");

  // A publish aimed at the revision the admin reviewed earlier is refused.
  assert.equal((await publish(1)).status, 409);

  // Admin edit bumps the revision and marks the draft as edited.
  assert.equal((await edit({ revision: 1, title: "Lost update" })).status, 409);
  current = await data<Detail>(await edit({ revision: 2, title: "Admin title", body: "Edited body" }));
  assert.equal(current.revision, 3);
  assert.equal(current.draftEdited, true);

  // A later source update keeps the edited draft and flags it.
  await ingestArticles(articleBatch(submission("r1", "2026-11-18T00:00:00Z", { title: "Second update" })));
  current = await detail();
  assert.equal(current.draft.content.title, "Admin title");
  assert.equal(current.source.title, "Second update");
  assert.equal(current.sourceUpdatePending, true);

  // Reset replaces the draft with the source and clears the flags.
  current = await data<Detail>(await edit({ revision: 3, resetToSource: true }, tokens.superAdmin));
  assert.equal(current.draft.content.title, "Second update");
  assert.equal(current.revision, 4);
  assert.equal(current.sourceUpdatePending, false);
  assert.equal(current.draftEdited, false);

  const before = await data<PublicArticle>(await publicDetail());
  assert.equal((await publish(4)).status, 200);
  const after = await data<PublicArticle>(await publicDetail());
  assert.equal(after.title, "Second update");
  assert.equal(after.publishedAt, before.publishedAt);
  assert.ok(after.updatedAt > before.updatedAt);
});

test("unpublish hides the article, keeps the copy and every action is audited", async () => {
  const response = await articlesUnpublish(adminRequest(`${path()}/unpublish`, { token: tokens.admin, method: "POST", body: {} }));
  assert.equal(response.status, 200);
  const current = await data<Detail>(response);
  assert.equal(current.isPublished, false);
  assert.equal(current.published?.content.title, "Second update");
  assert.equal((await publicDetail()).status, 404);
  assert.equal((await publicList()).total, 0);
  const audits = await authCollections(await getDatabase()).audit.find({ targetId: id }).sort({ at: 1 }).toArray();
  assert.deepEqual(audits.map(entry => entry.action), ["article.published", "article.edited", "article.reset", "article.published", "article.unpublished"]);
  assert.equal((audits[2].changes?.actor as { role: string }).role, "SUPER_ADMIN");
  assert.ok(!JSON.stringify(audits).includes("Edited body"));
});

test("public list pagination is configurable", async () => {
  process.env.ARTICLE_PAGE_MAX_LIMIT = "5";
  assert.equal((await articlesList(new Request(`${ORIGIN}/api/articles?limit=6`))).status, 400);
  assert.equal((await articlesList(new Request(`${ORIGIN}/api/articles?search=x`))).status, 400);
  delete process.env.ARTICLE_PAGE_MAX_LIMIT;
  assert.equal((await publicDetail("not-a-uuid")).status, 404);
});

test("article sync logs are readable through the shared endpoint", async () => {
  const response = await syncLogs(adminRequest("/api/admin/sync-logs?source=articles&responseId=r1", { token: tokens.admin }));
  const logs = await data<{ source: string; items: { responseId: string }[]; total: number }>(response);
  assert.equal(logs.source, "articles");
  assert.equal(logs.total, 3);
  assert.equal((await syncLogs(adminRequest("/api/admin/sync-logs?source=articles&eventId=x", { token: tokens.admin }))).status, 400);
});
