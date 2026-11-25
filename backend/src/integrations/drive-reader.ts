import { createHash, createSign } from "node:crypto";
import { ApiError } from "../lib/http.ts";
import { setting } from "../lib/config.ts";

const DRIVE_API = "https://www.googleapis.com/drive/v3/files/";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const FILE_ID = /^[A-Za-z0-9_-]{1,200}$/;
const MAX_PDF_BYTES = 50 * 1024 * 1024;

export class DriveSourceMissing extends Error {
  readonly reason: string;
  constructor(reason: string) { super(reason); this.reason = reason; }
}

export interface DriveFile {
  id: string;
  mimeType: string;
  trashed?: boolean;
  parents?: string[];
  sha256Checksum?: string;
  size?: string;
}

export interface DriveReader {
  inspectPdf(fileId: string, expectedSha256: string, sourceFolderId: string): Promise<void>;
}

function unavailable(): ApiError {
  return new ApiError(503, "DRIVE_UNAVAILABLE", "The document source cannot be verified right now.");
}

// The provider accepts a fetch dependency for unit tests. The application always
// constructs this reader with the real server fetch; no test endpoint exists.
export function createDriveReader(fetcher: typeof fetch = fetch): DriveReader {
  let cachedToken: { value: string; expiresAt: number } | undefined;
  let inFlight: Promise<string> | undefined;

  function config() {
    const email = setting("DRIVE_SERVICE_ACCOUNT_EMAIL")?.trim();
    const privateKey = process.env.DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n");
    const publicApiKey = process.env.DRIVE_PUBLIC_API_KEY?.trim();
    if (!email || !privateKey || !publicApiKey) {
      throw new ApiError(503, "DRIVE_NOT_CONFIGURED", "Configure the server document reader before opening PDFs.");
    }
    return { email, privateKey, publicApiKey };
  }

  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    try {
      const options = { ...init, signal: AbortSignal.timeout(10000), redirect: "error" as const, cache: "no-store" as const };
      return await fetcher(url, options);
    } catch { throw unavailable(); }
  }

  async function accessToken(): Promise<string> {
    if (cachedToken && cachedToken.expiresAt > Date.now() + 60000) return cachedToken.value;
    if (inFlight) return inFlight;
    inFlight = (async () => {
      const { email, privateKey } = config();
      const now = Math.floor(Date.now() / 1000);
      const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const unsigned = `${encode({ alg: "RS256", typ: "JWT" })}.${encode({ iss: email, scope: READ_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 })}`;
      let signature: string;
      try { signature = createSign("RSA-SHA256").update(unsigned).sign(privateKey, "base64url"); }
      catch { throw new ApiError(503, "DRIVE_NOT_CONFIGURED", "The document reader credential is invalid."); }
      const response = await request(TOKEN_URL, {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${signature}` }),
      });
      if (!response.ok) throw unavailable();
      const body = await response.json().catch(() => { throw unavailable(); }) as { access_token?: unknown; expires_in?: unknown };
      if (typeof body.access_token !== "string" || !body.access_token || typeof body.expires_in !== "number") throw unavailable();
      cachedToken = { value: body.access_token, expiresAt: Date.now() + Math.min(body.expires_in, 3600) * 1000 };
      return cachedToken.value;
    })().finally(() => { inFlight = undefined; });
    return inFlight;
  }

  async function ensureReadable(response: Response, anonymous = false): Promise<void> {
    if (response.ok) return;
    let reasons: string[] = [];
    try {
      const body = await response.json() as { error?: { errors?: { reason?: string }[] } };
      reasons = body.error?.errors?.map((error) => error.reason ?? "") ?? [];
    } catch { /* Status still determines a conservative failure. */ }
    if (response.status === 404) throw new DriveSourceMissing("PDF_MISSING_OR_INACCESSIBLE");
    if (response.status === 403 && reasons.some((reason) => ["insufficientFilePermissions", "notFound", "fileNotDownloadable"].includes(reason))) {
      throw new DriveSourceMissing(anonymous ? "PDF_NOT_PUBLIC" : "PDF_INACCESSIBLE");
    }
    // Auth/project errors, quota limits, ambiguous 403s, and provider failures
    // must never be mistaken for a confirmed document deletion.
    throw unavailable();
  }

  async function file(fileId: string, anonymous = false): Promise<DriveFile> {
    if (!FILE_ID.test(fileId)) throw new DriveSourceMissing("INVALID_DRIVE_REFERENCE");
    const fields = anonymous ? "id,mimeType,trashed,sha256Checksum,size" : "id,mimeType,trashed,parents,sha256Checksum,size";
    const url = new URL(`${DRIVE_API}${encodeURIComponent(fileId)}`);
    url.searchParams.set("fields", fields);
    url.searchParams.set("supportsAllDrives", "true");
    if (anonymous) url.searchParams.set("key", config().publicApiKey);
    const response = await request(url.toString(), anonymous ? {} : { headers: { Authorization: `Bearer ${await accessToken()}` } });
    await ensureReadable(response, anonymous);
    const body: unknown = await response.json().catch(() => { throw unavailable(); });
    if (!body || typeof body !== "object" || Array.isArray(body)) throw unavailable();
    const data = body as DriveFile;
    if (data.id !== fileId || data.trashed || typeof data.mimeType !== "string") throw new DriveSourceMissing("DRIVE_REFERENCE_MISMATCH");
    if (data.sha256Checksum !== undefined && (typeof data.sha256Checksum !== "string" || !/^[a-fA-F0-9]{64}$/.test(data.sha256Checksum))) throw unavailable();
    if (data.parents !== undefined && (!Array.isArray(data.parents) || data.parents.some((parent) => typeof parent !== "string" || !FILE_ID.test(parent)))) throw unavailable();
    return data;
  }

  async function sourceScope(pdf: DriveFile, root: string): Promise<void> {
    if (!FILE_ID.test(root)) throw new DriveSourceMissing("INVALID_SOURCE_FOLDER");
    let parents = pdf.parents ?? [];
    const seen = new Set<string>();
    for (let depth = 0; depth < 20; depth++) {
      if (parents.includes(root)) return;
      if (parents.length !== 1 || seen.has(parents[0])) break;
      seen.add(parents[0]);
      const parent = await file(parents[0]);
      if (parent.mimeType !== "application/vnd.google-apps.folder") break;
      parents = parent.parents ?? [];
    }
    throw new DriveSourceMissing("PDF_OUTSIDE_SOURCE_SCOPE");
  }

  async function publicChecksum(fileId: string): Promise<string> {
    const url = new URL(`${DRIVE_API}${encodeURIComponent(fileId)}`);
    url.searchParams.set("alt", "media");
    url.searchParams.set("key", config().publicApiKey);
    const response = await request(url.toString());
    await ensureReadable(response, true);
    if (Number(response.headers.get("content-length")) > MAX_PDF_BYTES) {
      await response.body?.cancel();
      throw new DriveSourceMissing("PDF_TOO_LARGE");
    }
    const reader = response.body?.getReader();
    if (!reader) throw unavailable();
    const hash = createHash("sha256");
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_PDF_BYTES) { await reader.cancel(); throw new DriveSourceMissing("PDF_TOO_LARGE"); }
        hash.update(value);
      }
      return hash.digest("hex");
    } catch (error) {
      if (error instanceof DriveSourceMissing) throw error;
      throw unavailable();
    } finally { reader.releaseLock(); }
  }

  return {
    async inspectPdf(fileId, expectedSha256, sourceFolderId) {
      config();
      const pdf = await file(fileId);
      if (pdf.mimeType !== "application/pdf") throw new DriveSourceMissing("SOURCE_NOT_PDF");
      await sourceScope(pdf, sourceFolderId);
      // This request contains no user/service-account Authorization. An API key
      // identifies the Google project, not an authenticated document reader.
      const publicPdf = await file(fileId, true);
      if (publicPdf.mimeType !== "application/pdf") throw new DriveSourceMissing("SOURCE_NOT_PDF");
      const checksum = publicPdf.sha256Checksum ?? await publicChecksum(fileId);
      if (checksum.toLowerCase() !== expectedSha256.toLowerCase() ||
          (pdf.sha256Checksum && pdf.sha256Checksum.toLowerCase() !== checksum.toLowerCase())) {
        throw new DriveSourceMissing("PDF_CONTENT_MISMATCH");
      }
    },
  };
}

export const driveReader = createDriveReader();
