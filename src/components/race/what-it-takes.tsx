"use client";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { LineChart, type LineRefLine } from "@/components/charts/line-chart";
import { useScenario } from "@/components/scenario/scenario";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { fmtSideMargin } from "./race-utils";
import { CURVE_MAX, CURVE_MIN, type CurvePoint } from "./use-race-model";

const HEIGHT = 280;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function WhatItTakes({
  raceId,
  curve,
  projection,
  flipPoint,
  env,
  className = "",
}: {
  raceId: string;
  curve: CurvePoint[];
  projection: RaceProjection;
  flipPoint: number | null;
  env: number;
  className?: string;
}) {
  const { set } = useScenario();
  const ind = projection.challenger === "I";
  const side = ind ? "independent" : "Democrat";
  const color = ind ? "var(--ind)" : "var(--dem)";

  const refLines: LineRefLine[] = [{ y: 0.5 }, { x: env, label: `Now ${fmtMargin(env)}`, strong: true }];
  const flipInView = flipPoint != null && flipPoint >= CURVE_MIN && flipPoint <= CURVE_MAX;
  if (flipInView) refLines.push({ x: flipPoint, label: `Flip ${fmtMargin(flipPoint)}` });

  let subtitle: string;
  if (projection.forced) {
    subtitle = "Who is on the ballot decides this race, so the chance stays flat at any national vote.";
  } else if (flipPoint == null || !flipInView) {
    subtitle = `The ${side}'s chance at every national vote from R+15 to D+15. The race does not flip inside this range${flipPoint != null ? ` (flip point ${fmtMargin(flipPoint)})` : ""}. Click the chart to set the national vote.`;
  } else {
    subtitle = `The ${side}'s chance at every national vote from R+15 to D+15. The race is a coin flip at ${fmtMargin(flipPoint)}. Click the chart to set the national vote there.`;
  }

  return (
    <ChartFrame
      className={className}
      title="What it takes"
      subtitle={subtitle}
      legend={
        <>
          <LegendItem shape="line" color={color} label={`Chance the ${side} wins`} />
          <LegendItem shape="line" color="var(--ink)" label="Current national vote" />
        </>
      }
      height={HEIGHT}
      csvName={`${raceId.toLowerCase()}-chance-by-national-vote`}
      table={{
        columns: [
          { key: "env", label: "National vote (D-R, points)", align: "right", format: (v) => fmtMargin(v as number) },
          { key: "p", label: `Chance the ${side} wins`, align: "right", format: (v) => fmtProb(v as number) },
          { key: "margin", label: "Expected margin", align: "right", format: (v) => fmtSideMargin(v as number, projection.challenger) },
        ],
        rows: curve.map((c) => ({ env: c.env, p: Number(c.p.toFixed(4)), margin: Number(c.margin.toFixed(2)) })),
      }}
      source="Model: the race's expected margin moves one point for every point of national vote; the chance includes national and race-level error."
    >
      {(w) => (
        <LineChart
          width={w}
          height={HEIGHT}
          series={[{ key: "chance", label: `${side[0].toUpperCase()}${side.slice(1)} wins`, color, area: true, points: curve.map((c) => [c.env, c.p] as const) }]}
          xDomain={[CURVE_MIN, CURVE_MAX]}
          yDomain={[0, 1]}
          xFormat={(x) => fmtMargin(x)}
          xTickFormat={(x) => fmtMargin(x, 0)}
          yFormat={fmtProb}
          yTickFormat={pct}
          xLabel="National vote"
          refLines={refLines}
          marker={{ x: env, label: fmtProb(projection.pWin) }}
          onXClick={(x) => set({ env: x })}
          endLabels={false}
          ariaLabel={`Chance the ${side} wins ${raceId} at each national vote from R+15 to D+15. Currently ${fmtProb(projection.pWin)} at ${fmtMargin(env)}.`}
        />
      )}
    </ChartFrame>
  );
}
