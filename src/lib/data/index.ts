// Server-only access to the generated datasets. Import from Server Components and pass
// the slices a page needs down to Client Components as props (never import this file
// from a Client Component: it would ship every dataset to the browser).
import "server-only";

import genericBallotJson from "@/generated/genericBallot.json";
import hexmapJson from "@/generated/hexmap.json";
import historyJson from "@/generated/history.json";
import houseJson from "@/generated/house.json";
import metaJson from "@/generated/meta.json";
import moneyJson from "@/generated/money.json";
import oldLinesJson from "@/generated/oldLines.json";
import outsideJson from "@/generated/outside.json";
import ratingsJson from "@/generated/ratings.json";
import redistrictingJson from "@/generated/redistricting.json";
import redistrictingCurveJson from "@/generated/redistrictingCurve.json";
import redistrictingDistrictsJson from "@/generated/redistrictingDistricts.json";
import senateJson from "@/generated/senate.json";
import spendersJson from "@/generated/spenders.json";
import summariesJson from "@/generated/summaries.json";

import type { SenateComposition } from "../model/engine";
import type {
  GenericBallotRow,
  HexMap,
  HistoryRow,
  HouseRace,
  Meta,
  MoneyRow,
  OldLinesRow,
  OutsideRow,
  RaceSummary,
  Rating,
  Row,
  SenateRace,
  SpenderRow,
} from "./types";

export const house = houseJson as HouseRace[];
export const senate = senateJson as SenateRace[];
export const ratings = ratingsJson as Rating[];
export const money = moneyJson as MoneyRow[];
export const outside = outsideJson as OutsideRow[];
export const spenders = spendersJson as SpenderRow[];
export const genericBallot = genericBallotJson as GenericBallotRow[];
export const oldLines = oldLinesJson as OldLinesRow[];
export const history = historyJson as HistoryRow[];
export const hexmap = hexmapJson as unknown as HexMap;
/** Redistricting tables from pipeline/old_lines.py; columns as in data/clean/redistricting_*.csv. */
export const redistricting = redistrictingJson as Row[];
export const redistrictingDistricts = redistrictingDistrictsJson as Row[];
export const redistrictingCurve = redistrictingCurveJson as Row[];
export const meta = metaJson as unknown as Meta;

const houseById = new Map(house.map((r) => [r.id, r]));
const senateById = new Map(senate.map((r) => [r.id, r]));

export function getHouseRace(id: string): HouseRace | undefined {
  return houseById.get(id.toUpperCase());
}

export function getSenateRace(id: string): SenateRace | undefined {
  return senateById.get(id.toUpperCase());
}

export function houseInState(postal: string): HouseRace[] {
  return house.filter((r) => r.state === postal.toUpperCase());
}

export function senateInState(postal: string): SenateRace | undefined {
  return senate.find((r) => r.state === postal.toUpperCase());
}

export function ratingsFor(chamber: "house" | "senate", raceId: string): Rating[] {
  return ratings.filter((r) => r.chamber === chamber && r.raceId === raceId);
}

export function moneyFor(raceId: string): MoneyRow[] {
  return money.filter((m) => m.raceId === raceId);
}

export function outsideFor(raceId: string): OutsideRow | undefined {
  return outside.find((o) => o.raceId === raceId);
}

export function spendersFor(raceId: string): SpenderRow[] {
  return spenders.filter((s) => s.raceId === raceId).sort((a, b) => b.amount - a.amount);
}

const summaries = summariesJson as RaceSummary[];

export function summaryFor(raceId: string): RaceSummary | undefined {
  return summaries.find((s) => s.id === raceId);
}

export function historyFor(raceId: string): HistoryRow[] {
  return history.filter((h) => h.id === raceId).sort((a, b) => a.year - b.year);
}

/** The environment the published ratings were made in: the generic-ballot average, or even. */
export function baselineEnvironment(): number {
  return meta.environment?.margin ?? 0;
}

/**
 * Senate seats not up in 2026, by caucus. From the pipeline (Wikipedia) when available;
 * otherwise derived from the 53-47 Senate (independents caucusing with Democrats counted as
 * Democrats) minus the seats each caucus defends this year.
 */
export function senateComposition(): SenateComposition & { source: "pipeline" | "derived" } {
  const c = meta.senate_composition;
  if (c) {
    return {
      holdoverDem: c.not_up.D + c.not_up.I_D,
      holdoverRep: c.not_up.R,
      holdoverOther: c.not_up.other,
      vicePresidentParty: c.vice_president_party === "D" ? "D" : "R",
      source: "pipeline",
    };
  }
  const demUp = senate.filter((r) => r.incumbentParty === "D" || r.incumbentParty === "I").length;
  const repUp = senate.filter((r) => r.incumbentParty === "R").length;
  return { holdoverDem: 47 - demUp, holdoverRep: 53 - repUp, holdoverOther: 0, vicePresidentParty: "R", source: "derived" };
}

/** Hexmap features for one state, for state and district pages. */
export function hexmapForState(postal: string): HexMap {
  const p = postal.toUpperCase();
  return {
    ...hexmap,
    districts: hexmap.districts.filter((d) => d.state === p),
    states: hexmap.states.filter((s) => s.state === p),
  };
}
