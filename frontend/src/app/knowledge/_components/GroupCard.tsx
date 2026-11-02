import Image from "next/image";
import Link from "next/link";
import { formatShortDate, type KnowledgeGroup } from "../_data/groups";

/**
 * One knowledge group. The title link is stretched over the whole card, so a
 * click anywhere (icon, text, empty space) opens the group; "Buka Drive" is
 * lifted above it as its own link.
 */
export default function GroupCard({ group }: { group: KnowledgeGroup }) {
  return (
    <article className="group relative flex min-h-[265px] flex-col rounded-2xl border border-[#e5e5e5] bg-white p-[21px] shadow-[0_6px_27px_rgba(18,123,190,0.18)] transition-shadow duration-200 hover:shadow-[0_10px_28px_rgba(18,123,190,0.12),inset_0_0_0_1px_#e5e7eb] focus-within:shadow-[0_10px_28px_rgba(18,123,190,0.12),inset_0_0_0_1px_#e5e7eb]">
      <div className="pb-4">
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-[3px] pl-1">
            <Image
              src="/knowledge/drive-1.svg"
              alt=""
              width={21}
              height={20}
              className="mt-[-2px]"
            />
            <span className="text-[11px] font-semibold tracking-[-0.27px] text-[#1e2229]">
              Google Drive
            </span>
          </span>
          <span className="text-base text-[#737373] group-hover:font-semibold group-hover:text-[#1e2229]">
            {group.documentCount} Dok
          </span>
        </div>

        <h3 className="mt-2 pt-[6px] text-base font-semibold leading-[22px] tracking-[-0.4px] text-[#1e2229]">
          <Link
            href={`/knowledge/${group.slug}`}
            className="outline-none after:absolute after:inset-0 after:rounded-2xl"
          >
            {group.name}
          </Link>
        </h3>
        <p className="mt-2 line-clamp-2 text-base leading-[26px] text-[#525252]">
          {group.summary}
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-[10px] border-t border-[#f5f5f5] pt-[13px]">
        <span className="flex items-center gap-1 text-[11px] text-[#737373] group-hover:text-[#525252]">
          <Image src="/knowledge/clock.svg" alt="" width={12} height={12} />
          <span className="pl-[0.5px]">
            Diperbarui {formatShortDate(group.updatedAt)}
          </span>
        </span>
        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-[4px] text-xs font-semibold text-[#1e2229] group-hover:underline">
            Lihat group
            <Image src="/knowledge/arrow.svg" alt="" width={7} height={3} />
          </span>
          <a
            href={group.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="relative z-10 flex items-center gap-[2px] text-[11px] text-[#525252] group-hover:font-semibold group-hover:text-[#1e2229]"
          >
            Buka Drive
            <Image
              src="/knowledge/external.svg"
              alt=""
              width={12}
              height={12}
              className="group-hover:hidden"
            />
            <Image
              src="/knowledge/external-hover.svg"
              alt=""
              width={12}
              height={12}
              className="hidden group-hover:block"
            />
          </a>
        </div>
      </div>
    </article>
  );
}
