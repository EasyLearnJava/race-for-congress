import type { MetadataRoute } from "next";

import { house, meta, senate } from "@/lib/data";
import { STATES } from "@/lib/data/states";
import { houseHref, senateHref, stateHref } from "@/lib/routes";

const SITE = "https://race-for-congress.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = meta.generated;
  const pages = ["/", "/house", "/senate", "/states", "/forecasters", "/money", "/redistricting", "/simulator", "/ask", "/data", "/methodology"];
  return [
    ...pages.map((p) => ({ url: `${SITE}${p}`, lastModified, changeFrequency: "daily" as const, priority: p === "/" ? 1 : 0.8 })),
    ...STATES.map((s) => ({ url: `${SITE}${stateHref(s.postal)}`, lastModified, changeFrequency: "daily" as const, priority: 0.6 })),
    ...senate.map((r) => ({ url: `${SITE}${senateHref(r.state)}`, lastModified, changeFrequency: "daily" as const, priority: 0.6 })),
    ...house.map((r) => ({ url: `${SITE}${houseHref(r.id)}`, lastModified, changeFrequency: "daily" as const, priority: 0.5 })),
  ];
}
