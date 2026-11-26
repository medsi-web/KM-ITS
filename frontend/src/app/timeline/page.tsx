import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import EmptyState from "../_components/EmptyState";
import { getEvents } from "./_data/events";
import { formatWhen, plainText } from "./_data/format";

export const metadata: Metadata = {
  title: "KM ITS Timeline | Portal KM ITS",
  description: "Agenda dan kegiatan KM ITS dari kalender bersama.",
};

const gutter = "px-5 md:px-[5.7%]";

const sections = [
  { status: "ONGOING", heading: "Sedang berlangsung" },
  { status: "UPCOMING", heading: "Akan datang" },
  { status: "FINISHED", heading: "Selesai" },
] as const;

export default function TimelinePage() {
  return (
    <>
      <header className={`${gutter} pt-4`}>
        <h1 className="text-4xl font-semibold leading-[normal] text-navy md:text-[48.5px]">
          KM ITS Timeline
        </h1>
        <p className="mt-[15px] max-w-[585px] text-base leading-[normal] text-[#5b6270] md:text-[19.2px]">
          Agenda dan kegiatan KM ITS dari kalender bersama.
        </p>
      </header>
      <Suspense fallback={<div className="h-96" />}>
        <Agenda />
      </Suspense>
    </>
  );
}

async function Agenda() {
  // Event status changes over time, so render per request.
  await connection();
  const events = await getEvents().catch(() => null);
  if (!events) {
    return (
      <EmptyState
        className="mt-[79px]"
        icon="/knowledge/empty-book.svg"
        title="Agenda belum dapat dimuat"
        description="Terjadi gangguan saat mengambil agenda KM ITS. Coba muat ulang halaman beberapa saat lagi."
        actionHref="/timeline"
        actionLabel="Muat ulang"
      />
    );
  }
  if (events.length === 0) {
    return (
      <EmptyState
        className="mt-[79px]"
        icon="/knowledge/empty-book.svg"
        title="Belum ada agenda"
        description="Kegiatan akan muncul di sini setelah ditambahkan ke kalender KM ITS."
      />
    );
  }

  return (
    <div className={`${gutter} mt-10 flex max-w-[960px] flex-col gap-10`}>
      {sections.map(({ status, heading }) => {
        const items = events.filter((e) => e.status === status);
        // Newest finished first; the API lists oldest first.
        if (status === "FINISHED") items.reverse();
        if (items.length === 0) return null;
        return (
          <section key={status} aria-labelledby={status}>
            <h2 id={status} className="text-xl font-semibold text-[#1e2229]">
              {heading}
            </h2>
            <ul className="mt-4 flex flex-col gap-4">
              {items.map((event, i) => (
                <li
                  key={event.id}
                  className="kn-rise rounded-2xl border border-[#e5e5e5] bg-white p-5 shadow-[0_6px_27px_rgba(18,123,190,0.12)]"
                  style={{ animationDelay: `${Math.min(i, 8) * 60}ms` }}
                >
                  <p className="text-[13px] font-semibold text-azure">{formatWhen(event)}</p>
                  <h3 className="mt-1 break-words text-lg font-semibold text-navy">{event.title}</h3>
                  {(event.organization || event.location) && (
                    <p className="mt-1 break-words text-[13px] text-[#737373]">
                      {[event.organization, event.location].filter(Boolean).join(" • ")}
                    </p>
                  )}
                  {event.description && (
                    <p className="mt-2 line-clamp-4 whitespace-pre-line break-words text-sm text-[#525252]">
                      {plainText(event.description)}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
