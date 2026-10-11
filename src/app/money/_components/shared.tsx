"use client";

// Small helpers shared by the /money components.
import type { MoneyRace, SideMoney } from "./types";

export type ChamberFilter = "all" | "house" | "senate";
export const parseChamber = (raw: string): ChamberFilter | undefined =>
  raw === "house" || raw === "senate" || raw === "all" ? raw : undefined;

export type Metric = "raised" | "spent" | "cash";
export const parseMetric = (raw: string): Metric | undefined => (raw === "raised" || raw === "spent" || raw === "cash" ? raw : undefined);

export const METRIC_LABEL: Record<Metric, string> = {
  raised: "Raised",
  spent: "Spent",
  cash: "Cash on hand",
};

export function sideValue(side: SideMoney | null | undefined, metric: Metric): number | null {
  return side ? side[metric] : null;
}

/** Sum of a metric across every nominee in a race (0 when nothing is reported). */
export function candidateTotal(race: MoneyRace, metric: Metric): number {
  const c = race.candidates;
  if (!c) return 0;
  return (sideValue(c.dem, metric) ?? 0) + (sideValue(c.rep, metric) ?? 0) + (sideValue(c.other, metric) ?? 0);
}

/**
 * The race's non-Republican side for comparisons with the model: the Democrat, or the
 * independent in races where no Democrat runs (the model's positive side).
 */
export function challengerSide(race: MoneyRace): SideMoney | null {
  const c = race.candidates;
  if (!c) return null;
  return race.challenger === "I" ? c.other : c.dem;
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-line p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap ${value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** A dollar gap in millions with the side ahead: "D +$2.5M", "R +$800K", "Even". */
export function fmtGap(millions: number): string {
  const abs = Math.abs(millions);
  if (abs < 0.0005) return "Even";
  const text = abs >= 1 ? `$${(Math.round(abs * 10) / 10).toString()}M` : `$${Math.round(abs * 1000)}K`;
  return `${millions > 0 ? "D" : "R"} +${text}`;
}

/** Axis ticks for a gap in millions: "D $2M", "R $2M", "0". */
export function fmtGapTick(millions: number): string {
  const abs = Math.abs(millions);
  if (abs < 1e-9) return "0";
  const text = abs >= 1 ? `$${Number(abs.toFixed(1))}M` : `$${Math.round(abs * 1000)}K`;
  return `${millions > 0 ? "D" : "R"} ${text}`;
}
