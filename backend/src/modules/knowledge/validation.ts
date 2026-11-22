import { ApiError } from "../../lib/http.ts";
import { archiveSources } from "../archives/sources.ts";
import type { KnowledgeGroup } from "./store.ts";

export type GroupFields = Pick<KnowledgeGroup, "slug" | "ministryId" | "name" | "title" | "description" | "driveUrl" | "order" | "hidden">;
const FIELDS = ["slug", "ministryId", "name", "title", "description", "driveUrl", "order", "hidden"] as const;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function invalid(field: string, rule: string): never {
  throw new ApiError(400, "INVALID_KNOWLEDGE_GROUP", `${field} ${rule}.`);
}

function text(value: unknown, field: string, max: number, required: boolean): string {
  if (typeof value !== "string" || value.length > max || CONTROL.test(value)) invalid(field, `must be text of at most ${max} characters`);
  const result = value.trim();
  if (required && !result) invalid(field, "is required");
  return result;
}

/** A URL slug from a name: "Kastrat & Kebijakan" -> "kastrat-kebijakan". */
export function slugify(name: string): string {
  return name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

// Only Google Drive or Docs links over HTTPS, without credentials.
function driveUrl(value: unknown): string {
  const raw = text(value, "driveUrl", 500, true);
  let url: URL;
  try { url = new URL(raw); } catch { invalid("driveUrl", "must be a URL"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port || !["drive.google.com", "docs.google.com"].includes(url.hostname)) {
    invalid("driveUrl", "must be an https://drive.google.com or https://docs.google.com link");
  }
  // The stored form is percent-encoded, so the limit applies after normalizing.
  const normalized = url.toString();
  if (normalized.length > 500) invalid("driveUrl", "must be at most 500 characters once encoded");
  return normalized;
}

function ministry(value: unknown): string {
  if (typeof value !== "string" || !archiveSources().some(source => source.ministryId === value)) {
    invalid("ministryId", "must be a ministryId registered in archive.sources");
  }
  return value;
}

function field(key: (typeof FIELDS)[number], value: unknown): GroupFields[typeof key] {
  switch (key) {
    case "slug": {
      const slug = text(value, "slug", 80, true);
      if (!SLUG.test(slug)) invalid("slug", "must use lowercase letters, digits and single hyphens");
      return slug;
    }
    case "ministryId": return ministry(value);
    case "name": return text(value, "name", 120, true);
    case "title": return text(value, "title", 200, false);
    case "description": return text(value, "description", 2000, true);
    case "driveUrl": return driveUrl(value);
    case "order":
      if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 10000) invalid("order", "must be an integer from 0 to 10000");
      return value as number;
    case "hidden":
      if (typeof value !== "boolean") invalid("hidden", "must be true or false");
      return value;
  }
}

function rejectUnknown(body: Record<string, unknown>, allowed: readonly string[]) {
  const unknown = Object.keys(body).filter(key => !allowed.includes(key));
  if (unknown.length) invalid(`Unknown field ${unknown[0]};`, `allowed: ${allowed.join(", ")}`);
}

export function parseCreate(body: Record<string, unknown>): GroupFields {
  rejectUnknown(body, FIELDS);
  const name = field("name", body.name) as string;
  const slug = body.slug === undefined ? slugify(name) : field("slug", body.slug) as string;
  if (!slug) invalid("slug", "is required when the name has no letters or digits");
  return {
    slug, name,
    ministryId: field("ministryId", body.ministryId) as string,
    title: body.title === undefined ? "" : field("title", body.title) as string,
    description: field("description", body.description) as string,
    driveUrl: field("driveUrl", body.driveUrl) as string,
    order: body.order === undefined ? 0 : field("order", body.order) as number,
    hidden: body.hidden === undefined ? false : field("hidden", body.hidden) as boolean,
  };
}

// PATCH carries the revision the admin edited plus any changed fields.
export function parseUpdate(body: Record<string, unknown>): { revision: number; changes: Partial<GroupFields> } {
  rejectUnknown(body, ["revision", ...FIELDS]);
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1) invalid("revision", "must be the group's current revision");
  const changes: Partial<GroupFields> = {};
  for (const key of FIELDS) if (body[key] !== undefined) Object.assign(changes, { [key]: field(key, body[key]) });
  if (!Object.keys(changes).length) invalid("Body", "must change at least one field");
  return { revision: body.revision as number, changes };
}
