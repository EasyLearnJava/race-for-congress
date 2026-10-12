"use client";

// Vercel Web Analytics and Speed Insights, cookieless. URLs are cut to their path before
// sending: /call URLs hold a person's picks, and filters and scenarios are not needed here.
import { Analytics, type BeforeSend } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { stripUrl } from "@/lib/analytics";

const pathOnly: BeforeSend = (event) => ({ ...event, url: stripUrl(event.url) as string });

export function VercelAnalytics() {
  return (
    <>
      <Analytics beforeSend={pathOnly} />
      <SpeedInsights beforeSend={(event) => ({ ...event, url: stripUrl(event.url) as string })} />
    </>
  );
}
