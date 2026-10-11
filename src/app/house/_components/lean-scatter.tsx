"use client";

// Lean vs expected margin for the seats in view, colored by forecaster consensus. Dragging a
// rectangle selects those seats (ids in the URL); clicking a dot opens the district.
import { useMemo, type ReactNode } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { ScatterPlot, type ScatterPoint } from "@/components/charts/scatter-plot";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { fmtMargin, fmtNum, fmtProb } from "@/lib/format";
import { RATING_COLOR, RATING_ORDER } from "@/lib/ratings";
import { houseHref } from "@/lib/routes";
import { setIds } from "./filters";
import type { ExplorerRow } from "./types";

const HEIGHT = 380;
/** Widest axis: margins beyond it (one-party races, the safest seats) sit on the edge. */
const MAX = 50;
const MIN = 10;

/** A symmetric domain around zero that fits the values, in steps of 5 points, capped at MAX. */
function symmetric(values: number[]): number {
  let m = 0;
  for (const v of values) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  return Math.max(MIN, Math.min(MAX, Math.ceil((m + 1) / 5) * 5));
}

const clamp = (v: number, d: number) => Math.max(-d, Math.min(d, v));

export function LeanScatter({ rows, source }: { rows: ExplorerRow[]; source: ReactNode }) {
  const { href } = useScenario();
  const byId = useMemo(() => new Map(rows.map((r) => [r.race.id, r])), [rows]);

  const xMax = useMemo(() => symmetric(rows.map((r) => r.race.lean)), [rows]);
  const yMax = useMemo(() => symmetric(rows.map((r) => r.p.margin)), [rows]);
  const clipped = rows.filter((r) => Math.abs(r.race.lean) > xMax || Math.abs(r.p.margin) > yMax).length;

  const points = useMemo<ScatterPoint[]>(
    () =>
      rows.map((r) => ({
        id: r.race.id,
        x: clamp(r.race.lean, xMax),
        y: clamp(r.p.margin, yMax),
        color: RATING_COLOR[r.race.rating],
        label: r.race.id,
        href: href(houseHref(r.race.id)),
      })),
    [rows, xMax, yMax, href],
  );

  // Name the few closest seats (rows arrive closest first); labels that would collide are skipped.
  const labelIds = useMemo(() => rows.slice(0, 4).map((r) => r.race.id), [rows]);

  return (
    <ChartFrame
      title="District lean vs the model's expected margin"
      subtitle={
        <>
          Each dot is a seat in view, colored by forecaster consensus. Seats above the line are expected to go Democratic, below it
          Republican. Drag a rectangle to select seats; click a dot to open it.
          {clipped > 0 && ` ${fmtNum(clipped)} ${clipped === 1 ? "seat" : "seats"} beyond the axes sit on the edge.`}
        </>
      }
      legend={RATING_ORDER.map((r) => (
        <LegendItem key={r} color={RATING_COLOR[r]} label={r} shape="dot" />
      ))}
      height={HEIGHT}
      className="h-full"
      csvName="house-explorer-lean-vs-margin"
      table={{
        columns: [
          { key: "id", label: "Seat" },
          { key: "state", label: "State" },
          { key: "lean", label: "Lean", align: "right", format: (v) => fmtMargin(v as number) },
          { key: "margin", label: "Expected margin", align: "right", format: (v) => fmtMargin(v as number) },
          { key: "chance", label: "Chance D", align: "right", format: (v) => fmtProb(v as number) },
          { key: "consensus", label: "Consensus" },
        ],
        rows: rows.map((r) => ({
          id: r.race.id,
          state: r.race.stateName,
          lean: r.race.lean,
          margin: Number(r.p.margin.toFixed(2)),
          chance: Number(r.p.pWin.toFixed(4)),
          consensus: r.race.rating,
        })),
      }}
      source={source}
    >
      {(width) => (
        <ScatterPlot
          width={width}
          height={HEIGHT}
          points={points}
          xDomain={[-xMax, xMax]}
          yDomain={[-yMax, yMax]}
          xReverse
          xLabel="District lean (2024 presidential margin minus national)"
          yLabel="Expected margin in this scenario"
          xFormat={(v) => (v === 0 ? "Even" : fmtMargin(v, 0))}
          yFormat={(v) => (v === 0 ? "Even" : fmtMargin(v, 0))}
          refLines={[{ x: 0 }, { y: 0, label: "Even" }]}
          labelIds={labelIds}
          brushable
          onBrush={(ids) => {
            if (ids && ids.length) setIds(ids);
          }}
          ariaLabel={`Scatter plot of ${rows.length} seats: district lean against the model's expected margin`}
          tooltip={(pt) => {
            const r = byId.get(pt.id);
            if (!r) return <TipTitle>{pt.id}</TipTitle>;
            return (
              <>
                <TipTitle>
                  {r.race.id} · {r.race.stateName}
                </TipTitle>
                <TipRow label="District lean" value={fmtMargin(r.race.lean)} />
                <TipRow label="Expected margin" value={fmtMargin(r.p.margin)} />
                <TipRow color="var(--dem)" label="Democrat wins" value={fmtProb(r.p.pWin)} />
                <TipRow color={RATING_COLOR[r.race.rating]} label="Forecasters" value={r.race.rating} />
                <div className="mt-1 text-[11px] text-muted">Click to open the district</div>
              </>
            );
          }}
        />
      )}
    </ChartFrame>
  );
}
