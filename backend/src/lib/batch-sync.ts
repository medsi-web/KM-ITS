import { FieldError } from "./fields.ts";
import { ApiError } from "./errors.ts";

// Shared protocol for connector batches (Timeline events, Article submissions):
// validate the envelope as a whole, then validate and commit items one by one.
export type ItemOutcome = "applied" | "unchanged" | "stale" | "conflict" | "invalid";
export type ParsedItem<T> = { ok: true; value: T } | { ok: false; id: string | null; reason: string };

export interface BatchSpec<T> {
  sourceKey: string;              // envelope field naming the registered source
  expectedSource: string;         // configured source ID it must equal
  itemsKey: string;               // envelope field holding the item array
  maxItems: number;
  idKey: string;                  // item field holding its source identifier
  idPattern: RegExp;              // accepted identifier shape, for invalid-item reporting
  invalid: () => never;           // throws the feature's 422 envelope error
  parseItem: (item: unknown) => T; // throws FieldError for an invalid item
}

export function parseBatch<T>(input: unknown, spec: BatchSpec<T>): ParsedItem<T>[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) spec.invalid();
  const value = input as Record<string, unknown>;
  if (Object.keys(value).some(key => !["protocolVersion", spec.sourceKey, spec.itemsKey].includes(key))) spec.invalid();
  if (value.protocolVersion !== 1 || value[spec.sourceKey] !== spec.expectedSource) spec.invalid();
  const items = value[spec.itemsKey];
  if (!Array.isArray(items) || items.length < 1 || items.length > spec.maxItems) spec.invalid();
  return items.map((item): ParsedItem<T> => {
    try {
      return { ok: true, value: spec.parseItem(item) };
    } catch (error) {
      if (!(error instanceof FieldError)) throw error;
      const raw = item && typeof item === "object" ? (item as Record<string, unknown>)[spec.idKey] : undefined;
      return { ok: false, id: typeof raw === "string" && spec.idPattern.test(raw) ? raw : null, reason: error.reason };
    }
  });
}

// The source identifier of a rejected envelope, kept only when it is bounded.
export function rejectedSourceId(input: unknown, key: string): string {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>)[key] : undefined;
  return typeof raw === "string" && raw.length <= 512 && !/\s/.test(raw) ? raw : "unknown";
}

// Per-item ordering by a source timestamp. Equal timestamps with equal content
// are retries; equal timestamps with other content mean the connector is
// inconsistent, so the stored state is kept.
export function decideBySourceTime(stored: { at: Date; fingerprint: string } | null, incoming: { at: Date; fingerprint: string }): ItemOutcome {
  if (!stored) return "applied";
  if (incoming.at.getTime() < stored.at.getTime()) return "stale";
  if (stored.fingerprint === incoming.fingerprint) return "unchanged";
  return incoming.at.getTime() === stored.at.getTime() ? "conflict" : "applied";
}

export type ItemResult = { index: number; outcome: ItemOutcome; reason?: string } & Record<string, unknown>;

// Logs invalid items and applies valid ones in order. A storage failure stops
// the batch with 503; committed items resolve as unchanged when retried.
export async function runBatch<T>(items: ParsedItem<T>[], options: {
  idKey: string;
  idOf: (value: T) => string;
  logInvalid: (id: string | null, reason: string) => Promise<unknown>;
  apply: (value: T) => Promise<ItemOutcome>;
  unavailable: () => ApiError;
}): Promise<ItemResult[]> {
  const results: ItemResult[] = [];
  for (const [index, item] of items.entries()) {
    try {
      if (!item.ok) {
        await options.logInvalid(item.id, item.reason);
        results.push({ index, [options.idKey]: item.id, outcome: "invalid", reason: item.reason });
      } else {
        results.push({ index, [options.idKey]: options.idOf(item.value), outcome: await options.apply(item.value) });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw options.unavailable();
    }
  }
  return results;
}
