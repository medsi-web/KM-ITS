// Runs the Apps Script connector code (apps-script/src/*.js) in a Node vm with
// fake Google services, and checks every payload it sends with the backend's
// own validators. No Google account or network is used.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { afterEach, test } from "node:test";
import { validateObservation } from "../src/modules/archives/validation.ts";
import { validateEventBatch } from "../src/modules/events/validation.ts";

const SOURCE = path.resolve(import.meta.dirname, "../apps-script/src");
const SECRET = "apps-script-test-secret-not-for-deployment";
const originalEnvironment = { ...process.env };
afterEach(() => { process.env = { ...originalEnvironment }; });

type Json = Record<string, unknown>;
type Reply = { status: number; body?: unknown } | { throws: string };
interface DriveFile { id: string; name: string; mimeType: string; version: string; size?: string; sha256Checksum?: string; content?: string; bytes?: Buffer; access?: string }

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const ok = (data: unknown) => ({ status: 200, body: { success: true, data } });

function connector(options: { properties?: Record<string, string>; folders?: Record<string, DriveFile[] | Error>; calendar?: (options: Json) => unknown; form?: unknown } = {}) {
  const properties = new Map(Object.entries({
    KMITS_BACKEND_URL: "https://kmits.example", KMITS_INGESTION_SECRET: SECRET, ...options.properties,
  }));
  const requests: { url: string; body: Json; authorization: string }[] = [];
  let reply: (body: Json, url: string) => Reply = () => ok({ outcome: "applied", results: [] });
  const logs: string[] = [];
  const files = () => Object.values(options.folders ?? {}).flatMap(value => value instanceof Error ? [] : value);
  const sandbox: Json = {
    console: { log: (line: string) => logs.push(line), error: (line: string) => logs.push(line) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: (key: string) => properties.get(key) ?? null,
      setProperty: (key: string, value: string) => { properties.set(key, String(value)); },
      deleteProperty: (key: string) => { properties.delete(key); },
      getKeys: () => [...properties.keys()],
    }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
    UrlFetchApp: { fetch(url: string, init: Json) {
      const body = JSON.parse(String(init.payload)) as Json;
      requests.push({ url, body, authorization: (init.headers as Json).Authorization as string });
      const answer = reply(body, url);
      if ("throws" in answer) throw new Error(answer.throws);
      return { getResponseCode: () => answer.status, getContentText: () => JSON.stringify(answer.body ?? {}) };
    } },
    Utilities: {
      DigestAlgorithm: { SHA_256: "SHA_256" }, Charset: { UTF_8: "UTF_8" },
      computeDigest(_algorithm: string, value: string | number[]) {
        const digest = createHash("sha256").update(typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value)).digest();
        return [...digest].map(byte => (byte > 127 ? byte - 256 : byte)); // Apps Script bytes are signed.
      },
      parseDate(date: string, timeZone: string, format: string) {
        assert.equal(timeZone, "Asia/Jakarta"); assert.equal(format, "yyyy-MM-dd");
        return new Date(`${date}T00:00:00+07:00`);
      },
    },
    Drive: { Files: { list(query: Json) {
      const folderId = /^'([^']+)' in parents/.exec(String(query.q))![1];
      const entry = options.folders?.[folderId];
      if (entry instanceof Error) throw entry;
      return { files: (entry ?? []).map(({ id, name, mimeType, version, size, sha256Checksum }) => ({ id, name, mimeType, version, size, sha256Checksum })) };
    } } },
    DriveApp: {
      Access: { ANYONE: "ANYONE", ANYONE_WITH_LINK: "ANYONE_WITH_LINK", PRIVATE: "PRIVATE" },
      Permission: { VIEW: "VIEW", NONE: "NONE" },
      getFileById(id: string) {
        const file = files().find(item => item.id === id);
        if (!file) throw new Error("File not found");
        return {
          getBlob: () => ({ getDataAsString: () => file.content ?? "", getBytes: () => [...(file.bytes ?? Buffer.alloc(0))] }),
          getSharingAccess: () => file.access ?? "ANYONE_WITH_LINK",
          getSharingPermission: () => "VIEW",
        };
      },
    },
    Calendar: { Events: { list: (_calendarId: string, query: Json) => options.calendar!(plain(query)) } },
    FormApp: { openById: () => options.form },
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  for (const file of readdirSync(SOURCE).filter(name => name.endsWith(".js")).sort()) {
    vm.runInContext(readFileSync(path.join(SOURCE, file), "utf8"), sandbox, { filename: file });
  }
  const call = (name: string, ...args: unknown[]) => plain((sandbox[name] as (...a: unknown[]) => unknown)(...args));
  return { call, requests, properties, logs, setReply: (next: typeof reply) => { reply = next; } };
}

