// Slim shapes the simulator page passes from the server to its client components: only the
// fields the model reads plus the few the tables show.
import type { Party, RatingLabel } from "@/lib/data/types";
import type { ModelRace, SenateComposition } from "@/lib/model/engine";

export interface SimRace extends ModelRace {
  chamber: "house" | "senate";
  state: string;
  stateName: string;
  /** House: the notional holder. Senate: the incumbent's party. */
  heldBy: Party;
  /** The non-Republican side's candidate: the Democrat, or the independent where no Democrat runs. */
  left: string;
  rep: string;
  incumbent: string;
  rating: RatingLabel;
}

export interface PollRow {
  source: string;
  dates: string;
  updated: string;
  dem: number | null;
  rep: number | null;
  margin: number | null;
}

export interface Environment {
  margin: number;
  asOf: string;
  nSources: number;
  sources: string[];
}

export type Composition = SenateComposition;
