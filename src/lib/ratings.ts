// Rating categories, their order and colors. Positive scores and margins favor Democrats.
import type { Party, RatingLabel } from "./data/types";

export const RATING_ORDER: RatingLabel[] = ["Safe D", "Likely D", "Lean D", "Tossup", "Lean R", "Likely R", "Safe R"];

/** CSS color (token) for each rating category. */
export const RATING_COLOR: Record<RatingLabel, string> = {
  "Safe D": "var(--r-safe-d)",
  "Likely D": "var(--r-likely-d)",
  "Lean D": "var(--r-lean-d)",
  Tossup: "var(--r-toss)",
  "Lean R": "var(--r-lean-r)",
  "Likely R": "var(--r-likely-r)",
  "Safe R": "var(--r-safe-r)",
};

/** Text color that stays readable on top of each rating fill. */
export const RATING_TEXT: Record<RatingLabel, string> = {
  "Safe D": "var(--r-safe-d-ink)",
  "Likely D": "var(--r-likely-d-ink)",
  "Lean D": "var(--r-lean-d-ink)",
  Tossup: "var(--r-toss-ink)",
  "Lean R": "var(--r-lean-r-ink)",
  "Likely R": "var(--r-likely-r-ink)",
  "Safe R": "var(--r-safe-r-ink)",
};

export const PARTY_COLOR: Record<string, string> = {
  D: "var(--dem)",
  R: "var(--rep)",
  I: "var(--ind)",
  L: "var(--r-toss)",
  G: "var(--r-toss)",
  O: "var(--r-toss)",
  "": "var(--r-toss)",
};

export function partyColor(p: Party | string): string {
  return PARTY_COLOR[p] ?? "var(--r-toss)";
}

/** Same thresholds as pipeline/build_races.py consensus_label. */
export function ratingFromScore(score: number): RatingLabel {
  const strength = Math.abs(score);
  if (strength < 0.5) return "Tossup";
  const word = strength >= 2.5 ? "Safe" : strength >= 1.5 ? "Likely" : "Lean";
  return `${word} ${score > 0 ? "D" : "R"}` as RatingLabel;
}

/** The model's own category from a win probability for the Democrat (or non-Republican side). */
export function ratingFromProb(pDem: number): RatingLabel {
  const p = Math.max(pDem, 1 - pDem);
  const side = pDem >= 0.5 ? "D" : "R";
  if (p < 0.6) return "Tossup";
  if (p < 0.8) return `Lean ${side}` as RatingLabel;
  if (p < 0.95) return `Likely ${side}` as RatingLabel;
  return `Safe ${side}` as RatingLabel;
}

export function ratingSide(r: RatingLabel): "D" | "R" | "T" {
  return r === "Tossup" ? "T" : (r.slice(-1) as "D" | "R");
}

export function isCompetitive(r: RatingLabel): boolean {
  return !r.startsWith("Safe");
}
