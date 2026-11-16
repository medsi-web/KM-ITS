// Field validators for connector batches. A failure names the field so the
// item can be logged as invalid with a precise reason, without echoing values.
export class FieldError extends Error {
  readonly reason: string;
  constructor(field: string) {
    super(field);
    this.reason = `INVALID_${field.replace(/[^A-Za-z0-9]+/g, "_").replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
  }
}

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/;
const INSTANT = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?(?:Z|[+-]\d\d:\d\d)$/;

export function record(value: unknown, keys: readonly string[], field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.includes(key))) throw new FieldError(field);
  return value as Record<string, unknown>;
}

// Trimmed text. Optional fields pass `fallback`; required fields need 1+ characters.
export function text(value: unknown, max: number, field: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== "string" || value.length > max || CONTROL.test(value)) throw new FieldError(field);
  const result = value.trim();
  if (fallback === undefined && !result) throw new FieldError(field);
  return result;
}

export function identifier(value: unknown, max: number, field: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > max || !/^[A-Za-z0-9_-]+$/.test(value)) throw new FieldError(field);
  return value;
}

export function instant(value: unknown, field: string): Date {
  if (typeof value !== "string" || !INSTANT.test(value) || !Number.isFinite(Date.parse(value))) throw new FieldError(field);
  return new Date(value);
}

export function textList(value: unknown, maxItems: number, maxLength: number, field: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) throw new FieldError(field);
  return value.map(item => text(item, maxLength, field));
}

export function isInstant(value: string): boolean {
  return INSTANT.test(value) && Number.isFinite(Date.parse(value));
}
