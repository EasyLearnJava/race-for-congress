import type { Metadata } from "next";

import { house, meta, ratings, senate, senateComposition } from "@/lib/data";
import type { HouseRace, SenateRace } from "@/lib/data/types";
import type { RaceLite } from "./_components/analytics";
import { Forecasters, type RatingsSource } from "./_components/forecasters";

const forecasterCount = new Set(ratings.map((r) => r.source)).size;

export const metadata: Metadata = {
  title: "Forecaster analytics",
  description: `Where ${
    forecasterCount > 0 ? `${forecasterCount} published forecasters` : "the published forecasters"
  } agree, disagree and lean on the 2026 House and Senate races: implied seats, house effects, an agreement matrix, the most contested races and how fresh each rating is.`,
};

/** Only the fields this page reads, so the client payload stays small. */
function slim(r: HouseRace | SenateRace): RaceLite {
  return {
    id: r.id,
    state: r.state,
    stateName: r.stateName,
    lean: r.lean,
    rating: r.rating,
    ratingScore: r.ratingScore,
    ratingCount: r.ratingCount,
    incumbentRunning: r.incumbentRunning,
    incumbentParty: r.incumbentParty,
    special: r.special,
  };
}

export default function ForecastersPage() {
  const { source: compositionSource, ...composition } = senateComposition();
  const houseSource = meta.sources.wikipedia_house_ratings;
  const senateSource = meta.sources.wikipedia_senate;
  const sources: Record<"house" | "senate", RatingsSource | null> = {
    house: houseSource ? { name: houseSource.name, url: houseSource.url, retrieved: houseSource.retrieved } : null,
    senate: senateSource ? { name: senateSource.name, url: senateSource.url, retrieved: senateSource.retrieved } : null,
  };

  return (
    <Forecasters
      ratings={ratings}
      house={house.map(slim)}
      senate={senate.map(slim)}
      composition={composition}
      compositionDerived={compositionSource === "derived"}
      sources={sources}
      generated={meta.generated}
    />
  );
}