// ---- Archive ----------------------------------------------------------------

const STREAM = { streamId: "finance", folderId: "folderA" };
function useArchiveSources() {
  process.env.ARCHIVE_SOURCE_CONFIG = JSON.stringify([{ ...STREAM, ministryId: "finance" }]);
}
const METADATA = `---
schemaVersion: 1
driveFileId: pdf1
title: "Laporan Tahunan: Keuangan"   # quoted because of the colon
description: >
  Ringkasan kegiatan
  dan anggaran.
category: Report
year: 2026
authors:
  - Tim Keuangan
  - 'Kementerian O''Brien'
---
Notes below the frontmatter are ignored.
`;
const metadataFile = (content = METADATA, version = "3"): DriveFile => ({ id: "meta1", name: "laporan.md", mimeType: "text/markdown", version, size: "300", content });
const pdfFile = (extra: Partial<DriveFile> = {}): DriveFile => ({ id: "pdf1", name: "Laporan.pdf", mimeType: "application/pdf", version: "5", size: "1000", sha256Checksum: "AB".repeat(32), ...extra });

test("frontmatter parser follows the backend metadata rules", () => {
  const { call } = connector();
  assert.deepEqual(call("archiveParseMetadata_", METADATA), { metadata: {
    schemaVersion: 1, driveFileId: "pdf1", title: "Laporan Tahunan: Keuangan", description: "Ringkasan kegiatan dan anggaran.",
    category: "Report", year: 2026, authors: ["Tim Keuangan", "Kementerian O'Brien"],
  } });
  assert.deepEqual(call("archiveParseMetadata_", "﻿---\r\nschemaVersion: 1\r\ndriveFileId: x_1\r\ntitle: 2026\r\nauthors: [A, \"B, C\"]\r\ndescription: |\r\n  line one\r\n  line two\r\n---\r\n"),
    { metadata: { schemaVersion: 1, driveFileId: "x_1", title: "2026", description: "line one\nline two", authors: ["A", "B, C"] } });
  const failures: [string, RegExp][] = [
    ["schemaVersion: 1\n", /start with a ---/],
    ["---\nschemaVersion: 1\n", /not closed/],
    ["---\nschemaVersion: 1\ndriveFileId: p\ntitle: T\nnotes: hi\n---", /Unknown field "notes"/],
    ["---\nschemaVersion: 1\ndriveFileId: p\n---", /"title" is required/],
    ["---\nschemaVersion: 2\ndriveFileId: p\ntitle: T\n---", /schemaVersion: 1/],
    ["---\nschemaVersion: 1\ndriveFileId: p\ntitle: T\nyear: 26\n---", /four-digit year/],
    ["---\nschemaVersion: 1\ndriveFileId: p\ntitle: T\ntitle: U\n---", /appears twice/],
    ["---\nschemaVersion: 1\ndriveFileId: bad id\ntitle: T\n---", /Drive file ID/],
    ["---\nschemaVersion: 1\ndriveFileId: p\ntitle: T\nauthors: [" + Array(31).fill("a").join(",") + "]\n---", /at most 30/],
    ["---\nschemaVersion: 1\ndriveFileId: p\ntitle: x\n  indented: no\n---", /key: value/],
  ];
  for (const [text, message] of failures) {
    const result = call("archiveParseMetadata_", text) as { error?: string };
    assert.match(result.error ?? "", message, text);
  }
});

