// Runs in the browser before the app becomes interactive (Next.js instrumentation-client).
// Starts product analytics (a no-op without NEXT_PUBLIC_POSTHOG_KEY) and notes which page each
// App Router navigation leaves, for race_opened. Page views are counted by PageviewTracker.
// See src/lib/analytics.ts and docs/TRACKING.md.
import { initAnalytics, noteNavigationFrom } from "@/lib/analytics";

try {
  initAnalytics();
} catch {
  // Analytics must never block the app.
}

export function onRouterTransitionStart() {
  // Still the page being left: the new URL has not been committed yet.
  noteNavigationFrom(window.location.pathname);
}
