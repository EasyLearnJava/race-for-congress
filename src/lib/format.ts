// Formatting helpers shared by server and client code.
import type { Party } from "./data/types";

/** A margin in points as "D+3.2" / "R+3.2" / "Even". */
export function fmtMargin(margin: number | null | undefined, digits = 1): string {
  if (margin == null || Number.isNaN(margin)) return "—";
  if (Math.abs(margin) >= 99.5) return margin > 0 ? "D unopposed" : "R unopposed";
  const rounded = Number(Math.abs(margin).toFixed(digits));
  if (rounded === 0) return "Even";
  return `${margin > 0 ? "D" : "R"}+${rounded.toFixed(digits)}`;
}

/** A probability as a percentage, never claiming certainty. */
export function fmtProb(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return "—";
  if (p > 0.995) return ">99%";
  if (p < 0.005) return "<1%";
  return `${Math.round(p * 100)}%`;
}

export function fmtPct(share: number | null | undefined, digits = 1): string {
  if (share == null || Number.isNaN(share)) return "—";
  return `${share.toFixed(digits)}%`;
}

const integer = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
export function fmtNum(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "—" : integer.format(n);
}

const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
export function fmtCompact(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "—" : compact.format(n);
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return "—";
  return `${n < 0 ? "-" : ""}$${compact.format(Math.abs(n))}`;
}

const dateLong = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dateShort = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
/** "2026-10-09" -> "Oct 9, 2026" (or "Oct 9" when short). Dates are calendar dates, read as UTC. */
export function fmtDate(iso: string | null | undefined, short = false): string {
  if (!iso) return "—";
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return (short ? dateShort : dateLong).format(d);
}

export const PARTY_NAME: Record<string, string> = {
  D: "Democratic",
  R: "Republican",
  I: "Independent",
  L: "Libertarian",
  G: "Green",
  O: "Other",
  "": "None",
};

export function partyName(p: Party | string): string {
  return PARTY_NAME[p] ?? p;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "PA-07" -> "Pennsylvania's 7th district"; "AK-AL" -> "Alaska at-large". */
export function districtName(id: string, stateName: string): string {
  const num = id.slice(3);
  if (num === "AL") return `${stateName} at-large`;
  return `${stateName}'s ${ordinal(Number(num))} district`;
}

export function signed(n: number, digits = 1): string {
  const r = Number(n.toFixed(digits));
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}`;
}
