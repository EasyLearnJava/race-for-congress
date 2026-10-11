"use client";

import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import { useScenario } from "@/components/scenario/scenario";
import { Card, Empty, SectionTitle } from "@/components/ui/primitives";
import { STATE_BY_POSTAL } from "@/lib/data/states";
import { fmtMargin } from "@/lib/format";
import { useModelParams } from "@/lib/model/use-outlook";
import type { CurvePoint } from "../_lib/data";

const NEW_COLOR = "var(--m-5)";
const OLD_COLOR = "var(--m-2)";
const HEIGHT = 240;

/**
 * The pipeline's uniform-swing curve: seats Democrats carry in the redrawn states on the old and
 * the new lines if every district moved with the national vote. For all nine states or one.
 */
export function SeatCurve({
  curve,
  state,
  source,
  actions,
}: {
  curve: CurvePoint[];
  state: string | null;
  source: string;
  /** Controls in the frame's header (e.g. the state picker). */
  actions?: ReactNode;
}) {
  const { href, set } = useScenario();
  const params = useModelParams();

  const data = useMemo(() => {
    const rows = state ? curve.filter((c) => c.state === state) : curve;
    const byEnv = new Map<number, { env: number; seats: number; oldD: number; newD: number }>();
    for (const c of rows) {
      const cur = byEnv.get(c.env) ?? { env: c.env, seats: 0, oldD: 0, newD: 0 };
      cur.seats += c.seats;
      cur.oldD += c.oldD;
      cur.newD += c.newD;
      byEnv.set(c.env, cur);
    }
    return [...byEnv.values()].sort((a, b) => a.env - b.env);
  }, [curve, state]);

  const scope = state ? (STATE_BY_POSTAL[state]?.name ?? state) : "the nine redrawn states";

  if (!data.length) {
    return (
      <Card>
        <SectionTitle title="Seats by national vote, old lines vs new" />
        <Empty title="Seat curve not loaded yet">
          This chart reads the redistricting seat curve from the <code className="text-xs">old_lines</code> pipeline step (2024
          presidential results on both sets of lines).{" "}
          <Link href={href("/data")} className="font-medium underline underline-offset-2">
            See the data downloads
          </Link>
          .
        </Empty>
      </Card>
    );
  }

  const seats = data[0].seats;
  const xMin = data[0].env;
  const xMax = data[data.length - 1].env;
  const series: LineSeries[] = [
    { key: "old", label: "2024 lines", color: OLD_COLOR, points: data.map((d) => [d.env, d.oldD] as const) },
    { key: "new", label: "2026 lines", color: NEW_COLOR, points: data.map((d) => [d.env, d.newD] as const) },
  ];
  const even = data.reduce((best, d) => (Math.abs(d.env) < Math.abs(best.env) ? d : best), data[0]);

  return (
    <ChartFrame
      title={`Seats Democrats carry in ${scope}, by national vote`}
      subtitle={
        <>
          At a tied national vote: {even.oldD} of {seats} on the 2024 lines, {even.newD} on the 2026 lines. Every district moves with
          the national vote (uniform swing). Click to set the national vote.
        </>
      }
      legend={
        <>
          <LegendItem shape="line" color={OLD_COLOR} label="2024 lines" />
          <LegendItem shape="line" color={NEW_COLOR} label="2026 lines" />
        </>
      }
      source={source}
      csvName={state ? `redistricting-seat-curve-${state.toLowerCase()}` : "redistricting-seat-curve"}
      table={{
        columns: [
          { key: "env", label: "National vote", format: (v) => fmtMargin(v as number) },
          { key: "oldD", label: "D seats, 2024 lines", align: "right" },
          { key: "newD", label: "D seats, 2026 lines", align: "right" },
          { key: "net", label: "Net change for D", align: "right" },
        ],
        rows: data.map((d) => ({ env: d.env, oldD: d.oldD, newD: d.newD, net: d.newD - d.oldD })),
      }}
      height={HEIGHT}
      actions={actions}
    >
      {(width) => (
        <LineChart
          width={width}
          height={HEIGHT}
          series={series}
          xDomain={[xMin, xMax]}
          yDomain={[0, seats]}
          xFormat={(x) => fmtMargin(x)}
          xTickFormat={(x) => fmtMargin(x, 0)}
          yFormat={(y) => `${Math.round(y)} of ${seats} seats`}
          yTickFormat={(y) => String(Math.round(y))}
          xLabel="National vote"
          refLines={[{ y: seats / 2, label: "Half" }]}
          marker={params.env >= xMin && params.env <= xMax ? { x: params.env, label: "Your setting" } : undefined}
          onXClick={(x) => set({ env: x })}
          endLabels={false}
          ariaLabel={`Seats Democrats carry in ${scope} on the 2024 and 2026 lines at national votes from ${fmtMargin(xMin, 0)} to ${fmtMargin(xMax, 0)}.`}
        />
      )}
    </ChartFrame>
  );
}
