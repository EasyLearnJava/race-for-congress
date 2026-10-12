"use client";

// Lean vs expected margin for the seats in view, colored by forecaster consensus. The plot reads
// like a map of the battlefield: blue where Democrats are favored, red where Republicans are, the
// two crossover corners labeled, and a dashed line for what the district's lean and the national
// vote alone would say (distance from it is incumbency and the forecasters). It opens zoomed on the
// close races. Dragging a rectangle selects seats (ids in the URL); clicking a dot opens the district.
import { useMemo, useState, type ReactNode } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { ScatterPlot, type ScatterPoint } from "@/components/charts/scatter-plot";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { Segmented } from "@/components/ui/segmented";
import { fmtMargin, fmtNum, fmtProb } from "@/lib/format";
import { RATING_COLOR, RATING_ORDER } from "@/lib/ratings";
import { houseHref } from "@/lib/routes";
import { setIds } from "./filters";
import type { ExplorerRow } from "./types";

const HEIGHT = 420;
/** "Close races": both axes run ±25 points; "All seats" fits the data up to ±50. */
const CLOSE = 25;
const MAX = 50;
const MIN = 10;

function symmetric(values: number[]): number {
  let m = 0;
  for (const v of values) if (Number.isFinite(v)) m = Math.max(m, Math.abs(v));
  return Math.max(MIN, Math.min(MAX, Math.ceil((m + 1) / 5) * 5));
}

const clamp = (v: number, d: number) => Math.max(-d, Math.min(d, v));

export function LeanScatter({ rows, source }: { rows: ExplorerRow[]; source: ReactNode }) {
  const { href, params } = useScenario();
  const [zoom, setZoom] = useState<"close" | "all">("close");
  const byId = useMemo(() => new Map(rows.map((r) => [r.race.id, r])), [rows]);

  const xMax = useMemo(() => (zoom === "close" ? CLOSE : symmetric(rows.map((r) => r.race.lean))), [rows, zoom]);
  const yMax = useMemo(() => (zoom === "close" ? CLOSE : symmetric(rows.map((r) => r.p.margin))), [rows, zoom]);
  const hidden = rows.filter((r) => Math.abs(r.race.lean) > xMax || Math.abs(r.p.margin) > yMax).length;

  const points = useMemo<ScatterPoint[]>(
    () =>
      rows
        // Zoomed in, seats beyond the axes are left out rather than piled on the edges.
        .filter((r) => zoom === "all" || (Math.abs(r.race.lean) <= xMax && Math.abs(r.p.margin) <= yMax))
        .map((r) => ({
          id: r.race.id,
          x: clamp(r.race.lean, xMax),
          y: clamp(r.p.margin, yMax),
          color: RATING_COLOR[r.race.rating],
          label: r.race.id,
          href: href(houseHref(r.race.id)),
        })),
    [rows, xMax, yMax, href, zoom],
  );

  // Name the closest seats (rows arrive closest first); labels that would collide are skipped.
  const labelIds = useMemo(() => rows.slice(0, zoom === "close" ? 6 : 4).map((r) => r.race.id), [rows, zoom]);
  const env = params.env;

  return (
    <ChartFrame
      title="Where every seat stands"
      subtitle={
        <>
          Left to right: how the district voted for president in 2024 compared with the nation. Bottom to top: the model&apos;s expected
          margin at a national vote of {fmtMargin(env)}. Dots are colored by forecaster consensus; drag to select, click to open.
          {hidden > 0 && zoom === "close" && ` ${fmtNum(hidden)} safer ${hidden === 1 ? "seat is" : "seats are"} outside this view: choose All seats.`}
          {hidden > 0 && zoom === "all" && ` ${fmtNum(hidden)} ${hidden === 1 ? "seat" : "seats"} beyond the axes sit on the edge.`}
        </>
      }
      actions={
        <Segmented
          label="Zoom"
          size="xs"
          value={zoom}
          onChange={setZoom}
          options={[
            { value: "close", label: "Close races" },
            { value: "all", label: "All seats" },
          ]}
        />
      }
      legend={
        <>
          {RATING_ORDER.map((r) => (
            <LegendItem key={r} color={RATING_COLOR[r]} label={r} shape="dot" />
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dashed border-ink-2" />
            Lean + national vote alone
          </span>
        </>
      }
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
          xLabel="District lean (2024 vote vs. the nation)"
          yLabel={`Expected margin at ${fmtMargin(env)}`}
          xFormat={(v) => (v === 0 ? "Even" : fmtMargin(v, 0))}
          yFormat={(v) => (v === 0 ? "Even" : fmtMargin(v, 0))}
          refLines={[{ x: 0 }, { y: 0 }]}
          labelIds={labelIds}
          brushable
          onBrush={(ids) => {
            if (ids && ids.length) setIds(ids);
          }}
          ariaLabel={`Scatter plot of ${points.length} seats: district lean against the model's expected margin`}
          underlay={({ x, y, plot }) => {
            const zeroY = y(0);
            const zeroX = x(0);
            // Lean + national vote alone (no incumbency, no forecasters): margin = lean + env.
            const lo = -xMax;
            const hi = xMax;
            const pad = 8;
            const small = { fontSize: 10, fontWeight: 600, letterSpacing: "0.06em" } as const;
            return (
              <>
                <rect x={plot.x0} y={plot.y0} width={plot.x1 - plot.x0} height={zeroY - plot.y0} fill="var(--dem)" fillOpacity={0.07} />
                <rect x={plot.x0} y={zeroY} width={plot.x1 - plot.x0} height={plot.y1 - zeroY} fill="var(--rep)" fillOpacity={0.07} />
                <line x1={x(lo)} y1={y(lo + env)} x2={x(hi)} y2={y(hi + env)} stroke="var(--ink-2)" strokeWidth={1.25} strokeDasharray="5 4" opacity={0.7} />
                <text x={plot.x0 + pad} y={plot.y0 + pad} dy="0.8em" fill="var(--dem)" style={small}>
                  DEMOCRATS FAVORED
                </text>
                <text x={plot.x1 - pad} y={plot.y1 - pad} textAnchor="end" fill="var(--rep)" style={small}>
                  REPUBLICANS FAVORED
                </text>
                {/* Crossover corners (same wording for both parties), when there is room for them. */}
                {plot.x1 - plot.x0 >= 480 && (
                  <>
                    <text x={plot.x1 - pad} y={plot.y0 + pad} dy="0.8em" textAnchor="end" fill="var(--ink-2)" style={{ fontSize: 10 }}>
                  Leans Republican, Democrats favored
                </text>
                <text x={plot.x0 + pad} y={plot.y1 - pad} fill="var(--ink-2)" style={{ fontSize: 10 }}>
                  Leans Democratic, Republicans favored
                </text>
                  </>
                )}
                <line x1={zeroX} y1={plot.y0} x2={zeroX} y2={plot.y1} stroke="var(--axis)" strokeWidth={1} />
              </>
            );
          }}
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
                <TipRow label="Lean + national vote alone" value={fmtMargin(r.race.lean + env)} />
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
