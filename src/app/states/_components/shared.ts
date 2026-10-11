// Pure helpers and slim row shapes shared by the /states pages (server and client safe).
import type { HouseRace, Party, RatingLabel, Row, SenateRace } from "@/lib/data/types";
import type { RaceProjection } from "@/lib/model/engine";
import { RATING_COLOR } from "@/lib/ratings";

/** The fields of a House race the states index needs: the model inputs plus a few labels. */
export type StateIndexRace = Pick<
  HouseRace,
  "id" | "state" | "lean" | "incumbentRunning" | "incumbentParty" | "special" | "ratingScore" | "ratingCount" | "rating" | "heldBy" | "newLines"
>;

export function slimRace(r: HouseRace): StateIndexRace {
  return {
    id: r.id,
    state: r.state,
    lean: r.lean,
    incumbentRunning: r.incumbentRunning,
    incumbentParty: r.incumbentParty,
    special: r.special,
    ratingScore: r.ratingScore,
    ratingCount: r.ratingCount,
    rating: r.rating,
    heldBy: r.heldBy,
    newLines: r.newLines,
  };
}

/** The Senate fields the states index shows. */
export type StateIndexSenate = Pick<
  SenateRace,
  "id" | "state" | "lean" | "incumbentRunning" | "incumbentParty" | "special" | "ratingScore" | "ratingCount" | "rating" | "specialElection"
>;

export function slimSenate(r: SenateRace): StateIndexSenate {
  return {
    id: r.id,
    state: r.state,
    lean: r.lean,
    incumbentRunning: r.incumbentRunning,
    incumbentParty: r.incumbentParty,
    special: r.special,
    ratingScore: r.ratingScore,
    ratingCount: r.ratingCount,
    rating: r.rating,
    specialElection: r.specialElection,
  };
}

/** Expected seats for each side over a set of House projections (sum of win chances). */
export function expectedSeats(projections: Iterable<RaceProjection | undefined>): { dem: number; rep: number; other: number } {
  let dem = 0;
  let rep = 0;
  let other = 0;
  for (const p of projections) {
    if (!p) continue;
    if (p.challenger === "D") dem += p.pWin;
    else other += p.pWin;
    rep += 1 - p.pWin;
  }
  return { dem, rep, other };
}

export function heldCounts(races: { heldBy: Party }[]): { dem: number; rep: number; other: number } {
  let dem = 0;
  let rep = 0;
  let other = 0;
  for (const r of races) {
    if (r.heldBy === "D") dem++;
    else if (r.heldBy === "R") rep++;
    else other++;
  }
  return { dem, rep, other };
}

/** Diverging category for an expected net seat change for Democrats, on the rating colors. */
export type NetBucket = "d2" | "d1" | "even" | "r1" | "r2";

export const NET_BUCKETS: { key: NetBucket; label: string; color: RatingLabel }[] = [
  { key: "d2", label: "Democrats +2 or more", color: "Likely D" },
  { key: "d1", label: "Democrats +1", color: "Lean D" },
  { key: "even", label: "No net change", color: "Tossup" },
  { key: "r1", label: "Republicans +1", color: "Lean R" },
  { key: "r2", label: "Republicans +2 or more", color: "Likely R" },
];

export function netBucket(net: number): NetBucket {
  const n = Math.round(net);
  if (n >= 2) return "d2";
  if (n === 1) return "d1";
  if (n === 0) return "even";
  if (n === -1) return "r1";
  return "r2";
}

export function netColor(net: number): string {
  return RATING_COLOR[NET_BUCKETS.find((b) => b.key === netBucket(net))!.color];
}

/** "+2", "−1", "0": a rounded net seat change with a true minus sign. */
export function fmtNet(net: number): string {
  const n = Math.round(net);
  if (n === 0) return "0";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** "+1.4 D", "+0.6 R", "No change": an expected net change named by the side that gains. */
export function fmtNetLong(net: number, digits = 1): string {
  const r = Number(Math.abs(net).toFixed(digits));
  if (r === 0) return "No change";
  return `${net > 0 ? "Democrats" : "Republicans"} +${r.toFixed(digits)}`;
}

/** "D +6.3", "R +0.6", "No change": the compact form for stat tiles. */
export function fmtNetShort(net: number, digits = 1): string {
  const r = Number(Math.abs(net).toFixed(digits));
  if (r === 0) return "No change";
  return `${net > 0 ? "D" : "R"} +${r.toFixed(digits)}`;
}

/** Read a number from a pipeline Row by column name (null when missing or not numeric). */
export function num(row: Row | null | undefined, key: string): number | null {
  const v = row?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

export function str(row: Row | null | undefined, key: string): string {
  const v = row?.[key];
  return v == null ? "" : String(v);
}
