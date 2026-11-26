const WIB = "Asia/Jakarta";

const date = new Intl.DateTimeFormat("id-ID", {
  weekday: "short",
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: WIB,
});
const time = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", timeZone: WIB });

export function formatWhen(event: { startAt: string; endAt: string; allDay: boolean }) {
  const start = new Date(event.startAt);
  const end = new Date(event.endAt);
  // An all-day event's end is exclusive.
  const last = event.allDay ? new Date(Math.max(start.getTime(), end.getTime() - 1)) : end;
  const from = date.format(start);
  const to = date.format(last);
  if (event.allDay) return from === to ? from : `${from} – ${to}`;
  return from === to
    ? `${from}, ${time.format(start)}–${time.format(end)} WIB`
    : `${from}, ${time.format(start)} – ${to}, ${time.format(end)} WIB`;
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", nbsp: " " };

// shortcut: Calendar HTML to text, link targets dropped; sanitize and render if links matter.
export function plainText(html: string) {
  return html
    .replace(/<(br|\/p|\/li|\/div)\b[^>]*>/gi, "\n")
    .replace(/<\/?[a-z][^>]*>/gi, "")
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, name) => entities[name])
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
