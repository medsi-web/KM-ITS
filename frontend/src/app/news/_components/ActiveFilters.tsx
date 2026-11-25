import Image from "next/image";
import Link from "next/link";
import { newsHref } from "../_data/articles";

/**
 * Result summary under the search box: how many articles matched, one
 * removable chip per active filter, and a link that clears all of them.
 */
export default function ActiveFilters({
  query,
  category,
  count,
}: {
  query: string;
  category?: string;
  count: number;
}) {
  const categoryName = category;

  return (
    <div className="mt-[21px] flex flex-col items-end gap-[9px] text-[12px] text-[#1e2229]">
      <div className="flex flex-wrap items-center justify-end gap-x-[9px] gap-y-2">
        <p>
          {count} berita
          {query && (
            <>
              {" "}
              untuk <strong>“{query}”</strong>
            </>
          )}
          {categoryName && (
            <>
              {" "}
              di <strong>{categoryName}</strong>
            </>
          )}
        </p>
        {categoryName && (
          <FilterChip
            label={categoryName}
            removeLabel={`Hapus filter kategori ${categoryName}`}
            href={newsHref({ q: query })}
          />
        )}
        {query && (
          <FilterChip
            label={`“${query}”`}
            removeLabel={`Hapus pencarian “${query}”`}
            href={newsHref({ kategori: category })}
          />
        )}
      </div>
      <Link href="/news" className="text-[10.8px] font-bold text-navy underline">
        Hapus semua filter
      </Link>
    </div>
  );
}

function FilterChip({
  label,
  removeLabel,
  href,
}: {
  label: string;
  removeLabel: string;
  href: string;
}) {
  return (
    <span className="inline-flex h-6 items-center gap-[7px] rounded-full border border-line bg-white pl-3 pr-[10px] text-[9.7px] leading-none">
      {label}
      <Link href={href} aria-label={removeLabel} className="flex">
        <Image src="/news/chip-close.svg" alt="" width={7} height={7} />
      </Link>
    </span>
  );
}
