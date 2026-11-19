import Link from "next/link";
import { newsHref } from "../_data/articles";

const chip =
  "inline-flex h-[34px] items-center rounded-full border px-[15px] text-[13.4px] leading-none";

/** "Semua" plus one chip per category. Links keep the current search query. */
export default function CategoryChips({
  categories,
  query,
  category,
}: {
  categories: string[];
  query: string;
  category?: string;
}) {
  return (
    <nav aria-label="Kategori berita" className="flex flex-wrap gap-[9.6px]">
      <Chip href={newsHref({ q: query })} active={!category}>
        Semua
      </Chip>
      {categories.map((c) => (
        <Chip
          key={c}
          href={newsHref({ q: query, kategori: c })}
          active={category === c}
        >
          {c}
        </Chip>
      ))}
    </nav>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`${chip} ${
        active
          ? "border-navy bg-navy font-bold text-white"
          : "border-line bg-white text-[#1e2229] hover:border-navy"
      }`}
    >
      {children}
    </Link>
  );
}
