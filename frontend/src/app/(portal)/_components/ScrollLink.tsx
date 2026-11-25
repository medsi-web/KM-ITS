"use client";

import type { AnchorHTMLAttributes, MouseEvent } from "react";

type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  /** In-page anchor, e.g. "#features". */
  href: `#${string}`;
};

/**
 * In-page anchor that scrolls every time it is clicked. A plain `#hash` link
 * stops working once the URL already carries that hash (the router sees no
 * change), so the scroll is done here instead.
 */
export default function ScrollLink({ href, onClick, ...rest }: Props) {
  function handleClick(e: MouseEvent<HTMLAnchorElement>) {
    onClick?.(e);
    if (e.defaultPrevented) return;

    const target = document.getElementById(href.slice(1));
    if (!target) return;

    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }

  return <a href={href} onClick={handleClick} {...rest} />;
}
