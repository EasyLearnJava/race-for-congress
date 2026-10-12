// "Make your call": the user's own House call. Pure and deterministic, shared by the page,
// its metadata and the share image so all three always show the same count.
//
// The deck is every seat the forecaster consensus rates Lean D, Toss-up or Lean R. Every other
// seat starts from who is on the ballot, then from the consensus rating (Likely and Safe seats
// go to that side). Picks live in the URL by district id, never by deck position, so a shared
// link still reads correctly after ratings move a seat in or out of the deck.
import type { HouseRace, RatingLabel } from "./data/types";
import { forcedWinner } from "./model/engine";

export type Choice = "D" | "T" | "R";
export type Picks = ReadonlyMap<string, Choice>;

export const HOUSE_SEATS = 435;
export const MAJORITY = 218;

const DECK_RATINGS: ReadonlySet<RatingLabel> = new Set(["Lean D", "Tossup", "Lean R"]);

/** The fields of a race the call reads. */
export type CallRace = Pick<HouseRace, "id" | "rating" | "ratingScore" | "special" | "heldBy">;

export function inDeck(race: CallRace): boolean {
  return !forcedWinner(race) && DECK_RATINGS.has(race.rating);
}

/** Deck order: closest consensus first, then district id. Symmetric for both parties. */
export function buildDeck<T extends CallRace>(races: readonly T[]): T[] {
  return races.filter(inDeck).sort((a, b) => Math.abs(a.ratingScore) - Math.abs(b.ratingScore) || a.id.localeCompare(b.id));
}

/** The forecaster consensus for a seat (Lean goes to its side); where seats outside the deck start. */
export function baselinePick(race: CallRace): Choice {
  const forced = forcedWinner(race);
  if (forced) return forced;
  if (race.rating === "Tossup") return "T";
  return race.rating.endsWith("D") ? "D" : "R";
}

export interface Tally {
  D: number;
  R: number;
  /** Seats the user marked Toss-up. */
  T: number;
  /** Deck seats not called yet. */
  open: number;
  /** Seats each party gains from the other, against who holds the seat today. */
  gainsD: number;
  gainsR: number;
  winner: "D" | "R" | null;
}

/**
 * Count the House under a set of picks. Seats outside the deck use their baseline unless the
 * user picked them (a shared link may carry a seat that has since left the deck).
 */
export function tally(races: readonly CallRace[], picks: Picks): Tally {
  const t: Tally = { D: 0, R: 0, T: 0, open: 0, gainsD: 0, gainsR: 0, winner: null };
  for (const race of races) {
    const pick = picks.get(race.id) ?? (inDeck(race) ? null : baselinePick(race));
    if (pick === null) {
      t.open++;
      continue;
    }
    t[pick]++;
    if (pick === "D" && race.heldBy === "R") t.gainsD++;
    if (pick === "R" && race.heldBy === "D") t.gainsR++;
  }
  t.winner = t.D >= MAJORITY ? "D" : t.R >= MAJORITY ? "R" : null;
  return t;
}

const PARTY = { D: "Democrats", R: "Republicans" } as const;

/** One neutral sentence; both parties share every template. */
export function callHeadline(t: Tally): string {
  if (t.winner) {
    const n = t[t.winner];
    const spare = n - MAJORITY;
    return `${PARTY[t.winner]} win ${n} seats, ${spare === 0 ? "exactly the 218 needed" : `${spare} more than the 218 needed`}.`;
  }
  const undecided = t.T + t.open;
  return `No majority yet: Democrats ${t.D}, Republicans ${t.R}, ${undecided} seat${undecided === 1 ? "" : "s"} undecided.`;
}

/** Seats each party still needs from the deck to reach 218, before any picks. */
export function seatsNeeded(races: readonly CallRace[]): { D: number; R: number; deck: number } {
  const base = tally(races, new Map());
  return { D: Math.max(0, MAJORITY - base.D), R: Math.max(0, MAJORITY - base.R), deck: base.open };
}

// URL encoding: d=az01.ca13&t=ny17&r=pa07. "AZ-01" <-> "az01", "AK-AL" <-> "akal".
export const PICK_KEYS = { D: "d", T: "t", R: "r" } as const;

export const shortId = (id: string) => id.replace("-", "").toLowerCase();
export const longId = (short: string) => `${short.slice(0, 2)}-${short.slice(2)}`.toUpperCase();

export function encodePicks(picks: Picks): Record<string, string | null> {
  const out: Record<string, string[]> = { d: [], t: [], r: [] };
  for (const [id, pick] of [...picks].sort(([a], [b]) => a.localeCompare(b))) out[PICK_KEYS[pick]].push(shortId(id));
  return Object.fromEntries(Object.entries(out).map(([k, ids]) => [k, ids.length ? ids.join(".") : null]));
}

/** Read picks from search params, keeping only ids in `valid`. A later key wins on duplicates. */
export function decodePicks(get: (key: string) => string | null | undefined, valid: ReadonlySet<string>): Map<string, Choice> {
  const picks = new Map<string, Choice>();
  for (const pick of ["D", "T", "R"] as const) {
    const raw = get(PICK_KEYS[pick]);
    if (!raw) continue;
    for (const s of raw.split(".")) {
      const id = longId(s.trim());
      if (/^[A-Z]{2}-(\d{2}|AL)$/.test(id) && valid.has(id)) picks.set(id, pick);
    }
  }
  return picks;
}

/** Query string for a call (no leading "?"), for share links and image URLs. */
export function picksQuery(picks: Picks, extra: Record<string, string> = {}): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(encodePicks(picks))) if (v) params.set(k, v);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  return params.toString();
}