test("archive connector sends valid observations once and reports changes, failures and missing files", () => {
  useArchiveSources();
  const folder = [metadataFile(), pdfFile()];
  const archive = connector({ properties: { KMITS_ARCHIVE_STREAMS: JSON.stringify([STREAM]) }, folders: { folderA: folder } });
  archive.call("syncArchive");
  assert.equal(archive.requests.length, 1);
  const first = archive.requests[0];
  assert.equal(first.url, "https://kmits.example/api/internal/sync/archives");
  assert.equal(first.authorization, `Bearer ${SECRET}`);
  const observation = validateObservation(first.body);
  assert.equal(observation.observation, "VALID");
  assert.equal(observation.snapshot!.metadata.title, "Laporan Tahunan: Keuangan");
  assert.equal(observation.snapshot!.pdf.sha256, "ab".repeat(32));
  assert.equal(observation.snapshot!.pdf.publicReadable, true);
  assert.equal(observation.metadataDriveVersion, "3");
  assert.equal(first.body.deliveryId, `d-${first.body.scanSequence}`);

  archive.call("syncArchive");
  assert.equal(archive.requests.length, 1, "an unchanged folder sends nothing");

  folder[0] = metadataFile(METADATA.replace("Laporan Tahunan: Keuangan", "Laporan Revisi"), "4");
  archive.setReply(() => ({ status: 503, body: { success: false, error: { code: "ARCHIVE_STORE_UNAVAILABLE" } } }));
  archive.call("syncArchive");
  archive.setReply(() => ok({ outcome: "applied" }));
  archive.call("syncArchive");
  assert.equal(archive.requests.length, 3, "a failed send is observed again on the next run");
  const [failed, retried] = archive.requests.slice(1).map(request => request.body);
  assert.equal(validateObservation(retried).snapshot!.metadata.title, "Laporan Revisi");
  assert.ok(BigInt(retried.scanSequence as string) > BigInt(failed.scanSequence as string));
  assert.ok(BigInt(failed.scanSequence as string) > BigInt(first.body.scanSequence as string));

  folder.splice(0, 1);
  archive.call("syncArchive");
  const missing = validateObservation(archive.requests[3].body);
  assert.equal(missing.observation, "MISSING"); assert.equal(missing.metadataFileId, "meta1"); assert.equal(missing.snapshot, null);
  archive.call("syncArchive");
  assert.equal(archive.requests.length, 4, "MISSING is reported once");
});

test("archive connector suppresses invalid metadata, unavailable or private PDFs, and reports scan errors", () => {
  useArchiveSources();
  const folder: DriveFile[] = [metadataFile("---\nschemaVersion: 1\ntitle: No PDF reference\n---")];
  const archive = connector({ properties: { KMITS_ARCHIVE_STREAMS: JSON.stringify([STREAM]) }, folders: { folderA: folder } });
  archive.call("syncArchive");
  const invalid = validateObservation(archive.requests[0].body);
  assert.equal(invalid.observation, "INVALID"); assert.match(invalid.diagnostics!, /driveFileId/);

  folder[0] = metadataFile(METADATA, "4");
  archive.call("syncArchive");
  assert.equal(validateObservation(archive.requests[1].body).observation, "UNAVAILABLE", "the referenced PDF is not in the folder");

  const bytes = Buffer.from("%PDF-1.7 test");
  folder.push(pdfFile({ sha256Checksum: undefined, bytes, access: "PRIVATE", version: "6" }));
  folder[0] = metadataFile(METADATA, "5");
  archive.call("syncArchive");
  const privatePdf = validateObservation(archive.requests[2].body);
  assert.equal(privatePdf.observation, "VALID");
  assert.equal(privatePdf.snapshot!.pdf.publicReadable, false);
  assert.equal(privatePdf.snapshot!.pdf.sha256, createHash("sha256").update(bytes).digest("hex"), "hashes the PDF when Drive has no checksum");

  const broken = connector({ properties: { KMITS_ARCHIVE_STREAMS: JSON.stringify([STREAM]) }, folders: { folderA: new Error("Drive quota exceeded") } });
  broken.call("syncArchive");
  const scan = validateObservation(broken.requests[0].body);
  assert.equal(scan.observation, "SYNC_ERROR"); assert.match(scan.diagnostics!, /quota/);
});

test("archive connector stops on authentication failure and validates its configuration", () => {
  useArchiveSources();
  const archive = connector({ properties: { KMITS_ARCHIVE_STREAMS: JSON.stringify([STREAM, { streamId: "policy", folderId: "folderB" }]) },
    folders: { folderA: [metadataFile(), pdfFile()], folderB: [{ ...metadataFile(), id: "meta2" }] } });
  archive.setReply(() => ({ status: 401, body: { success: false, error: { code: "UNAUTHORIZED_INTEGRATION" } } }));
  const summary = archive.call("syncArchive") as { stopped: boolean }[];
  assert.equal(archive.requests.length, 1); assert.equal(summary.length, 1); assert.equal(summary[0].stopped, true);

  for (const [properties, message] of [
    [{ KMITS_BACKEND_URL: "" }, /KMITS_BACKEND_URL/],
    [{ KMITS_BACKEND_URL: "http://localhost:3000" }, /HTTPS/],
    [{ KMITS_INGESTION_SECRET: "short" }, /KMITS_INGESTION_SECRET/],
    [{ KMITS_ARCHIVE_STREAMS: "[{\"streamId\":\"x\"}]" }, /folderId/],
    [{ KMITS_ARCHIVE_STREAMS: "{broken" }, /not valid JSON/],
  ] as const) {
    assert.throws(() => connector({ properties }).call("syncArchive"), message);
  }
});

