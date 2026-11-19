import Image from "next/image";
import Link from "next/link";
import { formatDate, type NewsArticle } from "../_data/articles";
import Cover from "./Cover";

/**
 * Search-result card: cover with a navy overlay, category and date, title and
 * summary. The title link is stretched over the whole card; "Baca" is only the
 * visual cue.
 */
export default function ArticleCard({
  article,
  priority,
}: {
  article: NewsArticle;
  priority?: boolean;
}) {
  return (
    <article className="group relative aspect-video overflow-hidden">
      <Cover
        article={article}
        priority={priority}
        sizes="(min-width: 1024px) 30vw, 90vw"
      />
      <Image src="/news/card-overlay.svg" alt="" fill sizes="30vw" />

      <div className="absolute inset-x-[10px] bottom-[14px] z-10 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[9.3px] font-bold uppercase leading-[normal] text-white">
            {[article.category, formatDate(article.publishedAt)].filter(Boolean).join(" | ")}
          </p>
          <h3 className="mt-[3px] text-[20.8px] font-bold leading-[normal] text-white">
            <Link
              href={`/news/${article.id}`}
              className="outline-none after:absolute after:inset-0 focus-visible:after:ring-2 focus-visible:after:ring-white"
            >
              {article.title}
            </Link>
          </h3>
          <p className="mt-[3px] line-clamp-1 text-[13.7px] leading-[normal] text-[#b1b1b1]">
            {article.summary}
          </p>
        </div>
        <span
          aria-hidden
          className="mr-[6px] mb-[1px] flex h-[34px] w-[69px] shrink-0 items-center justify-center rounded-[6px] bg-white text-[13.4px] font-bold text-navy transition-colors group-hover:bg-icon-tint"
        >
          Baca
        </span>
      </div>
    </article>
  );
}
