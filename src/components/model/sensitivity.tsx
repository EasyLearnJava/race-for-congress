"use client";

// How the chance of control changes with the national vote. One curve per chamber; the
// current setting and the finish line are marked. Clicking the plot (or using the arrow keys
// and Enter) sets the national vote to that point, so the whole site moves with it.
import { scaleLinear } from "d3-scale";
import { useMemo, useState } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { XAxis, YAxis } from "@/components/charts/axes";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { fmtMargin, fmtProb } from "@/lib/format";
import { thresholdCurve, type ModelRace } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";

const HEIGHT = 260;
const M = { top: 16, right: 16, bottom: 36, left: 44 };
const ENVS = Array.from({ length: 61 }, (_, i) => -15 + i * 0.5);

export interface CurveSpec {
  key: string;
  label: string;
  color: string;
  races: ModelRace[];
  /** Wins needed among these races (majority minus seats already held). */
  threshold: number;
  count?: "D" | "nonR";
}

export function SensitivityChart({ title, subtitle, curves, source }: { title: string; subtitle?: string; curves: CurveSpec[]; source?: string }) {
  const params = useModelParams();
  const series = useMemo(
    () =>
      curves.map((c) => ({
        ...c,
        points: thresholdCurve(c.races, params, c.threshold, ENVS, c.count ?? "D"),
      })),
    [curves, params],
  );

  const rows = ENVS.map((env, i) => ({
    env: fmtMargin(env),
    ...Object.fromEntries(series.map((s) => [s.key, s.points[i].p])),
  }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      height={HEIGHT}
      csvName="chance-of-control-by-national-vote"
      source={source}
      legend={series.length > 1 ? series.map((s) => <LegendItem key={s.key} color={s.color} label={s.label} shape="line" />) : undefined}
      table={{
        columns: [
          { key: "env", label: "National vote" },
          ...series.map((s) => ({ key: s.key, label: s.label, align: "right" as const, format: (v: unknown) => fmtProb(Number(v)) })),
        ],
        rows,
      }}
    >
      {(width) => <Plot width={width} series={series} />}
    </ChartFrame>
  );
}

function Plot({
  width,
  series,
}: {
  width: number;
  series: (CurveSpec & { points: { env: number; p: number }[] })[];
}) {
  const { params, set } = useScenario();
  const { tip, show, hide } = useTooltip();
  const [cursor, setCursor] = useState<number | null>(null);

  const x = scaleLinear().domain([-15, 15]).range([M.left, width - M.right]);
  const y = scaleLinear().domain([0, 1]).range([HEIGHT - M.bottom, M.top]);
  const path = (pts: { env: number; p: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${x(p.env).toFixed(1)},${y(p.p).toFixed(1)}`).join("");
  const crossing = (pts: { env: number; p: number }[]) => {
    for (let i = 1; i < pts.length; i++) {
      if (pts[i - 1].p < 0.5 && pts[i].p >= 0.5) {
        const f = (0.5 - pts[i - 1].p) / (pts[i].p - pts[i - 1].p);
        return pts[i - 1].env + f * (pts[i].env - pts[i - 1].env);
      }
    }
    return null;
  };

  const snap = (env: number) => Math.round(Math.min(15, Math.max(-15, env)) * 2) / 2;
  const tipAt = (env: number) => {
    const i = ENVS.indexOf(env);
    show(x(env), M.top + 4, (
      <>
        <TipTitle>National vote {fmtMargin(env)}</TipTitle>
        {series.map((s) => (
          <TipRow key={s.key} color={s.color} label={s.label} value={fmtProb(s.points[i]?.p)} />
        ))}
        <div className="mt-1 text-[11px] text-muted">Click to set the national vote here</div>
      </>
    ));
  };

  return (
    <>
      <svg
        width={width}
        height={HEIGHT}
        role="img"
        tabIndex={0}
        aria-label={`Chance of control by national vote. ${series.map((s) => `${s.label}: ${fmtProb(s.points[ENVS.indexOf(snap(params.env))]?.p)} at the current setting`).join("; ")}. Use arrow keys to move and Enter to set the national vote.`}
        className="cursor-crosshair outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const env = snap(x.invert(e.clientX - rect.left));
          setCursor(env);
          tipAt(env);
        }}
        onPointerLeave={() => {
          setCursor(null);
          hide();
        }}
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          set({ env: snap(x.invert(e.clientX - rect.left)) });
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
            e.preventDefault();
            const env = snap((cursor ?? params.env) + (e.key === "ArrowRight" ? 0.5 : -0.5));
            setCursor(env);
            tipAt(env);
          }
          if (e.key === "Enter" && cursor != null) set({ env: cursor });
        }}
      >
        <YAxis scale={y} ticks={[0, 0.25, 0.5, 0.75, 1]} x={M.left} x1={width - M.right} format={(v) => `${v * 100}%`} />
        <XAxis
          scale={x}
          ticks={[-15, -10, -5, 0, 5, 10, 15]}
          y={HEIGHT - M.bottom}
          x0={M.left}
          x1={width - M.right}
          format={(v) => fmtMargin(v, 0)}
          label="National vote (Democratic minus Republican)"
        />
        {series.map((s, index) => {
          const cross = crossing(s.points);
          return (
            <g key={s.key}>
              <path d={path(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              {cross != null && (
                <g>
                  <circle cx={x(cross)} cy={y(0.5)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
                  {/* Labels sit on the side with more room so they never run past the plot. */}
                  <text
                    x={x(cross) > width / 2 ? x(cross) - 7 : x(cross) + 7}
                    y={y(0.5) + 14 + index * 14}
                    textAnchor={x(cross) > width / 2 ? "end" : "start"}
                    className="fill-ink-2 text-[10px]"
                  >
                    {series.length > 1 ? `${s.label}: ` : ""}50% at {fmtMargin(cross)}
                  </text>
                </g>
              )}
            </g>
          );
        })}
        <line x1={x(params.env)} x2={x(params.env)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--ink)" strokeWidth={1.5} />
        <text x={x(params.env)} y={M.top - 4} textAnchor="middle" className="fill-ink text-[10px] font-semibold">
          Now {fmtMargin(params.env)}
        </text>
        {cursor != null && <line x1={x(cursor)} x2={x(cursor)} y1={M.top} y2={HEIGHT - M.bottom} stroke="var(--axis)" strokeWidth={1} />}
      </svg>
      <TooltipLayer tip={tip} width={width} height={HEIGHT} />
    </>
  );
}
