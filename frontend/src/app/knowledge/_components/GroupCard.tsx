import Image from "next/image";
import Link from "next/link";
import { formatShortDate, type KnowledgeGroup } from "../_data/groups";

/**
 * One knowledge group. The title link is stretched over the whole card, so a
 * click anywhere (icon, text, empty space) opens the group. The hover lift
 * runs on the article while the static wrapper owns the hover state, so the
 * pointer never flickers at the card edge.
 */
export default function GroupCard({ group }: { group: KnowledgeGroup }) {
  return (
    <div className="group h-full">
    <article className="relative flex h-full min-h-[265px] flex-col rounded-2xl border border-[#e5e5e5] bg-white p-[21px] shadow-[0_6px_27px_rgba(18,123,190,0.18)] transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-1.5 group-hover:scale-[1.03] group-hover:shadow-[0_16px_34px_rgba(18,123,190,0.22),inset_0_0_0_1px_#e5e7eb] focus-within:-translate-y-1.5 focus-within:scale-[1.03] focus-within:shadow-[0_16px_34px_rgba(18,123,190,0.22),inset_0_0_0_1px_#e5e7eb] motion-reduce:transition-none motion-reduce:transform-none">
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
          {group.description}
        </p>
      </div>

      <div className="mt-auto flex flex-col gap-[10px] border-t border-[#f5f5f5] pt-[13px]">
        <span className="flex items-center gap-1 text-[11px] text-[#737373] group-hover:text-[#525252]">
          <Image src="/knowledge/clock.svg" alt="" width={12} height={12} />
          <span className="pl-[0.5px]">
            Diperbarui {formatShortDate(group.lastDocumentAt ?? group.updatedAt)}
          </span>
        </span>
        <div className="flex items-center justify-between pt-1">
          <span className="flex items-center gap-[4px] text-xs font-semibold text-[#1e2229] group-hover:underline">
            Lihat group
            <Image
              src="/knowledge/arrow.svg"
              alt=""
              width={7}
              height={3}
              className="transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transform-none"
            />
          </span>
        </div>
      </div>
    </article>
    </div>
  );
}
