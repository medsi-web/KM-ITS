import type { Metadata } from "next";
import { Suspense } from "react";
import EmptyState from "./_components/EmptyState";
import GroupCard from "./_components/GroupCard";
import SearchBar from "./_components/SearchBar";
import { groups, parseSort, searchGroups } from "./_data/groups";

export const metadata: Metadata = {
  title: "KM ITS Knowledge | Portal KM ITS",
  description:
    "Arsip dokumen dan referensi KM ITS yang tersimpan di Google Drive.",
};

const gutter = "px-5 md:pl-[5.7%] md:pr-[10%]";

export default function KnowledgePage({ searchParams }: PageProps<"/knowledge">) {
  return (
    <>
      <header className={`${gutter} pt-4`}>
        <h1 className="text-4xl font-semibold leading-[normal] text-navy md:text-[48.5px]">
          KM ITS Knowledge
        </h1>
        <p className="mt-[15px] max-w-[585px] text-base leading-[normal] md:text-[19.2px] text-[#5b6270]">
          Arsip dokumen dan referensi KM ITS. Setiap knowledge group berisi
          kumpulan dokumen yang tersimpan di Google Drive.
        </p>
      </header>

      {/* Search params are runtime data, so everything that reads them sits inside Suspense. */}
      <Suspense fallback={<div className="h-96" />}>
        <Results searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Results({
  searchParams,
}: {
  searchParams: PageProps<"/knowledge">["searchParams"];
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const sort = parseSort(typeof params.sort === "string" ? params.sort : undefined);
  const found = searchGroups(query, sort);

  return (
    <>
      <div className={`${gutter} ${found.length === 0 ? "mt-[17px]" : "mt-[27px]"}`}>
        <SearchBar
          query={query}
          sort={sort}
          resultCount={found.length}
          total={groups.length}
        />
      </div>

      {groups.length === 0 ? (
        <EmptyState
          className="mt-[79px]"
          icon="/knowledge/empty-book.svg"
          title="Belum ada knowledge group"
          description="Arsip KM ITS sedang dikumpulkan. Group akan muncul di sini setelah ditambahkan pengurus."
        />
      ) : found.length === 0 ? (
        <EmptyState
          className="mt-[50px]"
          icon="/knowledge/empty-search.svg"
          title={`Tidak ada group yang cocok dengan “${query}”`}
          description="Periksa ejaan atau gunakan kata yang lebih umum."
          actionHref="/knowledge"
          actionLabel="Lihat semua group"
        />
      ) : (
        <ul className={`${gutter} mt-[30px] grid grid-cols-1 gap-x-9 gap-y-[33px] sm:grid-cols-2 lg:grid-cols-4`}>
          {found.map((group) => (
            <li key={group.slug} className="flex">
              <div className="flex-1">
                <GroupCard group={group} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
