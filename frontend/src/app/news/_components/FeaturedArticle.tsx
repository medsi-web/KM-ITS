import Image from "next/image";
import Link from "next/link";
import { formatDate, type NewsArticle } from "../_data/articles";
import Cover from "./Cover";

/** The newest article: cover on the left, headline and "Baca berita" link on the right. */
export default function FeaturedArticle({ article }: { article: NewsArticle }) {
  return (
    <article className="grid gap-y-5 lg:grid-cols-[361fr_334fr]">
      <Link
        href={`/news/${article.id}`}
        aria-label={article.title}
        className="relative block aspect-video overflow-hidden"
      >
        <Cover
          article={article}
          priority
          sizes="(min-width: 1024px) 38vw, 90vw"
        />
      </Link>

      <div className="flex flex-col lg:pb-[38px] lg:pl-[12%]">
        <p className="mt-[15px] text-[12.4px] font-bold uppercase leading-[normal] text-[#5b6270]">
          {["Terbaru", article.category].filter(Boolean).join(" | ")}
        </p>
        <h2 className="mt-[13px] text-[28.8px] font-bold leading-[normal] text-[#1e2229]">
          {article.title}
        </h2>
        <p className="mt-[16px] text-[16.5px] leading-[normal] text-[#5b6270]">
          {article.summary}
        </p>

        <div className="mt-8 lg:mt-auto">
          <p className="text-[14.4px] leading-[normal] text-[#5b6270]">
            {formatDate(article.publishedAt)} | {article.ministry}
          </p>
          <Link
            href={`/news/${article.id}`}
            className="mt-[18px] inline-flex items-center gap-[10px] text-[15.5px] font-bold leading-[normal] text-[#1e2229] hover:underline"
          >
            Baca berita
            <Image src="/news/arrow-right.svg" alt="" width={11} height={10} />
          </Link>
        </div>
      </div>
    </article>
  );
}
