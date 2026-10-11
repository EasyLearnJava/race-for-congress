import type { Metadata } from "next";

import { hexmap, house, meta, ratings } from "@/lib/data";
import { Explorer } from "./_components/explorer";

export const metadata: Metadata = {
  title: "House race explorer",
  description:
    "Filter and compare all 435 House races for 2026: district lean, the model's expected margin and chance, forecaster ratings, open seats and new lines. Every chart cross-filters and exports.",
};

/** Newest House rating date, for the charts' source lines. */
function ratingsAsOf(): string | null {
  let newest: string | null = null;
  for (const r of ratings) if (r.chamber === "house" && r.asOf && (!newest || r.asOf > newest)) newest = r.asOf;
  return newest;
}

export default function HousePage() {
  return <Explorer house={house} hexmap={hexmap} ratingsAsOf={ratingsAsOf()} generated={meta.generated} />;
}
