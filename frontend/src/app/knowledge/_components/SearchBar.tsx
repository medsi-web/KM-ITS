import Image from "next/image";
import Link from "next/link";
import type { SortValue } from "../_data/groups";
import SortSelect from "./SortSelect";

/**
 * Search form for the group list. It is a plain GET form (`?q=…&sort=…`), so it
 * works without client-side JavaScript. `resultCount` is shown under the box.
 */
export default function SearchBar({
  query,
  sort,
  resultCount,
  total,
}: {
  query: string;
  sort: SortValue;
  resultCount: number;
  total: number;
}) {
  const searching = query.length > 0;
  const hasMeta = searching ? resultCount > 0 : total > 0;

  return (
    <form action="/knowledge" role="search" className="w-full max-w-[586px]">
      <div
        className={`flex h-11 items-center rounded-[5px] border bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(0,98,255,0.18)] ${
          searching ? "border-navy" : "border-[#c4c9d1]"
        }`}
      >
        <Image
          src="/knowledge/search-icon.svg"
          alt=""
          width={15}
          height={15}
          className="ml-4 shrink-0"
        />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cari nama atau topik group"
          aria-label="Cari nama atau topik group"
          autoComplete="off"
          className="ml-3 min-w-0 flex-1 bg-transparent text-[14.7px] text-[#171717] outline-none placeholder:text-[#6b7280] [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <Link
            href="/knowledge"
            aria-label="Hapus pencarian"
            className="flex size-6 shrink-0 items-center justify-center"
          >
            <Image src="/knowledge/clear.svg" alt="" width={9} height={9} />
          </Link>
        )}
        <button
          type="submit"
          className="h-full shrink-0 px-5 text-[13.7px] font-bold text-ink"
        >
          Cari
        </button>
      </div>

      <div className={`${hasMeta ? "mt-[28px] min-h-6" : ""} flex flex-wrap items-center gap-x-3 gap-y-2 text-[13.6px] text-[#5b6270]`}>
        {searching && resultCount > 0 ? (
          <>
            <p>
              {resultCount} group cocok dengan{" "}
              <span className="font-semibold text-[#1e2229]">“{query}”</span>
            </p>
            <Link href="/knowledge" className="underline">
              Hapus pencarian
            </Link>
            <SortSelect value={sort} />
          </>
        ) : (
          !searching && total > 0 && <p>{total} knowledge group tersedia</p>
        )}
      </div>
    </form>
  );
}
