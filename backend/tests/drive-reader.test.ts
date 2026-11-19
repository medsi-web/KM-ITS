import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { createHash, generateKeyPairSync } from "node:crypto";
import { ApiError } from "../src/lib/http.ts";
import { createDriveReader, DriveSourceMissing } from "../src/integrations/drive-reader.ts";

const original = { ...process.env };
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
const checksum = "a".repeat(64);
afterEach(() => { process.env = { ...original }; });

function configured() {
  process.env.DRIVE_SERVICE_ACCOUNT_EMAIL = "reader@example.iam.gserviceaccount.com";
  process.env.DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY = privateKey;
  process.env.DRIVE_PUBLIC_API_KEY = "test-project-key";
}

function provider(change?: (url: URL, init: RequestInit) => Response | undefined) {
  const requests: { url: URL; headers: Headers }[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    requests.push({ url, headers: new Headers(init.headers) });
    const altered = change?.(url, init);
    if (altered) return altered;
    if (url.hostname === "oauth2.googleapis.com") return Response.json({ access_token: "reader-token", expires_in: 3600 });
    const id = url.pathname.split("/").at(-1);
    return Response.json(id === "nested" ? { id, mimeType: "application/vnd.google-apps.folder", parents: ["source-root"] } : {
      id, mimeType: "application/pdf", parents: ["nested"], sha256Checksum: checksum, trashed: false,
    });
  };
  return { reader: createDriveReader(fetcher), requests };
}

test("Drive reader checks folder ancestry and current public checksum without sending reader credentials to the public check", async () => {
  configured();
  const { reader, requests } = provider();
  await reader.inspectPdf("pdf-id", checksum, "source-root");
  const anonymous = requests.find(({ url }) => url.searchParams.has("key"));
  assert.ok(anonymous);
  assert.equal(anonymous.headers.has("authorization"), false);
  assert.equal(anonymous.url.searchParams.get("key"), "test-project-key");
  assert.ok(requests.some(({ url, headers }) => url.pathname.endsWith("/nested") && headers.get("authorization") === "Bearer reader-token"));
});

test("missing Drive configuration returns 503 before network access", async () => {
  delete process.env.DRIVE_SERVICE_ACCOUNT_EMAIL;
  const { reader, requests } = provider();
  await assert.rejects(reader.inspectPdf("pdf-id", checksum, "source-root"), (error: unknown) => error instanceof ApiError && error.status === 503 && error.code === "DRIVE_NOT_CONFIGURED");
  assert.equal(requests.length, 0);
});

test("public access denial, wrong content, wrong file identity, and out-of-scope sources are file failures", async () => {
  configured();
  for (const mode of ["missing", "private", "checksum", "wrong-id", "wrong-type", "trashed", "scope"]) {
    const { reader } = provider((url) => {
      if (url.hostname === "oauth2.googleapis.com") return undefined;
      if (mode === "missing") return Response.json({}, { status: 404 });
      if (mode === "private" && url.searchParams.has("key")) return Response.json({}, { status: 404 });
      if (url.pathname.endsWith("/pdf-id")) return Response.json({
        id: mode === "wrong-id" ? "different" : "pdf-id", mimeType: mode === "wrong-type" ? "text/plain" : "application/pdf",
        parents: ["nested"], sha256Checksum: mode === "checksum" ? "b".repeat(64) : checksum, trashed: mode === "trashed",
      });
      return undefined;
    });
    await assert.rejects(reader.inspectPdf("pdf-id", checksum, mode === "scope" ? "different-root" : "source-root"), DriveSourceMissing, mode);
  }
});

test("Drive outages, rate limits, invalid reader auth, and ambiguous forbidden responses stay temporary 503 errors", async () => {
  configured();
  for (const status of [401, 403, 429, 500, 503]) {
    const { reader } = provider((url) => url.hostname === "www.googleapis.com" ? Response.json({ error: { errors: [{ reason: status === 403 ? "rateLimitExceeded" : "backendError" }] } }, { status }) : undefined);
    await assert.rejects(reader.inspectPdf("pdf-id", checksum, "source-root"), (error: unknown) => error instanceof ApiError && error.status === 503, String(status));
  }
  const failing = createDriveReader(async () => { throw new Error("network failure with private credential details"); });
  await assert.rejects(failing.inspectPdf("pdf-id", checksum, "source-root"), (error: unknown) => error instanceof ApiError && !error.message.includes("private credential"));
});

test("PDF without a provider checksum is anonymously streamed and hashed", async () => {
  configured();
  const bytes = Buffer.from("%PDF-test-content");
  const expected = createHash("sha256").update(bytes).digest("hex");
  const { reader, requests } = provider((url) => {
    if (url.hostname !== "www.googleapis.com") return undefined;
    if (url.searchParams.get("alt") === "media") return new Response(bytes);
    if (url.pathname.endsWith("/pdf-id")) return Response.json({ id: "pdf-id", mimeType: "application/pdf", parents: ["source-root"] });
    return undefined;
  });
  await reader.inspectPdf("pdf-id", expected, "source-root");
  const download = requests.find(({ url }) => url.searchParams.get("alt") === "media");
  assert.ok(download);
  assert.equal(download.headers.has("authorization"), false);
});

test("concurrent source checks reuse one short-lived service-account token", async () => {
  configured();
  const { reader, requests } = provider();
  await Promise.all([reader.inspectPdf("pdf-id", checksum, "source-root"), reader.inspectPdf("pdf-id", checksum, "source-root")]);
  assert.equal(requests.filter(({ url }) => url.hostname === "oauth2.googleapis.com").length, 1);
});
