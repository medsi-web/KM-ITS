import { ApiError } from "./errors.ts";

// Environment-backed settings. Invalid values fail closed with 503 instead of
// silently falling back, so an operator typo never weakens a limit unnoticed.
function invalidSetting(name: string, rule: string): never {
  throw new ApiError(503, "CONFIGURATION_INVALID", `${name} must be ${rule}.`);
}

export function integerSetting(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    invalidSetting(name, `an integer from ${min} to ${max}`);
  }
  return value;
}

// A required source identifier, for example a calendar or form ID.
export function sourceIdSetting(name: string, notConfiguredCode: string, feature: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new ApiError(503, notConfiguredCode, `${feature} requires ${name}.`);
  if (value.length > 512 || /[\s\u0000-\u001f]/.test(value)) invalidSetting(name, "1-512 characters without whitespace");
  return value;
}
