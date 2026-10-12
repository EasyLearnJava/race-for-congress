"use client";

// Counts a page view after each path change commits, so the URL and title are the new page's.
// Query-only changes (filters, the scenario, picks) are not page views. A no-op without a key.
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { pageview } from "@/lib/analytics";

export function PageviewTracker() {
  const pathname = usePathname();
  useEffect(() => {
    pageview();
  }, [pathname]);
  return null;
}
