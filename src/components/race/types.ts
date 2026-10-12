// The slice of data a race page needs. Built on the server (load.ts) and passed to the client
// RacePage as plain JSON, so the browser never receives the full datasets.
import type {
  HexMap,
  HistoryRow,
  HouseRace,
  MoneyRow,
  OutsideRow,
  RaceSummary,
  Rating,
  RatingLabel,
  SenateRace,
  SpenderRow,
} from "@/lib/data/types";

interface Common {
  /** Every published rating for this race, one row per forecaster. */
  ratings: Rating[];
  /** How many forecasters publish ratings for this chamber (10 today). */
  forecasterCount: number;
  money: MoneyRow[];
  outside: OutsideRow | null;
  spenders: SpenderRow[];
  /** The state's House districts on the equal-area map. */
  stateMap: HexMap;
  /** Every House race in the state (map fills, tooltips, the House table on Senate pages). */
  stateHouse: HouseRace[];
  /** The 2024 national presidential margin (lean is measured against it). */
  national2024: number;
  /** Build date of the datasets. */
  generated: string;
  /** The published AI summary of this race, when there is one. */
  summary: RaceSummary | null;
}

export interface SenateLink {
  id: string;
  state: string;
  stateName: string;
  rating: RatingLabel;
  specialElection: boolean;
}

export interface HouseRaceData extends Common {
  chamber: "house";
  race: HouseRace;
  /** Seats whose lean is closest to this one, among races the forecasters rate. */
  similar: HouseRace[];
  /** Results under the lines in force each year (empty until the history dataset loads). */
  history: HistoryRow[];
  /** The Senate race in the same state, when there is one. */
  senateRace: SenateLink | null;
}

export interface SenateRaceData extends Common {
  chamber: "senate";
  race: SenateRace;
}

export type RaceData = HouseRaceData | SenateRaceData;
