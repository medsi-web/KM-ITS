// Shared Timeline fixtures. Kept outside *.test.ts so importing them does not
// register unit-test hooks inside integration suites.
export const CALENDAR = "km-its@group.calendar.google.com";

export function calendarEvent(eventId = "event1", updated = "2026-11-16T00:00:00.000Z", overrides: Record<string, unknown> = {}) {
  return { eventId, updated, status: "confirmed", title: "Ministry meeting", description: "Agenda", location: "ITS", organization: "Ministry",
    allDay: false, startAt: "2099-01-01T02:00:00.000Z", endAt: "2099-01-01T04:00:00.000Z", ...overrides };
}

export function batch(...events: unknown[]) { return { protocolVersion: 1, calendarId: CALENDAR, events }; }
