"use client";

// Charts on a state page: the spread of expected margins, the delegation across national
// environments, and the forecasters' ratings next to the model's categories.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { Histogram, type HistogramBin } from "@/components/charts/histogram";
import { LineChart } from "@/components/charts/line-chart";
import { useScenario } from "@/components/scenario/scenario";
import { RatingChip } from "@/components/ui/primitives";
import type { HouseRace, RatingLabel } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import { expectedWinners, projectRaces, winProbability, type RaceProjection } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import { RATING_COLOR, RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { explorerHref, houseHref } from "@/lib/routes";

const SOURCE_MODEL = "Model: district lean, national vote, incumbency and the forecasters' ratings.";

/* ------------------------------------------------------------------ margin histogram */

interface MarginBin extends HistogramBin {
  ids: string[];
}

const LO = -30;
const HI = 30;
const STEP = 2;
const HIST_HEIGHT = 220;

export function MarginHistogram({
  name,
  postal,
  races,
  projections,
}: {
  name: string;
  postal: string;
  races: HouseRace[];
  projections: Map<string, RaceProjection>;
}) {
  const router = useRouter();
  const { href } = useScenario();
  const params = useModelParams();

  const bins = useMemo<MarginBin[]>(() => {
    const out: MarginBin[] = [];
    for (let x0 = LO; x0 < HI; x0 += STEP) out.push({ x0, x1: x0 + STEP, value: 0, ids: [] });
    for (const r of races) {
      const p = projections.get(r.id);
      if (!p) continue;
      // Clipped margins (including unopposed races) go into the end bins.
      const i = Math.max(0, Math.min(out.length - 1, Math.floor((p.margin - LO) / STEP)));
      out[i].ids.push(r.id);
      out[i].value = (out[i].value ?? 0) + 1;
    }
    return out;
  }, [races, projections]);

  const label = (b: MarginBin) => {
    if (b.x0 === LO) return `${fmtMargin(b.x1, 0)} or more Republican`;
    if (b.x1 === HI) return `${fmtMargin(b.x0, 0)} or more Democratic`;
    return `${fmtMargin(b.x0, 0)} to ${fmtMargin(b.x1, 0)}`;
  };

  const demLeads = races.filter((r) => (projections.get(r.id)?.margin ?? 0) > 0).length;

  return (
    <ChartFrame
      title="Expected margins across the state"
      subtitle={`Every ${name} district by its expected margin in this scenario, in 2-point bins. Democrats lead in ${demLeads} of ${races.length}. Click a column to open those seats in the explorer.`}
      height={HIST_HEIGHT}
      csvName={`${postal.toLowerCase()}-expected-margins`}
      source={`${SOURCE_MODEL} Margins beyond 28 points, including unopposed races, sit in the end bins.`}
      legend={
        <>
          <LegendItem color={RATING_COLOR["Likely D"]} label="Democrat favored" />
          <LegendItem color={RATING_COLOR.Tossup} label="Close" />
          <LegendItem color={RATING_COLOR["Likely R"]} label="Republican favored" />
        </>
      }
      table={{
        columns: [
          { key: "range", label: "Expected margin" },
          { key: "seats", label: "Seats", align: "right" },
          { key: "ids", label: "Districts" },
        ],
        rows: bins.filter((b) => b.ids.length).map((b) => ({ range: label(b), seats: b.ids.length, ids: b.ids.join(" ") })),
      }}
    >
      {(width) => (
        <Histogram<MarginBin>
          width={width}
          height={HIST_HEIGHT}
          bins={bins}
          discrete={false}
          xDomain={[LO, HI]}
          xFormat={(v) => fmtMargin(v, 0)}
          yFormat={(v) => String(Math.round(v))}
          yLabel="Seats"
          xLabel="Expected margin"
          markers={[{ x: 0, label: "Even", strong: true }]}
          colorFor={(b) => RATING_COLOR[ratingFromProb(winProbability((b.x0 + b.x1) / 2, params))]}
          binLabel={label}
          onBinClick={(b) => {
            if (b.ids.length) router.push(href(explorerHref(b.ids)));
          }}
          summary={`Histogram of expected margins for ${races.length} ${name} districts; Democrats lead in ${demLeads}.`}
        />
      )}
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ delegation vs environment */

const CURVE_HEIGHT = 260;
const ENVS = Array.from({ length: 61 }, (_, i) => -15 + i * 0.5);

export function DelegationCurve({
  name,
  postal,
  races,
  heldDem,
}: {
  name: string;
  postal: string;
  races: HouseRace[];
  heldDem: number;
}) {
  const { set } = useScenario();
  const params = useModelParams();

  const points = useMemo(
    () =>
      ENVS.map((env) => {
        const proj = projectRaces(races, { ...params, env });
        const expected = proj.reduce((s, p) => s + (p.challenger === "D" ? p.pWin : 0), 0);
        return { env, expected, leads: expectedWinners(proj, "D") };
      }),
    [races, params],
  );

  const n = races.length;
  return (
    <ChartFrame
      title={`${name}'s delegation by national vote`}
      subtitle="Expected Democratic seats at every national vote from R+15 to D+15. Click the chart to move the national vote there."
      height={CURVE_HEIGHT}
      csvName={`${postal.toLowerCase()}-seats-by-national-vote`}
      source={`${SOURCE_MODEL} Seats held now: the notional holder of each district.`}
      legend={
        <>
          <LegendItem shape="line" color="var(--dem)" label="Expected Democratic seats" />
          <LegendItem shape="line" color="var(--muted)" label="Seats where the Democrat leads" />
        </>
      }
      table={{
        columns: [
          { key: "env", label: "National vote", format: (v) => fmtMargin(Number(v)) },
          { key: "expected", label: "Expected D seats", align: "right", format: (v) => Number(v).toFixed(1) },
          { key: "leads", label: "Seats where D leads", align: "right" },
        ],
        rows: points.map((p) => ({ env: p.env, expected: Number(p.expected.toFixed(2)), leads: p.leads })),
      }}
    >
      {(width) => (
        <LineChart
          width={width}
          height={CURVE_HEIGHT}
          series={[
            { key: "leads", label: "Seats where the Democrat leads", color: "var(--muted)", points: points.map((p) => [p.env, p.leads] as const) },
            { key: "expected", label: "Expected Democratic seats", color: "var(--dem)", points: points.map((p) => [p.env, p.expected] as const) },
          ]}
          xDomain={[-15, 15]}
          yDomain={[0, n]}
          xFormat={(v) => fmtMargin(v)}
          xTickFormat={(v) => fmtMargin(v, 0)}
          yFormat={(v) => v.toFixed(1)}
          yTickFormat={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
          xLabel="National vote"
          yLabel="Democratic seats"
          refLines={[{ y: heldDem, label: `${heldDem} held now` }]}
          marker={{ x: Math.max(-15, Math.min(15, params.env)), label: "Now" }}
          endLabels={false}
          onXClick={(x) => set({ env: Math.round(x * 2) / 2 })}
          ariaLabel={`Expected Democratic seats in ${name} by national vote, from R+15 to D+15. ${heldDem} of ${n} held by Democrats now.`}
        />
      )}
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------ forecasters vs model */

export function RatingsMix({
  name,
  postal,
  races,
  projections,
}: {
  name: string;
  postal: string;
  races: HouseRace[];
  projections: Map<string, RaceProjection>;
}) {
  const { href } = useScenario();

  const modelCat = (r: HouseRace): RatingLabel => {
    const p = projections.get(r.id);
    return p ? ratingFromProb(p.pWin) : r.rating;
  };

  const rows: BarRow[] = [
    {
      key: "forecasters",
      label: "Forecasters",
      sublabel: "consensus",
      href: href(`/house?state=${postal}`),
      segments: RATING_ORDER.map((r) => ({ key: r, label: r, value: races.filter((x) => x.rating === r).length, color: RATING_COLOR[r] })),
    },
    {
      key: "model",
      label: "This model",
      sublabel: "this scenario",
      href: href(explorerHref(races.map((r) => r.id))),
      segments: RATING_ORDER.map((r) => ({ key: r, label: r, value: races.filter((x) => modelCat(x) === r).length, color: RATING_COLOR[r] })),
    },
  ];

  const order = (r: RatingLabel) => RATING_ORDER.indexOf(r);
  const differ = races
    .map((r) => ({ race: r, model: modelCat(r), gap: Math.abs(order(modelCat(r)) - order(r.rating)) }))
    .filter((d) => d.gap > 0)
    .sort((a, b) => b.gap - a.gap || a.race.district - b.race.district);

  const height = barChartHeight(2, 40);
  return (
    <ChartFrame
      title="Forecasters and the model"
      subtitle={`${name}'s seats by the forecasters' consensus rating and by this model's category in this scenario.`}
      height={height}
      csvName={`${postal.toLowerCase()}-ratings-mix`}
      source="Source: Cook, Inside Elections, Sabato and seven more forecasters via Wikipedia; model categories from each seat's chance of winning."
      legend={RATING_ORDER.map((r) => (
        <LegendItem key={r} color={RATING_COLOR[r]} label={r} />
      ))}
      table={{
        columns: [
          { key: "rating", label: "Category" },
          { key: "forecasters", label: "Forecasters", align: "right" },
          { key: "model", label: "This model", align: "right" },
        ],
        rows: RATING_ORDER.map((r) => ({
          rating: r,
          forecasters: races.filter((x) => x.rating === r).length,
          model: races.filter((x) => modelCat(x) === r).length,
        })),
      }}
    >
      {(width) => (
        <div>
          <BarChart
            rows={rows}
            width={width}
            rowHeight={40}
            max={races.length}
            valueLabel="Seats"
            clickHint="Click to open these seats in the explorer"
            ariaLabel={`${name}'s House seats by forecaster consensus and by model category`}
          />
          <div className="mt-3 border-t border-line pt-3">
            {differ.length ? (
              <>
                <div className="text-xs font-medium text-ink-2">
                  {differ.length} {differ.length === 1 ? "seat is" : "seats are"} rated differently by the model
                </div>
                <ul className="mt-1.5 space-y-1">
                  {differ.slice(0, 5).map(({ race, model }) => (
                    <li key={race.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                      <Link href={href(houseHref(race.id))} className="w-12 font-semibold hover:underline">
                        {race.id}
                      </Link>
                      <RatingChip rating={race.rating} size="xs" />
                      <span aria-hidden className="text-muted">
                        →
                      </span>
                      <span className="sr-only">forecasters, then the model:</span>
                      <RatingChip rating={model} size="xs" />
                      <span className="text-ink-2 tabular-nums">{fmtProb(projections.get(race.id)?.pWin)} D</span>
                    </li>
                  ))}
                </ul>
                {differ.length > 5 && (
                  <Link
                    href={href(explorerHref(differ.map((d) => d.race.id)))}
                    className="mt-2 inline-block link-more text-sm"
                  >
                    All {differ.length} in the explorer
                  </Link>
                )}
              </>
            ) : (
              <p className="text-xs text-ink-2">The model and the forecasters put every seat in the same category in this scenario.</p>
            )}
          </div>
        </div>
      )}
    </ChartFrame>
  );
}
