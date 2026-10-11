"use client";

// Cross-filter charts for the explorer. Each reads the filtered seats and writes the URL:
// brushing or clicking selects seats (ids), the rating bars toggle the rating filter.
import { useMemo, type ReactNode } from "react";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { HexMap } from "@/components/charts/hex-map";
import { Histogram, type HistogramBin } from "@/components/charts/histogram";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import type { HexMap as HexMapData, RatingLabel } from "@/lib/data/types";
import { fmtMargin, fmtNum, fmtProb } from "@/lib/format";
import { winProbability } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import { RATING_COLOR, RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { houseHref, stateHref } from "@/lib/routes";
import { setIds, setRatings, toggle } from "./filters";
import type { ExplorerRow } from "./types";

// ---- Expected-margin histogram -----------------------------------------------------------------

const LO = -30;
const HI = 30;
const STEP = 2;
const NBINS = (HI - LO) / STEP;
const binIndex = (m: number) => Math.max(0, Math.min(NBINS - 1, Math.floor((m - LO) / STEP)));

interface MarginBin extends HistogramBin {
  ids: string[];
}

/** "R+4 to R+2", with the clipped end bins named as open ranges. */
function binLabel(b: MarginBin): string {
  if (b.x0 <= LO) return `R+${HI - STEP} or more`;
  if (b.x1 >= HI) return `D+${HI - STEP} or more`;
  return `${fmtMargin(b.x0, 0)} to ${fmtMargin(b.x1, 0)}`;
}

export function MarginHistogram({ rows, source }: { rows: ExplorerRow[]; source: ReactNode }) {
  const params = useModelParams();

  const bins = useMemo<MarginBin[]>(() => {
    const out: MarginBin[] = Array.from({ length: NBINS }, (_, i) => ({
      x0: LO + i * STEP,
      x1: LO + (i + 1) * STEP,
      value: 0,
      ids: [],
    }));
    for (const r of rows) {
      const b = out[binIndex(r.p.margin)];
      b.value = (b.value ?? 0) + 1;
      b.ids.push(r.race.id);
    }
    return out;
  }, [rows]);

  const clipped = rows.filter((r) => Math.abs(r.p.margin) > HI).length;
  const selectRange = (lo: number, hi: number) => {
    const ids = bins.filter((b) => b.x0 >= lo && b.x1 <= hi).flatMap((b) => b.ids);
    if (ids.length) setIds(ids);
  };

  return (
    <ChartFrame
      title="How close are the seats in view?"
      subtitle={`Seats by the model's expected margin in this scenario, in 2-point bins. Margins beyond 30 points (${fmtNum(clipped)} here) sit in the end bins. Drag across bins, or click one, to select those seats.`}
      legend={
        <>
          <LegendItem color="var(--r-safe-d)" label="Democrat favored" />
          <LegendItem color="var(--r-toss)" label="Toss-up" />
          <LegendItem color="var(--r-safe-r)" label="Republican favored" />
        </>
      }
      height={240}
      className="h-full"
      csvName="house-explorer-margin-histogram"
      table={{
        columns: [
          { key: "range", label: "Expected margin" },
          { key: "seats", label: "Seats", align: "right" },
          { key: "ids", label: "Seat ids" },
        ],
        rows: bins.map((b) => ({ range: binLabel(b), seats: b.value, ids: b.ids.join(" ") })),
      }}
      source={source}
    >
      {(width) => (
        <Histogram<MarginBin>
          width={width}
          height={240}
          bins={bins}
          xDomain={[LO, HI]}
          discrete={false}
          xFormat={(x) => (x === 0 ? "Even" : fmtMargin(x, 0))}
          yFormat={(y) => fmtNum(y)}
          yLabel="Seats"
          xLabel="Expected margin in this scenario"
          markers={[{ x: 0, label: "Even" }]}
          colorFor={(b) => RATING_COLOR[ratingFromProb(winProbability((b.x0 + b.x1) / 2, params))]}
          binLabel={binLabel}
          brushable
          onBrush={(range) => range && selectRange(range[0], range[1])}
          onBinClick={(b) => b.ids.length && setIds(b.ids)}
          summary={`Histogram of ${rows.length} seats by expected margin, from R+30 or more to D+30 or more.`}
        />
      )}
    </ChartFrame>
  );
}

// ---- Seats by consensus rating -----------------------------------------------------------------

export function RatingBars({
  counts,
  selected,
  source,
}: {
  /** Seats per consensus rating, counted without the rating filter itself. */
  counts: Record<RatingLabel, number>;
  selected: RatingLabel[];
  source: ReactNode;
}) {
  const rows: BarRow[] = RATING_ORDER.map((r) => {
    const on = !selected.length || selected.includes(r);
    return {
      key: r,
      label: r,
      sublabel: selected.includes(r) ? "selected" : undefined,
      value: counts[r],
      // Ratings outside an active rating filter recede but stay clickable to add them.
      color: on ? RATING_COLOR[r] : `color-mix(in srgb, ${RATING_COLOR[r]} 28%, var(--surface))`,
    };
  });
  const height = barChartHeight(rows, 30);

  return (
    <ChartFrame
      title="Seats by forecaster consensus"
      subtitle={
        selected.length
          ? "Counts ignore the rating filter so you can compare. Click a rating to add or remove it."
          : "The median rating of 10 forecasters. Click a rating to filter to it."
      }
      height={height}
      className="h-full"
      csvName="house-explorer-ratings"
      table={{
        columns: [
          { key: "rating", label: "Consensus rating" },
          { key: "seats", label: "Seats", align: "right" },
          { key: "selected", label: "In rating filter" },
        ],
        rows: RATING_ORDER.map((r) => ({ rating: r, seats: counts[r], selected: selected.includes(r) ? "Yes" : "" })),
      }}
      source={source}
    >
      {(width) => (
        <BarChart
          rows={rows}
          width={width}
          rowHeight={30}
          showValues
          valueLabel="Seats"
          clickHint="Click to toggle this rating"
          onRowClick={(key) => setRatings(toggle(selected, key as RatingLabel))}
          ariaLabel="Seats in view by forecaster consensus rating. Each row toggles a rating filter."
        />
      )}
    </ChartFrame>
  );
}

// ---- Hex map ---------------------------------------------------------------------------------

export function ExplorerHexMap({
  map,
  rows,
  filtered,
  hexSource,
}: {
  map: HexMapData;
  /** Every seat with its projection (the map draws all 435). */
  rows: ReadonlyMap<string, ExplorerRow>;
  /** The seats in view, or null when no filter is active. */
  filtered: ExplorerRow[] | null;
  hexSource: ReactNode;
}) {
  const { href } = useScenario();
  const highlight = useMemo(() => (filtered ? new Set(filtered.map((r) => r.race.id)) : null), [filtered]);
  const tableRows = filtered ?? [...rows.values()];

  return (
    <ChartFrame
      title="Where they are"
      subtitle={
        filtered
          ? `The ${fmtNum(filtered.length)} seats in view, filled by the model's category in this scenario. Other seats are dimmed. Click a district to open it.`
          : "Every seat, filled by the model's category in this scenario. Click a district to open it, or a state label for its page."
      }
      legend={RATING_ORDER.map((r) => (
        <LegendItem key={r} color={RATING_COLOR[r]} label={r} />
      ))}
      height={0}
      // The plot box keeps the map's aspect ratio, so nothing shifts when the map measures itself.
      className="h-full [&>div.relative]:aspect-[1000/952]"
      csvName="house-explorer-map"
      table={{
        columns: [
          { key: "id", label: "Seat" },
          { key: "state", label: "State" },
          { key: "category", label: "Model category" },
          { key: "chance", label: "Chance D", align: "right", format: (v) => fmtProb(v as number) },
        ],
        rows: tableRows.map((r) => ({
          id: r.race.id,
          state: r.race.stateName,
          category: r.category,
          chance: Number(r.p.pWin.toFixed(4)),
        })),
      }}
      source={hexSource}
    >
      {() => (
        <HexMap
          map={map}
          ariaLabel={`Map of all 435 House districts colored by the model's category${filtered ? `, with the ${filtered.length} seats in view highlighted` : ""}`}
          fill={(id) => {
            const r = rows.get(id);
            return r ? RATING_COLOR[r.category] : "var(--grid)";
          }}
          highlight={highlight}
          hrefFor={(id) => href(houseHref(id))}
          stateHref={(st) => href(stateHref(st))}
          tooltip={(id) => {
            const r = rows.get(id);
            if (!r) return <TipTitle>{id}</TipTitle>;
            const { race, p } = r;
            return (
              <>
                <TipTitle>
                  {id} · {race.stateName}
                </TipTitle>
                <div className="mb-1 text-ink-2">
                  {race.incumbent
                    ? `${race.incumbent} (${race.incumbentParty || "?"})${race.incumbentRunning ? "" : ", not running"}`
                    : "No incumbent"}
                </div>
                <TipRow color="var(--dem)" label="Democrat wins" value={fmtProb(p.forced ? (p.margin > 0 ? 1 : 0) : p.pWin)} />
                <TipRow label="Expected margin" value={fmtMargin(p.margin)} />
                <TipRow label="Forecasters" value={race.rating} />
                {highlight && !highlight.has(id) && <div className="mt-1 text-[11px] text-muted">Outside the current filters</div>}
              </>
            );
          }}
        />
      )}
    </ChartFrame>
  );
}
