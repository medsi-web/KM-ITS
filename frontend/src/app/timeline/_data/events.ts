import { eventsList } from "@kmits/backend";

/** One item of `GET /api/events` (see `publicEvent` in the backend). */
export type PublicEvent = {
  id: string;
  title: string;
  /** May contain Calendar HTML. */
  description: string;
  location: string;
  organization: string;
  allDay: boolean;
  startAt: string;
  endAt: string;
  status: "UPCOMING" | "ONGOING" | "FINISHED";
};

export async function getEvents() {
  const events: PublicEvent[] = [];
  // shortcut: loads all history (offset caps at 10000); pass `from=` when it grows.
  for (;;) {
    const response = await eventsList(
      new Request(`http://localhost/api/events?offset=${events.length}`),
    );
    const body = await response.json();
    if (!response.ok) throw new Error(body?.error?.code ?? `events ${response.status}`);
    events.push(...body.data.items);
    if (events.length >= body.data.total || body.data.items.length === 0) break;
  }
  return events;
}
