import Image from "next/image";
import Link from "next/link";
import { newsHref } from "../_data/articles";

/**
 * Search form for the news list. It is a plain GET form (`?q=…&kategori=…`), so
 * it works without client-side JavaScript and keeps the selected category.
 */
export default function NewsSearch({
  query,
  category,
}: {
  query: string;
  category?: string;
}) {
  const searching = query.length > 0;

  return (
    <form action="/news" role="search" className="w-full">
      {category && <input type="hidden" name="kategori" value={category} />}
      <div
        className={`flex h-[45px] items-center rounded-[5px] border bg-white focus-within:border-navy focus-within:shadow-[0_0_0_3px_rgba(0,98,255,0.18)] ${
          searching ? "border-navy" : "border-line"
        }`}
      >
        <Image
          src="/news/search-icon.svg"
          alt=""
          width={12}
          height={13}
          className="ml-[14px] shrink-0"
        />
        <input
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cari judul atau topik berita"
          aria-label="Cari judul atau topik berita"
          autoComplete="off"
          className="ml-3 min-w-0 flex-1 bg-transparent text-[15px] text-[#171717] outline-none placeholder:text-[#6b7280] [&::-webkit-search-cancel-button]:hidden"
        />
        {searching && (
          <Link
            href={newsHref({ kategori: category })}
            aria-label="Hapus pencarian"
            className="flex size-6 shrink-0 items-center justify-center"
          >
            <Image src="/news/search-clear.svg" alt="" width={9} height={9} />
          </Link>
        )}
        <button
          type="submit"
          className="h-full shrink-0 px-[18px] text-[14px] font-bold text-ink"
        >
          Cari
        </button>
      </div>
    </form>
  );
}
