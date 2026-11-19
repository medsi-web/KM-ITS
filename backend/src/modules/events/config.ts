import { integerSetting, sourceIdSetting } from "../../lib/config.ts";

// Every Timeline limit is configurable through the environment; see docs/timeline.md.
export function timelineSettings() {
  return {
    calendarId: sourceIdSetting("EVENT_CALENDAR_ID", "TIMELINE_NOT_CONFIGURED", "Timeline"),
    syncMaxItems: integerSetting("EVENT_SYNC_MAX_ITEMS", 50, 1, 500),
    descriptionMaxChars: integerSetting("EVENT_DESCRIPTION_MAX_CHARS", 8000, 1, 100000),
    pageDefaultLimit: integerSetting("EVENT_PAGE_DEFAULT_LIMIT", 50, 1, 1000),
    pageMaxLimit: integerSetting("EVENT_PAGE_MAX_LIMIT", 200, 1, 1000),
  };
}
