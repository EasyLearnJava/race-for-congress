// Pure counting for the redistricting page: which side each seat leans to on the new and old
// lines, notional flips, and per-state tallies. No model math here (that stays in
// src/lib/model); these are plain counts of the 2024 presidential vote.
import { REDRAWN_2026, STATE_BY_POSTAL } from "@/lib/data/states";
import type { HouseRace } from "@/lib/data/types";
import type { ModelRace } from "@/lib/model/engine";
import type { OldDistrict } from "./data";

/**
 * How a seat's lean is read: "pres" = who carried it in 2024 (a national R+1.65 year);
 * "even" = which side it favors when the national vote is tied (2024 margin minus the
 * national margin, i.e. the district lean).
 */
export type Basis = "pres" | "even";

export type Side = "D" | "R";

/** Seats within this many points of the national vote count as close. */
export const CLOSE_LEAN = 5;

export function sideOf(margin: number): Side | null {
  if (margin > 0) return "D";
  if (margin < 0) return "R";
  return null;
}

export interface DistrictInfo {
  id: string;
  state: string;
  race: HouseRace;
  /** The margin the basis reads (2024 presidential, or lean). */
  newMargin: number;
  newSide: Side | null;
  /** Notional holder when it is D or R. */
  held: Side | null;
  /** The holder differs from the side the new lines lean to. */
  flip: "toD" | "toR" | null;
  close: boolean;
  /** The same-numbered district on the 2024 lines, when loaded. */
  oldPres24: number | null;
  /** New minus old 2024 presidential margin (positive = more Democratic). */
  shift: number | null;
}

export interface StateTally {
  postal: string;
  name: string;
  seats: number;
  /** 2024 presidential margin statewide (sum of the new districts). */
  statewide: number | null;
  heldD: number;
  heldR: number;
  newD: number;
  newR: number;
  /** null when the 2024 lines are not loaded for this state. */
  oldD: number | null;
  oldR: number | null;
  flipsToD: number;
  flipsToR: number;
  closeNew: number;
  closeOld: number | null;
}

export function partyOf(p: string): Side | null {
  return p === "D" || p === "R" ? p : null;
}

export function describeDistricts(house: HouseRace[], old: OldDistrict[], basis: Basis): DistrictInfo[] {
  const redrawn = new Set(REDRAWN_2026);
  const oldById = new Map(old.map((o) => [o.id, o]));
  return house
    .filter((r) => redrawn.has(r.state))
    .map((race): DistrictInfo => {
      const newMargin = basis === "pres" ? race.pres24 : race.lean;
      const newSide = sideOf(newMargin);
      const held = partyOf(race.heldBy);
      const o = oldById.get(race.id);
      const flip = held && newSide && held !== newSide ? (newSide === "D" ? "toD" : "toR") : null;
      return {
        id: race.id,
        state: race.state,
        race,
        newMargin,
        newSide,
        held,
        flip,
        close: Math.abs(race.lean) < CLOSE_LEAN,
        oldPres24: o ? o.pres24 : null,
        shift: o ? Math.round((race.pres24 - o.pres24) * 100) / 100 : null,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
}

/** Does the 2024-lines table cover every redrawn state, district for district? */
export function oldCoverage(old: OldDistrict[]): { complete: boolean; states: string[] } {
  const counts = new Map<string, number>();
  for (const o of old) counts.set(o.state, (counts.get(o.state) ?? 0) + 1);
  const states = REDRAWN_2026.filter((s) => counts.get(s) === STATE_BY_POSTAL[s]?.seats);
  return { complete: states.length === REDRAWN_2026.length, states };
}

export function tallyStates(
  districts: DistrictInfo[],
  old: OldDistrict[],
  basis: Basis,
  nationalMargin: number,
  coveredStates: readonly string[],
): StateTally[] {
  const covered = new Set(coveredStates);
  return REDRAWN_2026.map((postal) => {
    const ds = districts.filter((d) => d.state === postal);
    const olds = covered.has(postal) ? old.filter((o) => o.state === postal) : null;
    const oldMargin = (o: OldDistrict) => (basis === "pres" ? o.pres24 : o.pres24 - nationalMargin);
    let harris = 0;
    let trump = 0;
    let total = 0;
    for (const d of ds) {
      harris += d.race.harris24 || 0;
      trump += d.race.trump24 || 0;
      total += d.race.total24 || 0;
    }
    return {
      postal,
      name: STATE_BY_POSTAL[postal]?.name ?? postal,
      seats: ds.length,
      statewide: total > 0 ? ((harris - trump) / total) * 100 : null,
      heldD: ds.filter((d) => d.held === "D").length,
      heldR: ds.filter((d) => d.held === "R").length,
      newD: ds.filter((d) => d.newSide === "D").length,
      newR: ds.filter((d) => d.newSide === "R").length,
      oldD: olds ? olds.filter((o) => sideOf(oldMargin(o)) === "D").length : null,
      oldR: olds ? olds.filter((o) => sideOf(oldMargin(o)) === "R").length : null,
      flipsToD: ds.filter((d) => d.flip === "toD").length,
      flipsToR: ds.filter((d) => d.flip === "toR").length,
      closeNew: ds.filter((d) => d.close).length,
      closeOld: olds ? olds.filter((o) => Math.abs(o.pres24 - nationalMargin) < CLOSE_LEAN).length : null,
    };
  }).sort((a, b) => b.seats - a.seats || a.name.localeCompare(b.name));
}

/** The model's view of a seat with nothing but its lean: no incumbent, no ratings, no ballot quirks. */
function bare(id: string, lean: number): ModelRace {
  return { id, lean, incumbentRunning: false, incumbentParty: "", special: "", ratingScore: 0, ratingCount: 0 };
}

/**
 * Two versions of the House for the finish-line comparison. Seats outside the nine states are
 * identical in both. Inside them, (a) the 2026 districts and (b) the 2024 districts, each with
 * lean only, so the lines are the only difference.
 */
export function mapsForComparison(
  house: HouseRace[],
  old: OldDistrict[],
  nationalMargin: number,
): { newMap: ModelRace[]; oldMap: ModelRace[] } {
  const redrawn = new Set(REDRAWN_2026);
  const unchanged = house.filter((r) => !redrawn.has(r.state));
  const newSeats = house.filter((r) => redrawn.has(r.state)).map((r) => bare(r.id, r.lean));
  const oldSeats = old.map((o) => bare(`${o.id}-2024`, o.pres24 - nationalMargin));
  return { newMap: [...unchanged, ...newSeats], oldMap: [...unchanged, ...oldSeats] };
}

/** "3 more lean D" / "2 more lean R" / "No change", the same template for both parties. */
export function netPhrase(net: number): string {
  if (net > 0) return `${net} more lean D`;
  if (net < 0) return `${-net} more lean R`;
  return "No change";
}

/** "D +3" / "R +2" / "Even" for a net seat count. */
export function netSeats(net: number): string {
  if (net > 0) return `D +${net}`;
  if (net < 0) return `R +${-net}`;
  return "Even";
}
