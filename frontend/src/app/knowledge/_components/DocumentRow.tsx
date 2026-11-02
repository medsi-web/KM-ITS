import Image from "next/image";
import type { KnowledgeDocument } from "../_data/groups";

export default function DocumentRow({
  doc,
  first,
}: {
  doc: KnowledgeDocument;
  first?: boolean;
}) {
  const isPdf = doc.type === "PDF";

  return (
    <li
      className={`flex items-center justify-between gap-4 rounded-lg px-[10px] pb-[14px] ${
        first ? "pt-[14px]" : "border-t border-[#e5e5e5] pt-[15px]"
      }`}
    >
      <div className="flex min-w-0 items-center">
        <span className="flex size-8 shrink-0 items-center justify-center">
          <Image
            src={isPdf ? "/knowledge/doc-pdf.svg" : "/knowledge/doc-docx.svg"}
            alt=""
            width={isPdf ? 12 : 14}
            height={isPdf ? 15 : 14}
          />
        </span>
        <div className="min-w-0 pl-3">
          <p className="break-words text-[13px] font-semibold leading-[19.7px] text-[#171717] sm:truncate">
            {doc.name}
          </p>
          <p className="break-words text-[11px] leading-[16.7px] text-[#737373] sm:truncate">
            {doc.meta}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center">
        <span
          className={`rounded px-2 py-[2px] text-[10px] font-bold leading-[15px] ${
            isPdf ? "bg-[#e5e5e5] text-[#525252]" : "text-[#1e2229]"
          }`}
        >
          {doc.type}
        </span>
        <span className="min-w-[58px] pl-2 text-right text-xs leading-[18px] text-[#737373]">
          {doc.size}
        </span>
      </div>
    </li>
  );
}
