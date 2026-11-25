"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { inset, px } from "./geometry";

// Boxes sit flush right now that the login button is gone from the bar.
const links = [
  { label: "Knowledge", href: "/knowledge", box: inset(32.43, 12.77, 29.73, 81.11) },
  { label: "Timeline", href: "/timeline", box: inset(32.43, 6.55, 29.73, 88.78) },
  { label: "News", href: "/news", box: inset(32.43, 2, 29.73, 95) },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Utama">
      {links.map((l) => {
        const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
        return (
          <Link
            key={l.label}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={active ? "nb-link nb-link-active" : "nb-link"}
            style={{ ...l.box, fontSize: px(10.36) }}
          >
            {l.label}
            {active && (
              <span aria-hidden className="nb-underline">
                <Image src="/portal/nav-underline.svg" alt="" fill />
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
