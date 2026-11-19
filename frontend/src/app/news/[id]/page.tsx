import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import Markdown from "react-markdown";
import Cover from "../_components/Cover";
import { formatDate, getArticle, getArticles, newsHref } from "../_data/articles";

export async function generateMetadata({
  params,
}: PageProps<"/news/[id]">): Promise<Metadata> {
  const article = await getArticle((await params).id).catch(() => undefined);
  if (!article) return {};
  return {
    title: `${article.title} | KM ITS News`,
    description: article.summary,
  };
}

/** Article data is runtime data (it changes whenever an admin publishes), so it streams inside Suspense. */
export default function NewsArticlePage({ params }: PageProps<"/news/[id]">) {
  return (
    <Suspense fallback={<div className="h-[480px]" />}>
      <Article params={params} />
    </Suspense>
  );
}

async function Article({ params }: Pick<PageProps<"/news/[id]">, "params">) {
  // An API failure is not a missing article: let it reach the error boundary.
  const article = await getArticle((await params).id);
  if (!article) notFound();

  const category = article.category;
  const isNewest = (await getArticles().catch(() => []))[0]?.id === article.id;

  return (
    <div className="grid gap-y-10 px-5 md:pl-[5.7%] md:pr-[1.7%] lg:grid-cols-[404fr_445fr] lg:gap-x-[4.93%]">
      {/* Article header and cover */}
      <div className="min-w-0">
        <nav
          aria-label="Breadcrumb"
          className="flex items-center gap-[7px] text-[17.4px] leading-[normal] text-[#5b6270]"
        >
          <Link href="/news" className="underline">
            News
          </Link>
          <Image
            src="/news/breadcrumb-chevron.svg"
            alt=""
            width={5}
            height={8}
            className="mx-[6px]"
          />
          <Link
            href={newsHref({ kategori: category })}
            className="font-bold text-[#1e2229]"
          >
            {category}
          </Link>
        </nav>

        <p className="mt-[19px] text-[12.4px] font-bold uppercase leading-[normal] text-[#5b6270]">
          {[isNewest && "Terbaru", category].filter(Boolean).join(" | ")}
        </p>
        <h1 className="mt-[13px] text-[28.8px] font-bold leading-[normal] text-[#1e2229]">
          {article.title}
        </h1>
        <p className="mt-[11px] text-[17.4px] leading-[normal] text-[#5b6270]">
          {formatDate(article.publishedAt)} | {article.ministry} | Penulis:{" "}
          {article.authors.join(", ")}
        </p>

        <div className="relative mt-[26px] aspect-[404/248] overflow-hidden">
          <Cover article={article} priority sizes="(min-width: 1024px) 40vw, 90vw" />
        </div>
      </div>

      {/* Article body on a sheet of paper with a second sheet tilted behind it */}
      <div className="relative min-w-0 pb-10 lg:mt-[-4px]">
        <div
          aria-hidden
          className="absolute inset-0 bottom-10 hidden -rotate-[4.35deg] rounded-xl bg-white shadow-[9px_13px_39px_rgba(0,0,0,0.25)] lg:block"
        />
        <article className="relative min-h-[300px] rounded-xl bg-white px-[39px] py-[48px] shadow-[9px_13px_39px_rgba(0,0,0,0.25)] lg:min-h-[828px]">
          {/* react-markdown drops raw HTML and unsafe URLs by default. */}
          <div className="flex flex-col gap-[22px] text-[16px] leading-[26px] text-[#1e2229] [&_a]:text-navy [&_a]:underline [&_h1]:text-[22px] [&_h1]:font-bold [&_h2]:text-[19px] [&_h2]:font-bold [&_h3]:font-bold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6">
            <Markdown>{article.body}</Markdown>
          </div>
        </article>
      </div>
    </div>
  );
}
