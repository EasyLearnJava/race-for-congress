// Small helpers shared by the Senate dashboard's client components. Pure: no hooks, no data.
import type { MoneyRow, OutsideRow, RatingLabel, SenateRace } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection, SenateComposition } from "@/lib/model/engine";
import { RATING_ORDER, ratingFromProb } from "@/lib/ratings";

/** What the server page hands the dashboard besides the races. */
export interface SenateComp extends SenateComposition {
  source: "pipeline" | "derived";
}

export interface SenateMoneySlice {
  money: MoneyRow[];
  outside: OutsideRow[];
}

/** Dem-caucus seats needed for control: 50 when the vice president is a Democrat, else 51. */
export function demThreshold(c: SenateComposition): number {
  return c.vicePresidentParty === "D" ? 50 : 51;
}

/** The candidate on the non-Republican side of the model's margin. */
export function challengerName(race: SenateRace, side: "D" | "I"): string {
  if (side === "D") return race.dem || "No Democrat";
  const ind = race.others
    .split(";")
    .map((s) => s.trim())
    .find((s) => /\(Independent\)$/.test(s));
  return ind ? ind.replace(/\s*\(Independent\)$/, "") : "Independent";
}

/** Expected margin with the right letter: "I+3.0" when the positive side is an independent. */
export function sideMargin(p: RaceProjection): string {
  const text = fmtMargin(p.margin);
  return p.challenger === "I" && p.margin > 0 ? text.replace(/^D/, "I") : text;
}

/** The favored side and its chance, e.g. "D 62%" or "R >99%". */
export function favoredText(p: RaceProjection): string {
  return p.pWin >= 0.5 ? `${p.challenger} ${fmtProb(p.pWin)}` : `R ${fmtProb(1 - p.pWin)}`;
}

/** The model's own category for a race in this scenario. */
export function modelCategory(p: RaceProjection | undefined, race: SenateRace): RatingLabel {
  return p ? ratingFromProb(p.pWin) : race.rating;
}

export const parseCategories = (raw: string): RatingLabel[] | undefined => {
  const list = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is RatingLabel => (RATING_ORDER as string[]).includes(s));
  return list.length ? list : undefined;
};

export const serializeCategories = (list: RatingLabel[]) => list.join(",");

/** "Alabama, Florida and Ohio". */
export function listNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
