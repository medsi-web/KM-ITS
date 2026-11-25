import Image from "next/image";
import type { KnowledgeDocument } from "../_data/groups";

/** One document. The whole row opens the verified PDF on Drive in a new tab. */
export default function DocumentRow({
  doc,
  first,
  index = 0,
}: {
  doc: KnowledgeDocument;
  first?: boolean;
  index?: number;
}) {
  return (
    <li
      className="kn-rise"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <a
        href={doc.openUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={`group flex items-center justify-between gap-4 rounded-lg px-[10px] pb-[14px] outline-none transition-[background-color,transform] duration-200 hover:translate-x-1 hover:bg-[#f5f8fc] focus-visible:bg-[#f5f8fc] focus-visible:ring-2 focus-visible:ring-sky motion-reduce:transition-none motion-reduce:hover:translate-x-0 ${
          first ? "pt-[14px]" : "border-t border-[#e5e5e5] pt-[15px]"
        }`}
      >
        <div className="flex min-w-0 items-center">
          <span className="flex size-8 shrink-0 items-center justify-center">
            <Image src="/knowledge/doc-pdf.svg" alt="" width={12} height={15} />
          </span>
          <div className="min-w-0 pl-3">
            <p className="break-words text-[13px] font-semibold leading-[19.7px] text-[#171717] group-hover:text-navy sm:truncate">
              {doc.name}
            </p>
            <p className="break-words text-[11px] leading-[16.7px] text-[#737373] sm:truncate">
              {doc.meta}
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded bg-[#e5e5e5] px-2 py-[2px] text-[10px] font-bold leading-[15px] text-[#525252]">
          PDF
        </span>
      </a>
    </li>
  );
}
