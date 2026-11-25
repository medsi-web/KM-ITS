import Image from "next/image";
import type { NewsArticle } from "../_data/articles";

/**
 * Cover image of an article, filling its (relatively positioned) parent. Articles
 * without a cover get the wireframe placeholder from the design.
 */
export default function Cover({
  article,
  sizes,
  priority,
}: {
  article: NewsArticle;
  sizes: string;
  priority?: boolean;
}) {
  if (article.cover) {
    return (
      <Image
        src={article.cover.src}
        alt={article.cover.alt}
        fill
        priority={priority}
        sizes={sizes}
        unoptimized // remote Google Drive image, not in the optimizer allow-list
        className="object-cover"
      />
    );
  }

  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center border border-[#d5d8de] bg-[#ebedf0] text-[12.5px] text-[#5b6270]"
    >
      <svg
        className="absolute inset-0 size-full"
        preserveAspectRatio="none"
        fill="none"
        stroke="#d5d8de"
      >
        <line x1="0" y1="0" x2="100%" y2="100%" />
        <line x1="100%" y1="0" x2="0" y2="100%" />
      </svg>
      <span className="relative">Cover news</span>
    </div>
  );
}
