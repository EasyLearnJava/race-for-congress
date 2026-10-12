// Server-only: assembles the data slice for one race page. Imported by the route files
// (src/app/house/[id]/page.tsx, src/app/senate/[st]/page.tsx), never by client code.
import "server-only";

import {
  hexmapForState,
  historyFor,
  house,
  houseInState,
  meta,
  moneyFor,
  outsideFor,
  ratings,
  ratingsFor,
  senateInState,
  spendersFor,
  summaryFor,
} from "@/lib/data";
import type { HouseRace, SenateRace } from "@/lib/data/types";
import type { HouseRaceData, SenateRaceData } from "./types";

const SIMILAR_COUNT = 6;

function forecasterCount(chamber: "house" | "senate"): number {
  return new Set(ratings.filter((r) => r.chamber === chamber).map((r) => r.source)).size;
}

/** The rated seats whose lean is closest to this race's lean. */
function similarSeats(race: HouseRace): HouseRace[] {
  return house
    .filter((r) => r.id !== race.id && r.ratingCount > 0)
    .map((r) => ({ r, d: Math.abs(r.lean - race.lean) }))
    .sort((a, b) => a.d - b.d || a.r.id.localeCompare(b.r.id))
    .slice(0, SIMILAR_COUNT)
    .map((x) => x.r);
}

function common(race: HouseRace | SenateRace, chamber: "house" | "senate") {
  return {
    ratings: ratingsFor(chamber, race.id).sort((a, b) => b.score - a.score || a.source.localeCompare(b.source)),
    forecasterCount: forecasterCount(chamber),
    money: moneyFor(race.id),
    outside: outsideFor(race.id) ?? null,
    spenders: spendersFor(race.id),
    stateMap: hexmapForState(race.state),
    stateHouse: houseInState(race.state),
    national2024: meta.national_2024.margin,
    generated: meta.generated,
    summary: summaryFor(race.id) ?? null,
  };
}

export function houseRaceData(race: HouseRace): HouseRaceData {
  const sen = senateInState(race.state);
  return {
    chamber: "house",
    race,
    ...common(race, "house"),
    similar: similarSeats(race),
    history: historyFor(race.id),
    senateRace: sen
      ? { id: sen.id, state: sen.state, stateName: sen.stateName, rating: sen.rating, specialElection: sen.specialElection }
      : null,
  };
}

export function senateRaceData(race: SenateRace): SenateRaceData {
  return { chamber: "senate", race, ...common(race, "senate") };
}
