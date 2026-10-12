"use client";

// Sections rise into view as they scroll in, as on apple.com. Only elements still below the fold
// are hidden (data-reveal="pending"), so nothing on screen flashes at load and the page reads
// fine without JavaScript. Elements arriving together stagger slightly. Reduced motion: off.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

const STAGGER_MS = 70;

export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const io = new IntersectionObserver(
      (entries) => {
        let i = 0;
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.style.transitionDelay = `${Math.min(i++, 5) * STAGGER_MS}ms`;
          el.dataset.reveal = "shown";
          io.unobserve(el);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    const arm = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>(".reveal:not([data-reveal])").forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) {
          el.dataset.reveal = "shown"; // already visible: never hide it
          return;
        }
        el.dataset.reveal = "pending";
        io.observe(el);
      });
    };
    arm(document);
    // Sections rendered later (client components, tab switches) get the same treatment.
    const mo = new MutationObserver((records) => {
      for (const r of records) r.addedNodes.forEach((n) => n instanceof HTMLElement && arm(n.parentElement ?? n));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [pathname]);

  return null;
}
