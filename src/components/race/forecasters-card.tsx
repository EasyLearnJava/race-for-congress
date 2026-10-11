"use client";

import { useMemo } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { DotStrip, dotStripHeight, type DotStripBand, type DotStripRow, type DotStripTick } from "@/components/charts/dot-strip";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Card, Empty, RatingChip, SectionTitle } from "@/components/ui/primitives";
import type { Rating, RatingLabel } from "@/lib/data/types";
import { fmtDate, signed } from "@/lib/format";
import { RATING_COLOR, RATING_ORDER, ratingFromScore } from "@/lib/ratings";
import type { AnyRace } from "./race-utils";

const SCORE_OF: Record<RatingLabel, number> = {
  "Safe D": 3,
  "Likely D": 2,
  "Lean D": 1,
  Tossup: 0,
  "Lean R": -1,
  "Likely R": -2,
  "Safe R": -3,
};

const TICKS: DotStripTick[] = RATING_ORDER.map((r) => ({ value: SCORE_OF[r], label: r }));

// Light rating bands behind the dots, clipped to the -3..3 scale.
const BANDS: DotStripBand[] = RATING_ORDER.map((r) => ({
  from: Math.max(-3, SCORE_OF[r] - 0.5),
  to: Math.min(3, SCORE_OF[r] + 0.5),
  color: RATING_COLOR[r],
}));

const colorFor = (r: Rating) => RATING_COLOR[r.rating as RatingLabel] ?? RATING_COLOR[ratingFromScore(r.score)];
const fmtScore = (v: number) => `${ratingFromScore(v)} (${v === 0 ? "0" : signed(v, Number.isInteger(v) ? 0 : 1)})`;

/** "7 of 10 forecasters rate it Lean D": the most common published rating. */
function agreementSentence(ratings: Rating[], consensus: RatingLabel): string {
  const counts = new Map<string, number>();
  for (const r of ratings) counts.set(r.rating, (counts.get(r.rating) ?? 0) + 1);
  const [top, n] = [...counts.entries()].sort((a, b) => b[1] - a[1] || Math.abs(SCORE_OF[a[0] as RatingLabel] ?? 9) - Math.abs(SCORE_OF[b[0] as RatingLabel] ?? 9))[0];
  const total = ratings.length;
  const all = n === total;
  const head = all ? `All ${total} forecasters rate it ${top}.` : `${n} of ${total} forecasters rate it ${top}.`;
  const spread = new Set(ratings.map((r) => r.rating)).size;
  const tail = all
    ? ""
    : top === consensus
      ? ` Ratings span ${spread} categories.`
      : ` The median rating is ${consensus}, across ${spread} categories.`;
  return head + tail;
}

export function ForecastersCard({
  race,
  ratings,
  forecasterCount,
  chamber,
}: {
  race: AnyRace;
  ratings: Rating[];
  forecasterCount: number;
  chamber: "house" | "senate";
}) {
  const { href } = useScenario();
  const forecastersHref = href(chamber === "senate" ? "/forecasters?chamber=senate" : "/forecasters");

  const rows = useMemo<DotStripRow[]>(
    () =>
      ratings.map((r) => ({
        key: r.source,
        label: r.source,
        sublabel: fmtDate(r.asOf, true),
        href: forecastersHref,
        dots: [{ key: r.source, value: r.score, color: colorFor(r), label: `${r.source}: ${r.rating}` }],
        marker: { value: race.ratingScore, label: `Consensus: ${race.rating}` },
      })),
    [ratings, race.ratingScore, race.rating, forecastersHref],
  );

  const latest = ratings.reduce((m, r) => (r.asOf > m ? r.asOf : m), "");

  if (ratings.length === 0) {
    return (
      <Card>
        <SectionTitle title="What the forecasters say" />
        <Empty title="Not on any forecaster's competitive list">
          None of the {forecasterCount || 10} forecasters lists this race as competitive, which usually means they consider it safe for the party
          that holds it. The model uses fundamentals only here: lean, the national vote and incumbency.
        </Empty>
      </Card>
    );
  }

  const columns: Column<Rating>[] = [
    { key: "source", header: "Forecaster", value: (r) => r.source },
    { key: "rating", header: "Rating", value: (r) => r.rating, cell: (r) => <RatingChip rating={r.rating} size="xs" /> },
    { key: "score", header: "Score", value: (r) => r.score, align: "right", hideOnMobile: true },
    { key: "asOf", header: "As of", value: (r) => r.asOf, cell: (r) => fmtDate(r.asOf), align: "right" },
  ];

  const height = dotStripHeight(rows);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <ChartFrame
        className="min-w-0 lg:col-span-3"
        title="What the forecasters say"
        subtitle={`${agreementSentence(ratings, race.rating)} Each dot is one forecaster; the ink tick is the consensus (median).`}
        legend={
          <>
            <LegendItem shape="dot" color={RATING_COLOR["Lean D"]} label="A forecaster's rating" />
            <LegendItem shape="line" color="var(--ink)" label={`Consensus: ${race.rating}`} />
          </>
        }
        height={height}
        csvName={`${race.id.toLowerCase()}-ratings`}
        table={{
          columns: [
            { key: "source", label: "Forecaster" },
            { key: "rating", label: "Rating" },
            { key: "score", label: "Score", align: "right" },
            { key: "asOf", label: "As of", align: "right" },
          ],
          rows: ratings.map((r) => ({ source: r.source, rating: r.rating, score: r.score, asOf: r.asOf })),
        }}
        source={`Source: each forecaster as compiled by Wikipedia, latest rating ${fmtDate(latest)}. Scores run from -3 (Safe R) to +3 (Safe D); Tilt ratings count as ±0.5.`}
      >
        {(w) => (
          <DotStrip
            width={w}
            rows={rows}
            domain={[3, -3]}
            ticks={TICKS}
            bands={BANDS}
            format={fmtScore}
            formatSpread={(s) => `${s} ${s === 1 ? "step" : "steps"}`}
            stackOverlaps
            ariaLabel={`Ratings of ${race.id} by ${ratings.length} forecasters, from Safe D on the left to Safe R on the right. Consensus ${race.rating}.`}
          />
        )}
      </ChartFrame>
      <div className="min-w-0 lg:col-span-2">
        <DataTable
          rows={ratings}
          columns={columns}
          rowKey={(r) => r.source}
          rowHref={() => forecastersHref}
          csvName={`${race.id.toLowerCase()}-ratings-table`}
          caption={
            <>
              <span className="font-semibold text-ink tabular-nums">{ratings.length}</span> of {forecasterCount} forecasters rate this race
            </>
          }
          maxHeight={420}
        />
      </div>
    </div>
  );
}