// ---- Timeline -----------------------------------------------------------------

const CALENDAR = "kmits@group.calendar.google.com";
const timedEvent = { id: "evt1", status: "confirmed", updated: "2026-11-16T03:00:00.000Z", summary: "[Kementerian Sosial] Bakti Sosial", description: "Agenda\u0007", location: "ITS", start: { dateTime: "2026-11-20T09:00:00+07:00" }, end: { dateTime: "2026-11-20T11:00:00+07:00" } };
const allDayEvent = { id: "evt2_20261120", status: "tentative", updated: "2026-11-16T03:01:00.000Z", summary: "Libur", start: { date: "2026-11-20" }, end: { date: "2026-11-21" }, extendedProperties: { shared: { kmitsOrganization: "BEM ITS" } } };
const cancelledEvent = { id: "evt3", status: "cancelled", updated: "2026-11-16T03:02:00.000Z" };

test("timeline connector maps Calendar events, pages, stores the sync token and resends after a failure", () => {
  process.env.EVENT_CALENDAR_ID = CALENDAR;
  const listings: Json[] = [];
  let tokenExpired = false;
  const timeline = connector({ properties: { KMITS_CALENDAR_ID: CALENDAR }, calendar(query) {
    listings.push(query);
    if (query.syncToken === "expired" && tokenExpired) throw new Error("API call failed with error: Sync token is no longer valid, a full sync is required.");
    if (query.syncToken) return { timeZone: "Asia/Jakarta", items: [cancelledEvent], nextSyncToken: "token-2" };
    if (!query.pageToken) return { timeZone: "Asia/Jakarta", items: [timedEvent, allDayEvent], nextPageToken: "page-2" };
    return { timeZone: "Asia/Jakarta", items: [cancelledEvent], nextSyncToken: "token-1" };
  } });
  timeline.setReply(body => ok({ results: (body.events as Json[]).map((event, index) => ({ index, eventId: event.eventId, outcome: "applied" })) }));
  const stats = timeline.call("syncTimeline") as { done: boolean; sent: number };
  assert.equal(stats.done, true); assert.equal(stats.sent, 3);
  assert.equal(listings[0].singleEvents, true); assert.equal(listings[0].showDeleted, true); assert.ok(listings[0].timeMin);
  assert.equal(listings[1].pageToken, "page-2"); assert.equal(listings[1].timeMin, listings[0].timeMin, "page tokens repeat the same parameters");
  const batch = validateEventBatch(timeline.requests[0].body);
  const items = batch.items.map(item => { assert.ok(item.ok); return item.value; });
  assert.equal(items[0].content!.title, "Bakti Sosial");
  assert.equal(items[0].content!.organization, "Kementerian Sosial");
  assert.equal(items[0].content!.description, "Agenda");
  assert.equal(items[0].content!.startAt.toISOString(), "2026-11-20T02:00:00.000Z");
  assert.equal(items[1].status, "confirmed", "tentative events are sent as confirmed");
  assert.equal(items[1].content!.allDay, true);
  assert.equal(items[1].content!.organization, "BEM ITS");
  assert.equal(items[1].content!.startAt.toISOString(), "2026-11-19T17:00:00.000Z", "all-day events start at WIB midnight");
  assert.equal(items[1].content!.endAt.toISOString(), "2026-11-20T17:00:00.000Z", "Google's all-day end date is exclusive");
  assert.equal(validateEventBatch(timeline.requests[1].body).items[0].ok && (validateEventBatch(timeline.requests[1].body).items[0] as { value: { status: string } }).value.status, "cancelled");
  assert.equal(timeline.properties.get("state:timeline:syncToken"), "token-1");

  timeline.setReply(() => ({ status: 503 }));
  timeline.call("syncTimeline");
  assert.equal(listings.at(-1)!.syncToken, "token-1");
  assert.equal(timeline.properties.get("state:timeline:syncToken"), "token-1", "a failed batch keeps the old token");

  timeline.setReply(() => ok({ results: [] }));
  timeline.call("syncTimeline");
  assert.equal(timeline.properties.get("state:timeline:syncToken"), "token-2");

  timeline.properties.set("state:timeline:syncToken", "expired"); tokenExpired = true;
  timeline.call("syncTimeline");
  assert.ok(listings.at(-2)!.timeMin && !listings.at(-2)!.syncToken, "an expired token restarts with a full listing");
  assert.equal(timeline.properties.get("state:timeline:syncToken"), "token-1");
});
