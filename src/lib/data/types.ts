// Shapes of the generated datasets (see scripts/build-data.mjs and data/README.md).
// Margins are Democratic minus Republican share, in percentage points.

export type Party = "D" | "R" | "I" | "L" | "G" | "O" | "";

export type RatingLabel = "Safe D" | "Likely D" | "Lean D" | "Tossup" | "Lean R" | "Likely R" | "Safe R";

export type SpecialCase =
  | ""
  | "same_party_D"
  | "same_party_R"
  | "no_democrat"
  | "no_republican"
  | "independent_vs_R"
  | "candidates_unknown";

export interface RaceBase {
  id: string;
  state: string;
  stateName: string;
  harris24: number;
  trump24: number;
  total24: number;
  /** 2024 presidential margin inside the race's boundaries. */
  pres24: number;
  /** pres24 minus the national margin: the model's baseline. */
  lean: number;
  incumbent: string;
  incumbentParty: Party;
  incumbentRunning: boolean;
  openSeat: boolean;
  incumbentStatus: string;
  /** Democratic nominee(s); several are joined with " / ". */
  dem: string;
  rep: string;
  /** Everyone else on the ballot, as "Name (Party); ...". */
  others: string;
  special: SpecialCase;
  rankedChoice: boolean;
  rating: RatingLabel;
  /** Median published rating, -3 (Safe R) to +3 (Safe D). */
  ratingScore: number;
  /** Number of forecasters rating the race; 0 means nobody lists it as competitive. */
  ratingCount: number;
  cook: string;
  ie: string;
  sabato: string;
}

export interface HouseRace extends RaceBase {
  district: number;
  newLines: boolean;
  biden20: number | null;
  trump20: number | null;
  total20: number | null;
  pres20: number | null;
  /** Party that notionally holds the seat today (basis for counting gains). */
  heldBy: Party;
  heldByMember: string;
  firstElected: string;
  otherIncumbents: string;
  redistrictedFrom: string;
}

export interface SenateRace extends RaceBase {
  specialElection: boolean;
}

export interface Rating {
  chamber: "house" | "senate";
  raceId: string;
  source: string;
  rating: string;
  score: number;
  asOf: string;
}

export interface MoneyRow {
  raceId: string;
  chamber: "house" | "senate";
  party: Party;
  candidate: string;
  fecId: string;
  receipts: number | null;
  disbursements: number | null;
  cashOnHand: number | null;
  individual: number | null;
  selfFunding: number | null;
  debts: number | null;
  coverageEnd: string;
}

export interface OutsideRow {
  raceId: string;
  chamber: "house" | "senate";
  supportDem: number;
  opposeDem: number;
  supportRep: number;
  opposeRep: number;
  proDem: number;
  proRep: number;
  total: number;
  last30: number | null;
  latest: string;
}

export interface SpenderRow {
  raceId: string;
  chamber: "house" | "senate";
  spender: string;
  spenderId: string;
  supportOppose: "S" | "O";
  candidateParty: Party;
  amount: number;
  latest: string;
}

export interface GenericBallotRow {
  source: string;
  dates: string;
  updated: string;
  dem: number | null;
  rep: number | null;
  margin: number | null;
}

export interface OldLinesRow {
  id: string;
  state: string;
  harris24: number;
  trump24: number;
  total24: number;
  pres24: number;
  heldBy: Party;
}

/** A row of a table whose columns pages read by name (numbers and booleans already parsed). */
export type Row = Record<string, string | number | boolean | null>;

export interface HistoryRow {
  year: number;
  id: string;
  dem: number;
  rep: number;
  total: number;
  margin: number | null;
  winnerParty: string;
  winner: string;
}

export interface HexFeature {
  d: string;
  cx: number;
  cy: number;
}

export interface HexMap {
  attribution: { name: string; url: string; license: string };
  viewBox: [number, number, number, number];
  districts: (HexFeature & { id: string; state: string })[];
  states: (HexFeature & { state: string })[];
}

export interface Source {
  name: string;
  url: string;
  license?: string;
  revision?: number;
  retrieved: string;
}

/** A published AI race summary (scripts/race-summaries.mjs), checked before publishing. */
export interface RaceSummary {
  id: string;
  summary: string;
  whatDecides: string;
  generatedAt: string;
  /** Build date of the data the summary was written from. */
  dataAsOf: string;
  /** The race's facts changed after the summary was written. */
  stale: boolean;
}

export interface Meta {
  generated: string;
  national_2024: { harris: number; trump: number; total: number; margin: number; note: string };
  counts: Record<string, number>;
  sources: Record<string, Source>;
  /** Current national environment from the generic-ballot averages, when available. */
  environment?: { margin: number; as_of: string; n_sources: number; sources: string[] };
  senate_composition?: {
    not_up: { D: number; R: number; I_D: number; other: number };
    current: { D: number; R: number; I_D: number };
    vice_president_party: string;
  };
}
