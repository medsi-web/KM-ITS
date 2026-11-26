// Run: node --test frontend/src/app/timeline/_data/format.test.mjs
import assert from "node:assert/strict";
import { test } from "node:test";
import { formatWhen, plainText } from "./format.ts";

test("an all-day event does not spill into its exclusive end date", () => {
  // 20 Nov 00:00 WIB to 21 Nov 00:00 WIB.
  const one = formatWhen({ allDay: true, startAt: "2026-11-19T17:00:00Z", endAt: "2026-11-20T17:00:00Z" });
  assert.match(one, /20 Nov 2026/);
  assert.doesNotMatch(one, /21/);
  const two = formatWhen({ allDay: true, startAt: "2026-11-19T17:00:00Z", endAt: "2026-11-21T17:00:00Z" });
  assert.match(two, /20 Nov 2026 – .*21 Nov 2026/);
});

test("timed events are shown in WIB", () => {
  const when = formatWhen({ allDay: false, startAt: "2026-11-20T02:00:00Z", endAt: "2026-11-20T04:00:00Z" });
  assert.match(when, /20 Nov 2026, 09\.00–11\.00 WIB/);
});

test("Calendar HTML becomes plain text without losing literal characters", () => {
  assert.equal(plainText("<p>A &amp; B</p><b>C</b><br>1 < 2 &lt;ok&gt;"), "A & B\nC\n1 < 2 <ok>");
});
