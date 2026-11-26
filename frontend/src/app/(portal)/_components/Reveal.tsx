"use client";

import { useEffect, useRef } from "react";

/**
 * Starts the `.pf-reveal` items of its layer once the layer scrolls into view.
 * It only sets `data-inview` on the nearest `.pf-layer`; the motion is in portal.css.
 */
export default function Reveal() {
  const marker = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const layer = marker.current?.closest(".pf-layer");
    if (!layer) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        layer.setAttribute("data-inview", "");
        observer.disconnect();
      },
      { threshold: 0.15 },
    );
    observer.observe(layer);
    return () => observer.disconnect();
  }, []);

  return <span ref={marker} hidden />;
}
