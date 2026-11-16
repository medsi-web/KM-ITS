import { randomUUID } from "node:crypto";
import { decideBySourceTime, rejectedSourceId, runBatch, type ItemOutcome } from "../../lib/batch-sync.ts";
import { ApiError } from "../../lib/http.ts";
import { sourceTransaction } from "../../lib/transaction.ts";
import type { EventRecord } from "./models.ts";
import { getEventStore, type EventStore } from "./store.ts";
import { validateEventBatch, type EventItem } from "./validation.ts";

function storeUnavailable(): ApiError {
  return new ApiError(503, "TIMELINE_STORE_UNAVAILABLE", "Transactional Timeline storage is unavailable.");
}

// Logs a request rejected before any item was processed. Only bounded
// identifiers are kept; request bodies and descriptions are never stored.
export async function logRejectedEventBatch(input: unknown, reason: string, receivedAt: Date) {
  const store = await getEventStore();
  try {
    await store.syncLogs.insertOne({
      _id: randomUUID(), calendarId: rejectedSourceId(input, "calendarId"), eventId: null,
      sourceUpdatedAt: null, status: null, receivedAt, outcome: "invalid", reason,
    });
  } catch { throw storeUnavailable(); }
}

function nextRecord(current: EventRecord | null, calendarId: string, item: EventItem, receivedAt: Date): EventRecord {
  return {
    _id: current?._id ?? randomUUID(), calendarId, eventId: item.eventId, status: item.status,
    // A cancellation keeps the last known content for admin history.
    content: item.content ?? current?.content ?? null,
    fingerprint: item.fingerprint, sourceUpdatedAt: item.updated,
    manualHidden: current?.manualHidden ?? false, generation: (current?.generation ?? 0) + 1,
    lastReceivedAt: receivedAt, createdAt: current?.createdAt ?? receivedAt, updatedAt: receivedAt,
  };
}

async function applyItem(store: EventStore, calendarId: string, item: EventItem, receivedAt: Date): Promise<ItemOutcome> {
  return sourceTransaction(async (session) => {
    const current = await store.events.findOne({ calendarId, eventId: item.eventId }, { session });
    const stored = current && { at: current.sourceUpdatedAt, fingerprint: current.fingerprint };
    const outcome = decideBySourceTime(stored, { at: item.updated, fingerprint: item.fingerprint });
    if (outcome === "applied") {
      const next = nextRecord(current, calendarId, item, receivedAt);
      if (current) await store.events.replaceOne({ _id: current._id }, next, { session });
      else await store.events.insertOne(next, { session });
    } else if (current && outcome === "unchanged") {
      // Identical content with a newer timestamp only advances the watermark.
      const sourceUpdatedAt = item.updated > current.sourceUpdatedAt ? item.updated : current.sourceUpdatedAt;
      await store.events.updateOne({ _id: current._id }, { $set: { sourceUpdatedAt, lastReceivedAt: receivedAt } }, { session });
    }
    await store.syncLogs.insertOne({
      _id: randomUUID(), calendarId, eventId: item.eventId, sourceUpdatedAt: item.updated, status: item.status, receivedAt, outcome,
    }, { session });
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
  const { calendarId } = batch;
  const results = await runBatch(batch.items, {
    idKey: "eventId",
    idOf: item => item.eventId,
    logInvalid: (eventId, reason) => store.syncLogs.insertOne({
      _id: randomUUID(), calendarId, eventId, sourceUpdatedAt: null, status: null, receivedAt, outcome: "invalid", reason,
    }),
    apply: item => applyItem(store, calendarId, item, receivedAt),
    unavailable: storeUnavailable,
  });
  return { receivedAt: receivedAt.toISOString(), results };
}
