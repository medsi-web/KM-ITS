import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { ApiError } from "./errors.ts";

// Non-secret settings come from one JSON file, `kmits.config.json` at the
// repository root (or the file named by KMITS_CONFIG_PATH). Secrets stay in the
// environment only and have no key in the file, so they cannot be committed by
// mistake. A non-empty environment variable overrides the file, which keeps
// per-host differences such as APP_ORIGIN possible without editing the file.
type Kind = "string" | "integer" | "sources";
const FILE_SETTINGS: Record<string, { path: [string, string]; kind: Kind }> = {
  APP_ORIGIN: { path: ["app", "origin"], kind: "string" },
  API_MAX_JSON_BYTES: { path: ["app", "maxJsonBytes"], kind: "integer" },
  MONGODB_DATABASE: { path: ["database", "name"], kind: "string" },
  BOOTSTRAP_SUPER_ADMIN_USERNAME: { path: ["auth", "bootstrapSuperAdminUsername"], kind: "string" },
  ARCHIVE_SOURCE_CONFIG: { path: ["archive", "sources"], kind: "sources" },
  DRIVE_SERVICE_ACCOUNT_EMAIL: { path: ["archive", "driveServiceAccountEmail"], kind: "string" },
  EVENT_CALENDAR_ID: { path: ["timeline", "calendarId"], kind: "string" },
  EVENT_SYNC_MAX_ITEMS: { path: ["timeline", "syncMaxItems"], kind: "integer" },
  EVENT_DESCRIPTION_MAX_CHARS: { path: ["timeline", "descriptionMaxChars"], kind: "integer" },
  EVENT_PAGE_DEFAULT_LIMIT: { path: ["timeline", "pageDefaultLimit"], kind: "integer" },
  EVENT_PAGE_MAX_LIMIT: { path: ["timeline", "pageMaxLimit"], kind: "integer" },
  ARTICLE_FORM_ID: { path: ["articles", "formId"], kind: "string" },
  ARTICLE_SYNC_MAX_ITEMS: { path: ["articles", "syncMaxItems"], kind: "integer" },
  ARTICLE_SUMMARY_MAX_CHARS: { path: ["articles", "summaryMaxChars"], kind: "integer" },
  ARTICLE_BODY_MAX_CHARS: { path: ["articles", "bodyMaxChars"], kind: "integer" },
  ARTICLE_PAGE_DEFAULT_LIMIT: { path: ["articles", "pageDefaultLimit"], kind: "integer" },
  ARTICLE_PAGE_MAX_LIMIT: { path: ["articles", "pageMaxLimit"], kind: "integer" },
};
export const CONFIG_FILE_NAME = "kmits.config.json";

function invalidSetting(name: string, rule: string): never {
  throw new ApiError(503, "CONFIGURATION_INVALID", `${name} must be ${rule}.`);
}

// Git-ignored copy for values that must not reach the public repository
// (for example Drive folder IDs of link-shared folders). It wins when present.
export const LOCAL_CONFIG_FILE_NAME = "kmits.config.local.json";

// Next.js runs from frontend/ and the scripts from backend/, so the file is
// looked up in the working directory and its parent.
export function configFilePath(): string | null {
  const explicit = process.env.KMITS_CONFIG_PATH?.trim();
  if (explicit) return path.resolve(explicit);
  for (const directory of [process.cwd(), path.dirname(process.cwd())]) {
    for (const name of [LOCAL_CONFIG_FILE_NAME, CONFIG_FILE_NAME]) {
      const candidate = path.join(directory, name);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function parseConfigFile(file: string): Record<string, string> {
  let parsed: unknown;
  try { parsed = JSON.parse(readFileSync(file, "utf8")); } catch { invalidSetting(CONFIG_FILE_NAME, "readable JSON"); }
  const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
  if (!isObject(parsed)) invalidSetting(CONFIG_FILE_NAME, "a JSON object");
  const known = new Set(Object.values(FILE_SETTINGS).map(({ path: [section, key] }) => `${section}.${key}`));
  const sections = new Set(Object.values(FILE_SETTINGS).map(({ path: [section] }) => section));
  const values: Record<string, string> = {};
  for (const [section, entries] of Object.entries(parsed)) {
    if (section === "$comment") continue;
    if (!sections.has(section)) invalidSetting(`${CONFIG_FILE_NAME} section "${section}"`, "a known section");
    if (!isObject(entries)) invalidSetting(`${CONFIG_FILE_NAME} section "${section}"`, "an object");
    for (const key of Object.keys(entries)) {
      // Unknown keys are refused so a secret pasted into the file fails loudly.
      if (key !== "$comment" && !known.has(`${section}.${key}`)) invalidSetting(`${CONFIG_FILE_NAME} key "${section}.${key}"`, "a known non-secret setting");
    }
  }
  for (const [name, { path: [section, key], kind }] of Object.entries(FILE_SETTINGS)) {
    const value = (parsed[section] as Record<string, unknown> | undefined)?.[key];
    if (value === undefined || value === null || value === "") continue;
    const label = `${CONFIG_FILE_NAME} "${section}.${key}"`;
    if (kind === "string") {
      if (typeof value !== "string") invalidSetting(label, "a string");
      values[name] = value;
    } else if (kind === "integer") {
      if (!Number.isSafeInteger(value)) invalidSetting(label, "an integer");
      values[name] = String(value);
    } else {
      if (!Array.isArray(value)) invalidSetting(label, "an array");
      if (value.length) values[name] = JSON.stringify(value);
    }
  }
  return values;
}

let cache: { file: string; values: Record<string, string> } | undefined;
function fileSettings(): Record<string, string> {
  const file = configFilePath();
  if (!file) return {};
  if (cache?.file !== file) cache = { file, values: parseConfigFile(file) };
  return cache.values;
}

/** Tests and long-running scripts call this after replacing the file. */
export function clearConfigCache(): void { cache = undefined; }

/** A setting from the environment, else from the config file. Blank means unset. */
export function setting(name: string): string | undefined {
  const fromEnvironment = process.env[name];
  // An empty source list in an old .env file must not mask the file's sources.
  const blank = fromEnvironment === undefined || fromEnvironment.trim() === "" ||
    (FILE_SETTINGS[name]?.kind === "sources" && fromEnvironment.trim() === "[]");
  if (!blank) return fromEnvironment;
  return Object.hasOwn(FILE_SETTINGS, name) ? fileSettings()[name] : undefined;
}

export function integerSetting(name: string, fallback: number, min: number, max: number): number {
  const raw = setting(name)?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    invalidSetting(name, `an integer from ${min} to ${max}`);
  }
  return value;
}

// A required source identifier, for example a calendar or form ID.
export function sourceIdSetting(name: string, notConfiguredCode: string, feature: string): string {
  const value = setting(name)?.trim();
  if (!value) throw new ApiError(503, notConfiguredCode, `${feature} requires ${name}.`);
  if (value.length > 512 || /[\s\u0000-\u001f]/.test(value)) invalidSetting(name, "1-512 characters without whitespace");
  return value;
}
