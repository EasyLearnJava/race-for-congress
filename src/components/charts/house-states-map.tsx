"use client";

// The House by state on a geographic map: each state colored by the share of its seats leaning
// Democratic (in the given categories), labeled with the expected split ("41–11"). The companion
// to the equal-area district map: easier to read at a glance, while the district map keeps every
// seat the same size. Same seven-step palette as the ratings, described in its own legend.
import type { ReactNode } from "react";

import type { RatingLabel } from "@/lib/data/types";
import { RATING_COLOR, ratingSide } from "@/lib/ratings";
import { LegendItem } from "./chart-frame";
import { TipRow, TipTitle } from "./tooltip";
import { useMeasure } from "./use-measure";
import { UsStateMap, US_MAP_CREDIT } from "./us-map";

export interface StateSeat {
  id: string;
  state: string;
  stateName: string;
}

/** Share of seats leaning Democratic (toss-ups count half) -> a color on the rating ramp. */
const BUCKETS: { min: number; color: string; label: string }[] = [
  { min: 0.85, color: RATING_COLOR["Safe D"], label: "D 85%+" },
  { min: 0.65, color: RATING_COLOR["Likely D"], label: "D 65–85%" },
  { min: 0.55, color: RATING_COLOR["Lean D"], label: "D 55–65%" },
  { min: 0.45, color: RATING_COLOR.Tossup, label: "Even" },
  { min: 0.35, color: RATING_COLOR["Lean R"], label: "R 55–65%" },
  { min: 0.15, color: RATING_COLOR["Likely R"], label: "R 65–85%" },
  { min: -1, color: RATING_COLOR["Safe R"], label: "R 85%+" },
];

export function stateSplits(seats: StateSeat[], categoryOf: (id: string) => RatingLabel | null) {
  const out = new Map<string, { name: string; d: number; r: number; t: number }>();
  for (const s of seats) {
    const c = categoryOf(s.id);
    if (!c) continue;
    const e = out.get(s.state) ?? { name: s.stateName, d: 0, r: 0, t: 0 };
    const side = ratingSide(c);
    if (side === "D") e.d++;
    else if (side === "R") e.r++;
    else e.t++;
    out.set(s.state, e);
  }
  return out;
}

export function HouseStatesMap({
  width: fixedWidth,
  seats,
  categoryOf,
  hrefFor,
  ariaLabel,
}: {
  /** Width in px; measured from the container when omitted. */
  width?: number;
  seats: StateSeat[];
  /** Category of a seat, or null to leave it out (e.g. outside the current filters). */
  categoryOf: (id: string) => RatingLabel | null;
  hrefFor: (state: string) => string;
  ariaLabel: string;
}) {
  const [ref, measured] = useMeasure<HTMLDivElement>();
  const width = fixedWidth ?? measured;
  const splits = stateSplits(seats, categoryOf);
  const colorOf = (st: string) => {
    const e = splits.get(st);
    if (!e) return null;
    const share = (e.d + e.t / 2) / (e.d + e.r + e.t);
    return BUCKETS.find((b) => share >= b.min)!.color;
  };
  if (fixedWidth == null && width <= 0) return <div ref={ref} className="w-full" />;
  const map = (
    <UsStateMap
      width={width}
      fill={colorOf}
      label={(st) => {
        const e = splits.get(st);
        return e ? `${e.d}–${e.r}` : null;
      }}
      hrefFor={(st) => (splits.has(st) ? hrefFor(st) : null)}
      ariaLabel={ariaLabel}
      tooltip={(st) => {
        const e = splits.get(st);
        if (!e) return <TipTitle>{st}</TipTitle>;
        return (
          <>
            <TipTitle>{e.name}</TipTitle>
            <TipRow color="var(--dem)" label="Lean Democratic" value={e.d} />
            <TipRow color="var(--rep)" label="Lean Republican" value={e.r} />
            {e.t > 0 && <TipRow color={RATING_COLOR.Tossup} label="Toss-up" value={e.t} />}
            <div className="mt-1 text-[11px] text-muted">Click for the state</div>
          </>
        );
      }}
    />
  );
  return fixedWidth == null ? (
    <div ref={ref} className="w-full">
      {map}
    </div>
  ) : (
    map
  );
}

/** Legend for the states view: what each color means, then the label format. */
export function HouseStatesLegend(): ReactNode {
  return (
    <>
      <span className="text-ink-2">Share of a state&apos;s seats leaning each way:</span>
      {BUCKETS.map((b) => (
        <LegendItem key={b.label} color={b.color} label={b.label} />
      ))}
      <span className="text-ink-2">Labels: Democratic–Republican seats.</span>
    </>
  );
}

export const HOUSE_STATES_CREDIT = US_MAP_CREDIT;
