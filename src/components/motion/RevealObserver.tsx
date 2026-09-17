"use client";

import { useEffect } from "react";

/**
 * Reveals every `[data-reveal]` element on the page once it scrolls into view.
 *
 * It renders nothing and takes no children, so the surfaces it animates stay
 * server components. The hidden pre-reveal state lives in motion.css behind
 * `@media (scripting: enabled)`, which means a reader without JavaScript sees
 * the finished page rather than an empty one.
 *
 * A page opts in by server-rendering at least one `[data-reveal]`. Pages with
 * none — the studio, the editor, the embed — pay nothing, not even the
 * mutation watcher below.
 */

/**
 * A small fixed inset, not a percentage, and a zero threshold: the last element
 * on the page stops scrolling while it is still near the bottom edge, so any
 * inset larger than its own height would keep it hidden forever.
 */
const ROOT_MARGIN = "0px 0px -56px 0px";
const THRESHOLD = 0;
const PENDING = "[data-reveal]:not([data-visible])";

function reveal(element: Element) {
  element.setAttribute("data-visible", "");
}

export function RevealObserver() {
  useEffect(() => {
    if (document.querySelector("[data-reveal]") === null) return;

    if (typeof IntersectionObserver === "undefined") {
      document.querySelectorAll(PENDING).forEach(reveal);
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

    const observeWithin = (root: Element) => {
      if (root.matches(PENDING)) observer.observe(root);
      root.querySelectorAll(PENDING).forEach((element) => observer.observe(element));
    };

    observeWithin(document.body);

    // Client-rendered lists — saved projects, templates — mount after this
    // effect runs. An element that is never observed keeps the hidden
    // pre-reveal state forever, so newly attached nodes are picked up too.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) observeWithin(node as Element);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return null;
}
