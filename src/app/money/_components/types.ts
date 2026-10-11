// Slices the /money server page hands to its client components. Built in page.tsx from
// @/lib/data so the browser only receives per-race totals, never the raw FEC rows.
import type { RatingLabel } from "@/lib/data/types";
import type { ModelRace } from "@/lib/model/engine";

export type Chamber = "house" | "senate";

/** Candidate-committee totals for one side of a race (summed over that side's nominees). */
export interface SideMoney {
  /** Nominee name(s) as matched to the FEC, joined with " / ". */
  names: string;
  raised: number | null;
  spent: number | null;
  cash: number | null;
}

export interface CandidateMoney {
  dem: SideMoney | null;
  rep: SideMoney | null;
  /** Independents and other nominees the pipeline tracks. */
  other: SideMoney | null;
  /** Latest reporting date among this race's matched nominees. */
  coverageEnd: string;
}

export interface OutsideMoney {
  proDem: number;
  proRep: number;
  /** Spending for or against independents and other nominees. */
  other: number;
  total: number;
  last30: number | null;
  latest: string;
}

/** One race with any money data, plus the fields the model reads. */
export interface MoneyRace extends ModelRace {
  chamber: Chamber;
  /** Short label: "PA-07" or "Texas Senate". */
  label: string;
  /** Long label: "Pennsylvania's 7th district" or "Texas Senate (special)". */
  place: string;
  state: string;
  rating: RatingLabel;
  dem: string;
  rep: string;
  /** Who the positive side of the model margin is: a Democrat, or an independent where none runs. */
  challenger: "D" | "I";
  candidates: CandidateMoney | null;
  outside: OutsideMoney | null;
}

/** Outside spender aggregated across races. */
export interface SpenderSummary {
  id: string;
  name: string;
  total: number;
  /** Support for Democrats plus opposition to Republicans. */
  proDem: number;
  /** Support for Republicans plus opposition to Democrats. */
  proRep: number;
  /** For or against independents and other nominees. */
  other: number;
  /** Race ids, largest spending first. */
  races: string[];
  latest: string;
}

/** Spending by one spender in one race, for the spender focus view. */
export interface SpenderRace {
  spender: string;
  raceId: string;
  proDem: number;
  proRep: number;
  other: number;
}

export interface Coverage {
  /** Latest candidate-report coverage end, "" when none. */
  candidateEnd: string;
  /** Earliest coverage end among matched nominees with reports. */
  candidateEarliest: string;
  /** Latest independent-expenditure date, "" when none. */
  outsideLatest: string;
  nominees: number;
  /** Nominees matched to an FEC candidate. */
  matched: number;
  /** Matched nominees with at least one processed report. */
  reporting: number;
  candidateSource: string;
  outsideSource: string;
}
