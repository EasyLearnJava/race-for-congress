"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { LineChart, type LineSeries } from "@/components/charts/line-chart";
import { useScenario } from "@/components/scenario/scenario";
import { Card, Empty, SectionTitle } from "@/components/ui/primitives";
import { HOUSE_MAJORITY } from "@/lib/data/states";
import type { HouseRace } from "@/lib/data/types";
import { fmtMargin } from "@/lib/format";
import { expectedWinners, finishLine, projectRaces, type ModelParams, type ModelRace } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import type { OldDistrict } from "../_lib/data";
import { mapsForComparison } from "../_lib/derive";

const NEW_COLOR = "var(--m-5)";
const OLD_COLOR = "var(--m-2)";
const ENV_MIN = -12;
const ENV_MAX = 12;
const STEP = 0.25;
const HEIGHT = 260;

/** Seats where Democrats are favored at each national vote (expected margin above zero). */
function favoredCurve(races: ModelRace[], p: ModelParams): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; ENV_MIN + i * STEP <= ENV_MAX + 1e-9; i++) {
    const env = ENV_MIN + i * STEP;
    out.push([env, expectedWinners(projectRaces(races, { ...p, env }), "D")]);
  }
  return out;
}

export function FinishLine({
  house,
  old,
  complete,
  nationalMargin,
  source,
}: {
  house: HouseRace[];
  old: OldDistrict[];
  /** The 2024-lines data covers all nine states, district for district. */
  complete: boolean;
  nationalMargin: number;
  source: string;
}) {
  const { href, set } = useScenario();
  const params = useModelParams();

  const result = useMemo(() => {
    if (!complete) return null;
    const { newMap, oldMap } = mapsForComparison(house, old, nationalMargin);
    // Fundamentals only: lean + national vote (+ incumbency outside the nine states, the same in both).
    const p: ModelParams = { ...params, expertWeight: 0 };
    const fNew = finishLine(newMap, p, HOUSE_MAJORITY);
    const fOld = finishLine(oldMap, p, HOUSE_MAJORITY);
    const curveNew = favoredCurve(newMap, p);
    const curveOld = favoredCurve(oldMap, p);
    const atEnvNew = expectedWinners(projectRaces(newMap, p), "D");
    const atEnvOld = expectedWinners(projectRaces(oldMap, p), "D");
    return { fNew, fOld, curveNew, curveOld, atEnvNew, atEnvOld };
  }, [complete, house, old, nationalMargin, params]);

  if (!result) {
    return (
      <Card>
        <SectionTitle title="Did the new maps move the finish line?" />
        <Empty title="Waiting for the 2024-lines data">
          This comparison reruns the model on the old maps, so it needs The Downballot&apos;s 2024 presidential results on the 2024
          congressional lines for all nine states (the <code className="text-xs">old_lines</code> pipeline step). It appears here
          once that file is loaded.{" "}
          <Link href={href("/data")} className="font-medium underline underline-offset-2">
            See the data downloads
          </Link>
          .
        </Empty>
      </Card>
    );
  }

  const { fNew, fOld, curveNew, curveOld, atEnvNew, atEnvOld } = result;
  const moved = fNew != null && fOld != null ? fNew - fOld : null;
  const movedAbs = moved == null ? 0 : Math.abs(Math.round(moved * 10) / 10);

  let headline: string;
  if (moved == null) headline = "The finish line could not be computed for one of the maps.";
  else if (movedAbs === 0) headline = "The new maps left the finish line where it was.";
  else
    headline = `The new maps moved the finish line ${movedAbs.toFixed(1)} points toward ${moved > 0 ? "Republicans" : "Democrats"}.`;

  const series: LineSeries[] = [
    { key: "old", label: "2024 maps", color: OLD_COLOR, points: curveOld },
    { key: "new", label: "2026 maps", color: NEW_COLOR, points: curveNew },
  ];

  const tableRows = curveNew.map(([env, seats], i) => ({ env, newSeats: seats, oldSeats: curveOld[i]?.[1] ?? null }));

  return (
    <div className="space-y-4">
      <Card>
        <SectionTitle title="Did the new maps move the finish line?" />
        <p className="font-serif text-xl leading-snug font-semibold text-ink sm:text-2xl">{headline}</p>
        <dl className="mt-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg border border-line p-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
              <span aria-hidden className="h-0.5 w-3.5 rounded-full" style={{ background: OLD_COLOR }} />
              On the 2024 maps
            </dt>
            <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{fmtMargin(fOld)}</dd>
            <dd className="text-xs text-ink-2 tabular-nums">{atEnvOld} seats favored D now</dd>
          </div>
          <div className="rounded-lg border border-line p-3">
            <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
              <span aria-hidden className="h-0.5 w-3.5 rounded-full" style={{ background: NEW_COLOR }} />
              On the 2026 maps
            </dt>
            <dd className="mt-1 text-xl font-semibold text-ink tabular-nums">{fmtMargin(fNew)}</dd>
            <dd className="text-xs text-ink-2 tabular-nums">{atEnvNew} seats favored D now</dd>
          </div>
        </dl>
        <p className="mt-3 text-xs leading-5 text-ink-2">
          The finish line is the national vote at which Democrats are favored in exactly {HOUSE_MAJORITY} seats. &ldquo;Now&rdquo; means
          your national vote, {fmtMargin(params.env)}.
        </p>
      </Card>

      <ChartFrame
        title="Seats where Democrats are favored, by national vote"
        subtitle="Fundamentals only, on each set of maps. Where a line crosses 218 is that map's finish line. Click to set the national vote."
        legend={
          <>
            <LegendItem shape="line" color={OLD_COLOR} label="2024 maps" />
            <LegendItem shape="line" color={NEW_COLOR} label="2026 maps" />
          </>
        }
        source={source}
        csvName="redistricting-finish-line"
        table={{
          columns: [
            { key: "env", label: "National vote", format: (v) => fmtMargin(v as number) },
            { key: "oldSeats", label: "Favored D, 2024 maps", align: "right" },
            { key: "newSeats", label: "Favored D, 2026 maps", align: "right" },
          ],
          rows: tableRows,
        }}
        height={HEIGHT}
      >
        {(width) => (
          <LineChart
            width={width}
            height={HEIGHT}
            series={series}
            xDomain={[ENV_MIN, ENV_MAX]}
            xFormat={(x) => fmtMargin(x)}
            xTickFormat={(x) => fmtMargin(x, 0)}
            yFormat={(y) => `${Math.round(y)} seats`}
            yTickFormat={(y) => String(Math.round(y))}
            xLabel="National vote"
            refLines={[{ y: HOUSE_MAJORITY, label: "218", strong: true }]}
            marker={params.env >= ENV_MIN && params.env <= ENV_MAX ? { x: params.env, label: "Your setting" } : undefined}
            onXClick={(x) => set({ env: x })}
            endLabels={false}
            ariaLabel={`Seats where Democrats are favored at each national vote from ${fmtMargin(ENV_MIN, 0)} to ${fmtMargin(ENV_MAX, 0)}, on the 2024 and 2026 maps. Finish line ${fmtMargin(fOld)} on the 2024 maps and ${fmtMargin(fNew)} on the 2026 maps.`}
          />
        )}
      </ChartFrame>
    </div>
  );
}
