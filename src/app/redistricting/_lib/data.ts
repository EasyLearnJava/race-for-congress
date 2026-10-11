// Typed slices of the optional redistricting tables (pipeline/old_lines.py), shared by the
// server page and the client components. No data imports here: the page passes rows in.
//
// The generated JSON for these tables comes from a generic CSV reader, so a number can arrive
// as a number or as its text. Every field is read defensively and rows that do not parse are
// dropped instead of showing as zeros.
import type { OldLinesRow, Party, Row } from "@/lib/data/types";

/** One district in a redrawn state on the 2024 lines (what the page needs of OldLinesRow). */
export interface OldDistrict {
  id: string;
  state: string;
  /** 2024 presidential margin on the 2024 lines, D minus R, points. */
  pres24: number;
  heldBy: Party;
}

/** One point of the pipeline's uniform-swing seat curve for one redrawn state. */
export interface CurvePoint {
  state: string;
  env: number;
  seats: number;
  oldD: number;
  newD: number;
}

function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string" || v.trim() === "") return null;
  const n = Number(v.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v).trim();
}

const PARTIES = new Set(["D", "R", "I", "L", "G", "O", ""]);

/**
 * Old-lines districts for the given states. Prefers the 2024-lines table (oldLines); falls back
 * to the per-district comparison table (same-numbered seats) when only that one is loaded.
 */
export function oldDistricts(oldLines: OldLinesRow[], districts: Row[], states: readonly string[]): OldDistrict[] {
  const wanted = new Set(states);
  const fromOld: OldDistrict[] = [];
  for (const r of oldLines) {
    const pres24 = num(r.pres24);
    const id = str(r.id).toUpperCase();
    const state = str(r.state).toUpperCase() || id.slice(0, 2);
    if (pres24 == null || !id || !wanted.has(state)) continue;
    const held = str(r.heldBy).toUpperCase();
    fromOld.push({ id, state, pres24, heldBy: (PARTIES.has(held) ? held : "O") as Party });
  }
  if (fromOld.length) return fromOld;

  const fromDistricts: OldDistrict[] = [];
  for (const r of districts) {
    const pres24 = num(r.old_pres24_margin);
    const id = str(r.race_id).toUpperCase();
    const state = str(r.state).toUpperCase() || id.slice(0, 2);
    if (pres24 == null || !id || !wanted.has(state)) continue;
    const held = str(r.held_by).toUpperCase();
    fromDistricts.push({ id, state, pres24, heldBy: (PARTIES.has(held) ? held : "O") as Party });
  }
  return fromDistricts;
}

/** The pipeline's seat curve, cleaned. Rows missing any number are dropped. */
export function curvePoints(rows: Row[], states: readonly string[]): CurvePoint[] {
  const wanted = new Set(states);
  const out: CurvePoint[] = [];
  for (const r of rows) {
    const state = str(r.state).toUpperCase();
    const env = num(r.environment);
    const seats = num(r.seats);
    const oldD = num(r.old_D_seats);
    const newD = num(r.new_D_seats);
    if (!wanted.has(state) || env == null || seats == null || oldD == null || newD == null) continue;
    out.push({ state, env, seats, oldD, newD });
  }
  return out.sort((a, b) => a.state.localeCompare(b.state) || a.env - b.env);
}
