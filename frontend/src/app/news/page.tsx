import type { Metadata } from "next";
import { Suspense } from "react";
import EmptyState from "../_components/EmptyState";
import ActiveFilters from "./_components/ActiveFilters";
import ArticleCard from "./_components/ArticleCard";
import CategoryChips from "./_components/CategoryChips";
import FeaturedArticle from "./_components/FeaturedArticle";
import MoreNews from "./_components/MoreNews";
import NewsSearch from "./_components/NewsSearch";
import { categoriesOf, getArticles, searchArticles } from "./_data/articles";

export const metadata: Metadata = {
  title: "KM ITS News | Portal KM ITS",
  description:
    "Berita dan informasi terbaru KM ITS yang dipublikasikan oleh BEM ITS.",
};

const gutter = "px-5 md:pl-[5.7%] md:pr-[1.7%]";
/** Featured block, search and sidebar share these three columns (Figma 361 : 314 : 178). */
const columns =
  "lg:grid-cols-[361fr_314fr_178fr] lg:grid-rows-[auto_auto_1fr] lg:gap-x-[2.24%]";

export default function NewsPage({ searchParams }: PageProps<"/news">) {
  return (
    // Search params are runtime data, so everything that reads them sits inside Suspense.
    <Suspense
      fallback={
        <div className={`${gutter} grid ${columns}`}>
          <Heading />
        </div>
      }
    >
      <Content searchParams={searchParams} />
    </Suspense>
  );
}

function Heading() {
  return (
    <header className="lg:col-span-2 lg:col-start-1 lg:row-start-1">
      <h1 className="text-4xl font-semibold leading-[normal] text-navy md:text-[49.6px]">
        KM ITS News
      </h1>
      <p className="mt-[15px] max-w-[600px] text-base leading-[normal] text-[#5b6270] md:text-[19.6px]">
        Berita dan informasi terbaru KM ITS yang dipublikasikan oleh BEM ITS
      </p>
    </header>
  );
}

async function Content({
  searchParams,
}: {
  searchParams: PageProps<"/news">["searchParams"];
}) {
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const articles = await getArticles().catch(() => null);
  if (!articles) {
    return (
      <div className={`${gutter} grid ${columns}`}>
        <Heading />
        <EmptyState
          className="mt-[50px] lg:col-span-3"
          icon="/knowledge/empty-book.svg"
          title="Berita belum dapat dimuat"
          description="Terjadi gangguan saat mengambil berita KM ITS. Coba muat ulang halaman beberapa saat lagi."
          actionHref="/news"
          actionLabel="Muat ulang"
        />
      </div>
    );
  }

  const categories = categoriesOf(articles);
  const category = categories.find(
    (c) => c === (typeof params.kategori === "string" ? params.kategori : undefined),
  );
  const filtering = query !== "" || category !== undefined;

  const found = filtering ? searchArticles(articles, query, category) : [];
  const [featured, ...others] = articles;

  return (
    <div className={`${gutter} grid ${columns}`}>
      <Heading />

      <div className="mt-6 lg:col-span-2 lg:col-start-2 lg:row-start-1 lg:mt-[13px] lg:w-[68.4%] lg:justify-self-end">
        <NewsSearch query={query} category={category} />
        {filtering && (
          <ActiveFilters
            query={query}
            category={category}
            count={found.length}
          />
        )}
      </div>

      <div className="mt-[22px] lg:col-span-2 lg:row-start-2 lg:mt-[33px]">
        <CategoryChips categories={categories} query={query} category={category} />
      </div>

      {filtering ? (
        found.length === 0 ? (
          <EmptyState
            className="mt-[50px] lg:col-span-3"
            icon="/knowledge/empty-search.svg"
            title="Tidak ada berita yang cocok"
            description={
              query
                ? `Tidak ada hasil untuk “${query}”${category ? ` di ${category}` : ""}. Coba kata lain atau hapus filter kategori.`
                : `Belum ada berita di kategori ${category}.`
            }
            actionHref="/news"
            actionLabel="Hapus Filter"
          />
        ) : (
          <ul className="mt-[33px] grid grid-cols-1 gap-x-[6%] gap-y-[33px] sm:grid-cols-2 lg:col-span-3 lg:ml-[2%] lg:mr-[6.3%] lg:grid-cols-3">
            {found.map((article, i) => (
              <li key={article.id}>
                <ArticleCard article={article} priority={i === 0} />
              </li>
            ))}
          </ul>
        )
      ) : (
        featured && (
          <>
            <div className="mt-[22px] lg:col-span-2 lg:row-start-3 lg:mt-[33px]">
              <FeaturedArticle article={featured} />
            </div>
            {others.length > 0 && (
              <div className="mt-10 lg:col-start-3 lg:row-span-2 lg:row-start-2 lg:-mt-[31px]">
                <MoreNews articles={others} />
              </div>
            )}
          </>
        )
      )}
    </div>
  );
}
