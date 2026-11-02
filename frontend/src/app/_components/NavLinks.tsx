"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { inset, px } from "./geometry";

const links = [
  { label: "Knowledge", href: "/knowledge", box: inset(32.43, 23.44, 29.73, 70.44) },
  { label: "Timeline", href: "#", box: inset(32.43, 17.22, 29.73, 78.11) },
  { label: "News", href: "#", box: inset(32.43, 12.67, 29.73, 84.33) },
];

export default function NavLinks() {
  const pathname = usePathname();

  return (
    <nav aria-label="Utama">
      {links.map((l) => {
        const active =
          l.href !== "#" &&
          (pathname === l.href || pathname.startsWith(`${l.href}/`));
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
