"use client";

// Probability of every possible seat count. Columns at or above the majority wear the
// Democratic color, the rest the Republican color. Clicking a column (or pressing Enter on
// the keyboard cursor) asks the caller to explore that outcome.
import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";

import { ChartFrame } from "@/components/charts/chart-frame";
import { XAxis, YAxis, barPath } from "@/components/charts/axes";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "@/components/charts/tooltip";
import type { SeatDistribution } from "@/lib/model/engine";
import { quantile } from "@/lib/model/engine";
import { fmtProb } from "@/lib/format";

const HEIGHT = 240;
const M = { top: 22, right: 12, bottom: 34, left: 44 };

export function SeatDistributionChart({
  title,
  subtitle,
  dist,
  majority,
  seatLabel,
  source,
  onSelect,
  csvName,
}: {
  title: string;
  subtitle?: string;
  dist: SeatDistribution;
  majority: number;
  /** e.g. "Democratic seats" */
  seatLabel: string;
  source?: string;
  /** Called with a seat count when a column is chosen. */
  onSelect?: (seats: number) => void;
  csvName: string;
}) {
  const rows = useMemo(
    () =>
      dist.pmf
        .map((p, k) => ({ seats: k, probability: p, atLeast: dist.pmf.slice(k).reduce((s, x) => s + x, 0) }))
        .filter((r) => r.probability >= 0.0005),
    [dist],
  );

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      height={HEIGHT}
      csvName={csvName}
      source={source}
      table={{
        columns: [
          { key: "seats", label: seatLabel, align: "right" },
          { key: "probability", label: "Chance of exactly this many", align: "right", format: (v) => fmtProb(Number(v)) },
          { key: "atLeast", label: "Chance of at least this many", align: "right", format: (v) => fmtProb(Number(v)) },
        ],
        rows,
      }}
    >
      {(width) => <Plot width={width} dist={dist} rows={rows} majority={majority} seatLabel={seatLabel} onSelect={onSelect} />}
    </ChartFrame>
  );
}

function Plot({
  width,
  dist,
  rows,
  majority,
  seatLabel,
  onSelect,
}: {
  width: number;
  dist: SeatDistribution;
  rows: { seats: number; probability: number; atLeast: number }[];
  majority: number;
  seatLabel: string;
  onSelect?: (seats: number) => void;
}) {
  const { tip, show, hide } = useTooltip();
  const [cursor, setCursor] = useState<number | null>(null);
  if (!rows.length) return null;

  const lo = Math.min(rows[0].seats, majority) - 2;
  const hi = Math.max(rows[rows.length - 1].seats, majority) + 2;
  const x = scaleLinear().domain([lo - 0.5, hi + 0.5]).range([M.left, width - M.right]);
  const maxP = Math.max(...rows.map((r) => r.probability));
  const y = scaleLinear().domain([0, maxP * 1.1]).nice().range([HEIGHT - M.bottom, M.top]);
  const slot = x(1) - x(0);
  const barW = Math.max(1, Math.min(24, slot - (slot > 4 ? 2 : 0.5)));
  const median = quantile(dist, 0.5);
  const ticks = x.ticks(Math.max(3, Math.floor(width / 70))).filter(Number.isInteger);

  const describe = (r: (typeof rows)[number]) => (
    <>
      <TipTitle>
        {r.seats} {seatLabel.toLowerCase()}
      </TipTitle>
      <TipRow label="Chance of exactly this" value={fmtProb(r.probability)} />
      <TipRow label="Chance of at least this" value={fmtProb(r.atLeast)} />
      {onSelect && <div className="mt-1 text-[11px] text-muted">Click to explore this outcome</div>}
    </>
  );

  const active = cursor == null ? null : rows.find((r) => r.seats === cursor);

  return (
    <>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        aria-label={`Distribution of ${seatLabel.toLowerCase()}. Median ${median}; ${majority} needed for a majority. Use the left and right arrow keys to step through outcomes${onSelect ? " and Enter to explore one" : ""}.`}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
            e.preventDefault();
            const i = cursor == null ? rows.findIndex((r) => r.seats === median) : rows.findIndex((r) => r.seats === cursor);
            const next = rows[Math.max(0, Math.min(rows.length - 1, i + (e.key === "ArrowRight" ? 1 : -1)))];
            setCursor(next.seats);
            show(x(next.seats), y(next.probability), describe(next));
          }
          if (e.key === "Enter" && cursor != null) onSelect?.(cursor);
          if (e.key === "Escape") {
            setCursor(null);
            hide();
          }
        }}
        onBlur={() => {
          setCursor(null);
          hide();
        }}
        className="outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        <YAxis scale={y} ticks={y.ticks(4)} x={M.left} x1={width - M.right} format={(v) => `${Math.round(v * 100)}%`} />
        {rows.map((r) => {
          const cx = x(r.seats);
          const top = y(r.probability);
          const h = HEIGHT - M.bottom - top;
          const isActive = active?.seats === r.seats;
          return (
            <g key={r.seats}>
              <path
                d={barPath(cx - barW / 2, top, barW, h, "up", Math.min(4, barW / 2))}
                fill={r.seats >= majority ? "var(--dem)" : "var(--rep)"}
                opacity={active && !isActive ? 0.45 : 1}
              />
              {/* Full-height transparent hit target: easier than aiming at a thin column. */}
              <rect
                x={cx - slot / 2}
                y={M.top}
                width={slot}
                height={HEIGHT - M.top - M.bottom}
                fill="transparent"
                className={onSelect ? "cursor-pointer" : undefined}
                onPointerMove={() => show(cx, top, describe(r))}
                onPointerLeave={hide}
                onClick={() => onSelect?.(r.seats)}
              />
            </g>
          );
        })}
        <line x1={x(majority - 0.5)} x2={x(majority - 0.5)} y1={M.top - 8} y2={HEIGHT - M.bottom} stroke="var(--ink)" strokeWidth={1.5} />
        <text x={x(majority - 0.5)} y={M.top - 11} textAnchor="middle" className="fill-ink text-[10px] font-semibold">
          {majority} for a majority
        </text>
        <XAxis scale={x} ticks={ticks} y={HEIGHT - M.bottom} x0={M.left} x1={width - M.right} label={seatLabel} />
      </svg>
      <TooltipLayer tip={tip} width={width} height={HEIGHT} />
    </>
  );
}
