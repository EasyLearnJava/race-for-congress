import type { CallRace } from "@/lib/call";
import type { HouseRace } from "@/lib/data/types";
import type { ModelRace } from "@/lib/model/engine";

/** A seat in the deck: what its card shows, plus the fields the model reads. */
export type DeckRace = CallRace &
  ModelRace &
  Pick<HouseRace, "stateName" | "newLines" | "incumbent" | "openSeat" | "dem" | "rep" | "heldByMember" | "pres24" | "cook" | "ie" | "sabato"> & {
    /** Receipts of each party's nominee campaign (FEC), when matched. */
    raisedD: number | null;
    raisedR: number | null;
  };

export interface CallSources {
  ratingsAsOf: string | null;
  moneyAsOf: string | null;
  generated: string;
  ratingSources: string[];
}
