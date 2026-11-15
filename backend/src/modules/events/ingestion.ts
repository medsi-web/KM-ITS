import { randomUUID } from "node:crypto";
import { ApiError } from "../../lib/http.ts";
import { sourceTransaction } from "../../lib/transaction.ts";
import type { EventRecord, ItemOutcome } from "./models.ts";
import { getEventStore, type EventStore } from "./store.ts";
import { validateEventBatch, type EventItem } from "./validation.ts";

export interface EventItemResult { index: number; eventId: string | null; outcome: ItemOutcome; reason?: string }

function storeUnavailable(): ApiError {
  return new ApiError(503, "TIMELINE_STORE_UNAVAILABLE", "Transactional Timeline storage is unavailable.");
}

// Logs a request rejected before any item was processed. Only bounded
// identifiers are kept; request bodies and descriptions are never stored.
export async function logRejectedEventBatch(input: unknown, reason: string, receivedAt: Date) {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>).calendarId : undefined;
  const calendarId = typeof raw === "string" && raw.length <= 512 && !/\s/.test(raw) ? raw : "unknown";
  const store = await getEventStore();
  try {
    await store.syncLogs.insertOne({ _id: randomUUID(), calendarId, eventId: null, sourceUpdatedAt: null, status: null, receivedAt, outcome: "invalid", reason });
  } catch { throw storeUnavailable(); }
}

// Per-event ordering by the Calendar `updated` timestamp. Equal timestamps
// with equal content are retries; equal timestamps with other content mean
// the connector is inconsistent, so the stored state is kept.
function decide(current: EventRecord | null, item: EventItem): ItemOutcome {
  if (!current) return "applied";
  const incoming = item.updated.getTime(), stored = current.sourceUpdatedAt.getTime();
  if (incoming < stored) return "stale";
  if (current.fingerprint === item.fingerprint) return "unchanged";
  return incoming === stored ? "conflict" : "applied";
}

async function applyItem(store: EventStore, calendarId: string, item: EventItem, receivedAt: Date): Promise<ItemOutcome> {
  return sourceTransaction(async (session) => {
    const current = await store.events.findOne({ calendarId, eventId: item.eventId }, { session });
    const outcome = decide(current, item);
    if (outcome === "applied") {
      const next: EventRecord = {
        _id: current?._id ?? randomUUID(), calendarId, eventId: item.eventId, status: item.status,
        // A cancellation keeps the last known content for admin history.
        content: item.content ?? current?.content ?? null, fingerprint: item.fingerprint, sourceUpdatedAt: item.updated,
        manualHidden: current?.manualHidden ?? false, generation: (current?.generation ?? 0) + 1,
        lastReceivedAt: receivedAt, createdAt: current?.createdAt ?? receivedAt, updatedAt: receivedAt,
      };
      if (current) await store.events.replaceOne({ _id: current._id }, next, { session });
      else await store.events.insertOne(next, { session });
    } else if (current && outcome === "unchanged") {
      // Identical content with a newer timestamp only advances the watermark.
      const sourceUpdatedAt = item.updated > current.sourceUpdatedAt ? item.updated : current.sourceUpdatedAt;
      await store.events.updateOne({ _id: current._id }, { $set: { sourceUpdatedAt, lastReceivedAt: receivedAt } }, { session });
    }
    await store.syncLogs.insertOne({ _id: randomUUID(), calendarId, eventId: item.eventId, sourceUpdatedAt: item.updated, status: item.status, receivedAt, outcome }, { session });
    return outcome;
  });
}

export async function ingestEvents(input: unknown, receivedAt = new Date()) {
  let batch;
  try { batch = validateEventBatch(input); }
  catch (error) {
    if (error instanceof ApiError && error.status === 422) await logRejectedEventBatch(input, error.code, receivedAt);
    throw error;
  }
  const store = await getEventStore();
  const results: EventItemResult[] = [];
  for (const [index, item] of batch.items.entries()) {
    try {
      if (!item.ok) {
        await store.syncLogs.insertOne({ _id: randomUUID(), calendarId: batch.calendarId, eventId: item.eventId, sourceUpdatedAt: null, status: null, receivedAt, outcome: "invalid", reason: item.reason });
        results.push({ index, eventId: item.eventId, outcome: "invalid", reason: item.reason });
      } else {
        results.push({ index, eventId: item.value.eventId, outcome: await applyItem(store, batch.calendarId, item.value, receivedAt) });
      }
    } catch (error) {
      if (error instanceof ApiError) throw error;
      // Earlier items stay committed; a retried batch resolves them as unchanged.
      throw storeUnavailable();
    }
  }
  return { receivedAt: receivedAt.toISOString(), results };
}
