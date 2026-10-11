import type { HouseRace, RatingLabel } from "@/lib/data/types";
import type { RaceProjection } from "@/lib/model/engine";

/** A filtered seat with its projection in the current scenario. */
export interface ExplorerRow {
  race: HouseRace;
  p: RaceProjection;
  /** The model's category for this seat in the current scenario. */
  category: RatingLabel;
}
