"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { NewsArticle } from "../_data/articles";
import Cover from "./Cover";

/**
 * "Berita Lainnya" list. It shows about three covers; when there are more, the
 * round chevron at the bottom scrolls the list and hides at the end.
 */
export default function MoreNews({ articles }: { articles: NewsArticle[] }) {
  const listRef = useRef<HTMLUListElement>(null);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const update = () =>
      setHasMore(list.scrollTop + list.clientHeight < list.scrollHeight - 4);
    update();
    list.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      list.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [articles]);

  return (
    <aside aria-labelledby="more-news-heading" className="relative">
      <h2
        id="more-news-heading"
        className="text-[15.5px] font-bold leading-[normal] text-[#1e2229]"
      >
        Berita Lainnya
      </h2>
      <ul
        ref={listRef}
        className="mt-[11px] flex max-h-[486px] flex-col gap-3 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {articles.map((article) => (
          <li key={article.id}>
            <Link
              href={`/news/${article.id}`}
              className="relative block aspect-video overflow-hidden"
            >
              <Cover article={article} sizes="(min-width: 1024px) 20vw, 45vw" />
              <span className="sr-only">{article.title}</span>
            </Link>
          </li>
        ))}
      </ul>
      {hasMore && (
        <button
          type="button"
          aria-label="Lihat berita lainnya"
          onClick={() =>
            listRef.current?.scrollBy({ top: 162, behavior: "smooth" })
          }
          className="absolute bottom-3 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center"
        >
          <Image src="/news/more-circle.svg" alt="" fill />
          <Image
            src="/news/more-chevron.svg"
            alt=""
            width={14}
            height={8}
            className="relative"
          />
        </button>
      )}
    </aside>
  );
}
