"use client";

import { useEffect } from "react";

/**
 * Reveals every `[data-reveal]` element on the page once it scrolls into view.
 *
 * It renders nothing and takes no children, so the surfaces it animates stay
 * server components. The hidden pre-reveal state lives in motion.css behind
 * `@media (scripting: enabled)`, which means a reader without JavaScript sees
 * the finished page rather than an empty one.
 */

/**
 * A small fixed inset, not a percentage, and a zero threshold: the last element
 * on the page stops scrolling while it is still near the bottom edge, so any
 * inset larger than its own height would keep it hidden forever.
 */
const ROOT_MARGIN = "0px 0px -56px 0px";
const THRESHOLD = 0;

function reveal(element: Element) {
  element.setAttribute("data-visible", "");
}

export function RevealObserver() {
  useEffect(() => {
    const targets = document.querySelectorAll("[data-reveal]:not([data-visible])");
    if (targets.length === 0) return;

    // Without IntersectionObserver the page is shown in full rather than hidden.
    if (typeof IntersectionObserver === "undefined") {
      targets.forEach(reveal);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          reveal(entry.target);
          // Revealed once. Re-animating on every scroll-by fights the reader.
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: ROOT_MARGIN, threshold: THRESHOLD },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, []);

  return null;
}
