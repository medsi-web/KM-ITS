import type { ItemOutcome } from "../../lib/batch-sync.ts";

export type { ItemOutcome };
export type EventStatus = "confirmed" | "cancelled";
export type TimeStatus = "UPCOMING" | "ONGOING" | "FINISHED";

export interface EventContent {
  title: string; description: string; location: string; organization: string;
  allDay: boolean; startAt: Date; endAt: Date;
}
export interface EventRecord {
  _id: string; calendarId: string; eventId: string; status: EventStatus;
  // Null only for a cancellation received before any confirmed copy.
  content: EventContent | null; fingerprint: string; sourceUpdatedAt: Date;
  manualHidden: boolean; generation: number; lastReceivedAt: Date; createdAt: Date; updatedAt: Date;
}
export interface EventSyncLog {
  _id: string; calendarId: string; eventId: string | null; sourceUpdatedAt: Date | null;
  status: EventStatus | null; receivedAt: Date; outcome: ItemOutcome; reason?: string;
}

export function isEventVisible(record: EventRecord): boolean {
  return record.status === "confirmed" && !!record.content && !record.manualHidden;
}

export function timeStatus(content: EventContent, now = new Date()): TimeStatus {
  if (now < content.startAt) return "UPCOMING";
  return now < content.endAt ? "ONGOING" : "FINISHED";
}
