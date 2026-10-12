"use client";

// The chart sections of the forecaster page. Each one takes the chamber analysis computed
// once in forecasters.tsx, so switching chambers or focusing a forecaster never recomputes.
import Link from "next/link";
import { useMemo, type ReactNode } from "react";

import { Segmented } from "@/components/ui/segmented";
import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { DotStrip, dotStripHeight, type DotStripBand, type DotStripRow, type DotStripTick } from "@/components/charts/dot-strip";
import { Heatmap, HeatmapScaleLegend, type HeatmapCol, type HeatmapRow } from "@/components/charts/heatmap";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Card, Empty, RatingChip, SectionTitle } from "@/components/ui/primitives";
import type { RatingLabel } from "@/lib/data/types";
import { fmtDate, fmtNum, fmtProb, signed } from "@/lib/format";
import { RATING_COLOR, RATING_ORDER } from "@/lib/ratings";
import { explorerHref, raceHref } from "@/lib/routes";
import {
  categoryOf,
  demSide,
  differences,
  repSide,
  scoreLabel,
  shortName,
  type Chamber,
  type ChamberAnalysis,
  type ForecasterStat,
  type RaceLite,
} from "./analytics";

const CONSENSUS_KEY = "_consensus";
const MODEL_KEY = "_model";

const steps = (n: number) => `${signed(n, 2)} ${Math.abs(n) === 1 ? "step" : "steps"}`;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export function ChamberToggle({ chamber, onChange }: { chamber: Chamber; onChange: (c: Chamber) => void }) {
  return (
    <Segmented
      label="Chamber"
      size="md"
      value={chamber}
      onChange={onChange}
      options={[
        { value: "house", label: "House" },
        { value: "senate", label: "Senate" },
      ]}
    />
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Implied seats                                                                               */
/* ------------------------------------------------------------------------------------------ */

export function ImpliedSeats({
  chamber,
  analysis,
  order,
  races,
  modelCounts,
  envLabel,
  reference,
  referenceNote,
  focus,
  onFocus,
  source,
}: {
  chamber: Chamber;
  analysis: ChamberAnalysis;
  order: ForecasterStat[];
  races: RaceLite[];
  modelCounts: Record<RatingLabel, number>;
  envLabel: string;
  reference: { value: number; label: string };
  referenceNote: string;
  focus: string;
  onFocus: (source: string) => void;
  source: ReactNode;
}) {
  const { href } = useScenario();
  const total = races.length;

  const rows = useMemo<BarRow[]>(() => {
    const segs = (counts: Record<RatingLabel, number>) =>
      RATING_ORDER.map((label) => ({ key: label, label, value: counts[label], color: RATING_COLOR[label] }));
    const sub = (counts: Record<RatingLabel, number>) => `D ${demSide(counts)} · R ${repSide(counts)}`;
    return [
      ...order.map((f) => ({ key: f.source, label: f.short, sublabel: sub(f.counts), segments: segs(f.counts) })),
      {
        key: CONSENSUS_KEY,
        label: "Consensus",
        sublabel: sub(analysis.consensusCounts),
        segments: segs(analysis.consensusCounts),
        href: href(chamber === "house" ? "/house" : "/senate"),
      },
      { key: MODEL_KEY, label: `This model, ${envLabel}`, sublabel: sub(modelCounts), segments: segs(modelCounts), href: href("/simulator") },
    ];
  }, [order, analysis, modelCounts, envLabel, chamber, href]);

  const byKey = useMemo(() => new Map(order.map((f) => [f.source, f])), [order]);
  const rowHeight = 38;

  const table = {
    columns: [
      { key: "name", label: "Forecaster" },
      ...RATING_ORDER.map((r) => ({ key: r, label: r, align: "right" as const })),
      { key: "dem", label: "D side", align: "right" as const },
      { key: "rep", label: "R side", align: "right" as const },
      { key: "rated", label: "Races rated", align: "right" as const },
    ],
    rows: [
      ...order.map((f) => ({ name: f.source, ...f.counts, dem: demSide(f.counts), rep: repSide(f.counts), rated: f.rated })),
      {
        name: "Consensus (median)",
        ...analysis.consensusCounts,
        dem: demSide(analysis.consensusCounts),
        rep: repSide(analysis.consensusCounts),
        rated: analysis.ratedRaces,
      },
      { name: `This model (${envLabel})`, ...modelCounts, dem: demSide(modelCounts), rep: repSide(modelCounts), rated: total },
    ],
  };

  return (
    <ChartFrame
      title="Implied seats"
      subtitle={`Every ${chamber === "house" ? "House seat" : "Senate race up in 2026"} by each forecaster's rating. Races a forecaster does not rate count as Safe for the party their lean favors; Inside Elections' Tilt ratings count as Lean. ${referenceNote} Click a forecaster to focus it.`}
      legend={RATING_ORDER.map((r) => (
        <LegendItem key={r} color={RATING_COLOR[r]} label={r} />
      ))}
      source={source}
      table={table}
      csvName={`forecasters-implied-seats-${chamber}`}
      height={barChartHeight(rows.length, rowHeight, true, true)}
    >
      {(width) => (
        <BarChart
          rows={rows}
          width={width}
          rowHeight={rowHeight}
          max={total}
          segmentLabels={false}
          referenceValue={reference}
          highlightKey={focus || null}
          onRowClick={(key) => {
            if (!key.startsWith("_")) onFocus(key);
          }}
          clickHint="Click to focus this forecaster"
          ariaLabel={`Implied ${chamber === "house" ? "House seats" : "Senate races"} by rating category for each forecaster`}
          tooltip={(row) => {
            const f = byKey.get(row.key);
            const counts = f?.counts ?? (row.key === CONSENSUS_KEY ? analysis.consensusCounts : modelCounts);
            return (
              <>
                <TipTitle>{f ? f.source : row.key === CONSENSUS_KEY ? "Consensus (median rating)" : `This model at ${envLabel}`}</TipTitle>
                {RATING_ORDER.map((r) => (
                  <TipRow key={r} color={RATING_COLOR[r]} label={r} value={fmtNum(counts[r])} />
                ))}
                {f && f.rated < total && (
                  <div className="mt-1 text-[11px] text-ink-2">
                    {fmtNum(total - f.rated)} unrated {chamber === "house" ? "seats" : "races"} counted as Safe by lean
                  </div>
                )}
                <div className="mt-1 text-[11px] text-muted">
                  {f ? "Click to focus this forecaster" : row.key === CONSENSUS_KEY ? "Open the race list" : "Open the simulator"}
                </div>
              </>
            );
          }}
        />
      )}
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* House effects                                                                               */
/* ------------------------------------------------------------------------------------------ */

export function HouseEffects({
  chamber,
  order,
  focus,
  onFocus,
  source,
}: {
  chamber: Chamber;
  order: ForecasterStat[];
  focus: string;
  onFocus: (source: string) => void;
  source: ReactNode;
}) {
  const rated = order.filter((f) => f.effect != null);
  const rows: BarRow[] = rated.map((f) => ({
    key: f.source,
    label: f.short,
    value: f.effect,
    color: (f.effect ?? 0) >= 0 ? "var(--dem)" : "var(--rep)",
  }));
  const byKey = new Map(rated.map((f) => [f.source, f]));
  const extent = Math.max(0.25, ...rated.map((f) => Math.abs(f.effect ?? 0)));

  return (
    <ChartFrame
      title="House effects"
      subtitle="Each forecaster's average rating minus the consensus rating on the races it rates, in rating steps (one step is, say, Lean to Likely). Positive is more Democratic than the consensus, negative more Republican."
      legend={
        <>
          <LegendItem color="var(--dem)" label="More Democratic than consensus" />
          <LegendItem color="var(--rep)" label="More Republican than consensus" />
        </>
      }
      source={source}
      table={{
        columns: [
          { key: "name", label: "Forecaster" },
          { key: "effect", label: "Average vs consensus (steps)", align: "right", format: (v) => (typeof v === "number" ? signed(v, 2) : "—") },
          { key: "moreD", label: "Races more D", align: "right" },
          { key: "moreR", label: "Races more R", align: "right" },
          { key: "rated", label: "Races rated", align: "right" },
        ],
        rows: rated.map((f) => ({
          name: f.source,
          effect: f.effect == null ? null : Number(f.effect.toFixed(3)),
          moreD: f.moreD,
          moreR: f.moreR,
          rated: f.rated,
        })),
      }}
      csvName={`forecasters-house-effects-${chamber}`}
      height={barChartHeight(Math.max(1, rows.length))}
    >
      {(width) =>
        rows.length === 0 ? (
          <Empty title="No ratings to compare" />
        ) : (
          <BarChart
            rows={rows}
            width={width}
            format={(v) => signed(v, 2)}
            tickFormat={(v) => signed(v, 1)}
            max={extent}
            showValues
            valueLabel="Average vs consensus"
            highlightKey={focus || null}
            onRowClick={onFocus}
            clickHint="Click to focus this forecaster"
            ariaLabel="Average rating minus consensus, by forecaster"
            tooltip={(row) => {
              const f = byKey.get(row.key);
              if (!f) return null;
              return (
                <>
                  <TipTitle>{f.source}</TipTitle>
                  <TipRow
                    color={(f.effect ?? 0) >= 0 ? "var(--dem)" : "var(--rep)"}
                    label="Average vs consensus"
                    value={f.effect == null ? "—" : steps(f.effect)}
                  />
                  <TipRow label="Rated more Democratic" value={`${f.moreD} races`} />
                  <TipRow label="Rated more Republican" value={`${f.moreR} races`} />
                  <TipRow label="Same category as consensus" value={f.matchConsensus == null ? "—" : fmtProb(f.matchConsensus)} />
                  <div className="mt-1 text-[11px] text-muted">Click to focus this forecaster</div>
                </>
              );
            }}
          />
        )
      }
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Focused forecaster                                                                          */
/* ------------------------------------------------------------------------------------------ */

export function FocusPanel({
  chamber,
  forecaster,
  analysis,
  raceById,
  onClear,
}: {
  chamber: Chamber;
  forecaster: ForecasterStat;
  analysis: ChamberAnalysis;
  raceById: Map<string, RaceLite>;
  onClear: () => void;
}) {
  const { href } = useScenario();
  const diffs = useMemo(() => {
    const out: { race: RaceLite; rating: string; score: number; diff: number }[] = [];
    for (const [raceId, m] of analysis.byRace) {
      const r = m.get(forecaster.source);
      const race = raceById.get(raceId);
      if (!r || !race || categoryOf(r.rating, r.score) === race.rating) continue;
      out.push({ race, rating: r.rating, score: r.score, diff: r.score - race.ratingScore });
    }
    return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff) || a.race.id.localeCompare(b.race.id, undefined, { numeric: true }));
  }, [analysis, forecaster, raceById]);

  const shown = diffs.slice(0, 12);
  const linkFor = (ids: string[]) => href(explorerHref(ids));

  return (
    <Card>
      <SectionTitle
        title={`Focus: ${forecaster.source}`}
        description={`${fmtNum(forecaster.rated)} ${chamber === "house" ? "House" : "Senate"} races rated, last updated ${fmtDate(forecaster.latest)}. ${
          forecaster.effect == null ? "" : `On average ${steps(forecaster.effect)} from the consensus.`
        }`}
        action={
          <button type="button" onClick={onClear} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
            Clear focus
          </button>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <h3 className="mb-2 text-xs font-medium text-ink-2">Implied seats by category</h3>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
            {RATING_ORDER.map((r) => {
              const ids = forecaster.idsBy[r];
              const body = (
                <>
                  <RatingChip rating={r} size="xs" />
                  <span className="text-lg font-semibold tabular-nums text-ink">{ids.length}</span>
                </>
              );
              return (
                <li key={r} className={chamber === "senate" && ids.length > 0 ? "col-span-2 sm:col-span-2" : ""}>
                  {chamber === "house" && ids.length > 0 ? (
                    <Link
                      href={linkFor(ids)}
                      className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 hover:bg-surface-2"
                      aria-label={`${ids.length} ${r} seats: open them in the race explorer`}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="rounded-lg border border-line px-3 py-2">
                      <div className="flex items-center justify-between gap-2">{body}</div>
                      {chamber === "senate" && ids.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-xs">
                          {ids.map((id) => (
                            <Link key={id} href={href(raceHref(id))} className="font-medium text-ink-2 underline-offset-2 hover:text-ink hover:underline">
                              {id.slice(0, 2)}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
        <div className="min-w-0 lg:col-span-3">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-xs font-medium text-ink-2">
              Races where {forecaster.short} differs from the consensus category ({diffs.length})
            </h3>
            {chamber === "house" && diffs.length > 0 && (
              <Link href={href(explorerHref(diffs.map((d) => d.race.id)))} className="text-xs font-semibold underline underline-offset-2">
                Open all in the race explorer
              </Link>
            )}
          </div>
          {diffs.length === 0 ? (
            <p className="text-sm text-ink-2">Every rating matches the consensus category.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead className="text-left text-xs text-ink-2">
                  <tr>
                    <th className="py-1.5 pr-3 font-medium">Race</th>
                    <th className="py-1.5 pr-3 font-medium">{forecaster.short}</th>
                    <th className="py-1.5 pr-3 font-medium">Consensus</th>
                    <th className="py-1.5 text-right font-medium">Difference</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((d) => (
                    <tr key={d.race.id} className="border-t border-line">
                      <td className="py-1.5 pr-3">
                        <Link href={href(raceHref(d.race.id))} className="font-medium hover:underline">
                          {d.race.id}
                        </Link>
                        <span className="ml-2 text-xs text-ink-2">{d.race.stateName}</span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <RatingChip rating={d.rating} size="xs" />
                      </td>
                      <td className="py-1.5 pr-3">
                        <RatingChip rating={d.race.rating} size="xs" />
                      </td>
                      <td className="py-1.5 text-right tabular-nums">
                        {signed(d.diff, 1)} <span className="text-xs text-ink-2">{d.diff > 0 ? "more D" : "more R"}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {diffs.length > shown.length && (
                <p className="mt-2 text-xs text-ink-2">
                  Showing the {shown.length} largest differences of {diffs.length}.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Agreement matrix                                                                            */
/* ------------------------------------------------------------------------------------------ */

const MATRIX_HEIGHT = 400;

export function AgreementMatrix({
  chamber,
  analysis,
  order,
  pair,
  onPair,
  source,
}: {
  chamber: Chamber;
  analysis: ChamberAnalysis;
  order: ForecasterStat[];
  pair: [string, string] | null;
  onPair: (a: string, b: string) => void;
  source: ReactNode;
}) {
  const rows: HeatmapRow[] = order.map((f) => ({ key: f.source, label: f.short }));
  const cols: HeatmapCol[] = rows.map((r) => ({ key: r.key, label: r.label }));

  const offDiagonal = useMemo(() => {
    const out: { a: string; b: string; share: number; both: number; same: number }[] = [];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const s = analysis.pair(order[i].source, order[j].source);
        if (s.share != null) out.push({ a: order[i].source, b: order[j].source, share: s.share, both: s.both, same: s.same });
      }
    }
    return out;
  }, [analysis, order]);

  const minShare = offDiagonal.length ? Math.min(...offDiagonal.map((p) => p.share)) : 0;
  // Start the scale at the lowest observed agreement (rounded down to 10%) so the classes separate.
  const lo = Math.min(0.9, Math.floor(minShare * 10) / 10);
  const domain: [number, number] = [lo, 1];

  return (
    <ChartFrame
      title="Agreement matrix"
      subtitle="Share of the races both forecasters rate where they give the identical rating. Click a cell to list the races where the two differ."
      legend={<HeatmapScaleLegend domain={domain} format={pct} label="Identical rating" />}
      source={source}
      table={{
        columns: [
          { key: "a", label: "Forecaster A" },
          { key: "b", label: "Forecaster B" },
          { key: "share", label: "Identical rating", align: "right", format: (v) => (typeof v === "number" ? pct(v) : "—") },
          { key: "same", label: "Races identical", align: "right" },
          { key: "both", label: "Races both rate", align: "right" },
        ],
        rows: [...offDiagonal].sort((x, y) => y.share - x.share),
      }}
      csvName={`forecasters-agreement-${chamber}`}
      height={MATRIX_HEIGHT}
    >
      {(width) =>
        offDiagonal.length === 0 ? (
          <Empty title="Not enough ratings to compare">At least two forecasters must rate the same races.</Empty>
        ) : (
          <Heatmap
            width={width}
            height={MATRIX_HEIGHT}
            rows={rows}
            cols={cols}
            value={(a, b) => (a === b ? null : analysis.pair(a, b).share)}
            domain={domain}
            format={pct}
            cellLabel
            diagonal="skip"
            onCellClick={(a, b) => {
              if (a !== b) onPair(a, b);
            }}
            ariaLabel="Agreement between every pair of forecasters"
            tooltip={(a, b, v) => {
              const s = analysis.pair(a, b);
              return (
                <>
                  <TipTitle>
                    {a} and {b}
                  </TipTitle>
                  <TipRow label="Identical rating" value={v == null ? "—" : pct(v)} />
                  <TipRow label="Races both rate" value={fmtNum(s.both)} />
                  <TipRow label="Races they differ on" value={fmtNum(s.both - s.same)} />
                  {pair && ((pair[0] === a && pair[1] === b) || (pair[0] === b && pair[1] === a)) ? (
                    <div className="mt-1 text-[11px] text-muted">Listed beside the matrix</div>
                  ) : (
                    <div className="mt-1 text-[11px] text-muted">Click to list the differences</div>
                  )}
                </>
              );
            }}
          />
        )
      }
    </ChartFrame>
  );
}

export function PairPanel({
  analysis,
  order,
  pair,
  raceById,
  onPair,
  onClear,
}: {
  analysis: ChamberAnalysis;
  order: ForecasterStat[];
  pair: [string, string] | null;
  raceById: Map<string, RaceLite>;
  onPair: (a: string, b: string) => void;
  onClear: () => void;
}) {
  const { href } = useScenario();
  const extremes = useMemo(() => {
    const list: { a: string; b: string; share: number }[] = [];
    for (let i = 0; i < order.length; i++) {
      for (let j = i + 1; j < order.length; j++) {
        const s = analysis.pair(order[i].source, order[j].source).share;
        if (s != null) list.push({ a: order[i].source, b: order[j].source, share: s });
      }
    }
    list.sort((x, y) => y.share - x.share || x.a.localeCompare(y.a));
    return list.length ? { most: list[0], least: list[list.length - 1] } : null;
  }, [analysis, order]);

  const diffs = useMemo(() => (pair ? differences(analysis.byRace, pair[0], pair[1]) : []), [analysis, pair]);

  if (!pair) {
    return (
      <Card className="h-full">
        <SectionTitle title="Where two forecasters differ" description="Select a cell in the matrix to list the races where two forecasters give different ratings." />
        {extremes && (
          <div className="space-y-2">
            {[
              { label: "Most alike", p: extremes.most },
              { label: "Least alike", p: extremes.least },
            ].map(({ label, p }) => (
              <button
                key={label}
                type="button"
                onClick={() => onPair(p.a, p.b)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-left hover:bg-surface-2"
              >
                <span className="min-w-0">
                  <span className="block text-xs text-ink-2">{label}</span>
                  <span className="block truncate text-sm font-medium text-ink">
                    {shortName(p.a)} and {shortName(p.b)}
                  </span>
                </span>
                <span className="text-lg font-semibold tabular-nums text-ink">{pct(p.share)}</span>
              </button>
            ))}
          </div>
        )}
      </Card>
    );
  }

  const [a, b] = pair;
  const stat = analysis.pair(a, b);
  return (
    <Card className="h-full">
      <SectionTitle
        title={`${shortName(a)} vs ${shortName(b)}`}
        description={`${fmtNum(diffs.length)} of ${fmtNum(stat.both)} races rated differently${stat.share == null ? "" : ` (identical on ${pct(stat.share)})`}. Largest differences first.`}
        action={
          <button type="button" onClick={onClear} className="rounded-md px-2 py-1 text-xs font-semibold text-ink-2 underline underline-offset-2 hover:text-ink">
            Clear
          </button>
        }
      />
      {diffs.length === 0 ? (
        <p className="text-sm text-ink-2">These two forecasters give every shared race the same rating.</p>
      ) : (
        <div className="max-h-[360px] overflow-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-surface-2 text-left text-xs text-ink-2">
              <tr>
                <th className="px-3 py-1.5 font-medium">Race</th>
                <th className="px-3 py-1.5 font-medium">{shortName(a)}</th>
                <th className="px-3 py-1.5 font-medium">{shortName(b)}</th>
              </tr>
            </thead>
            <tbody>
              {diffs.map((d) => (
                <tr key={d.raceId} className="border-t border-line">
                  <td className="px-3 py-1.5 whitespace-nowrap">
                    <Link href={href(raceHref(d.raceId))} className="font-medium hover:underline">
                      {d.raceId}
                    </Link>
                    <span className="ml-2 hidden text-xs text-ink-2 sm:inline">{raceById.get(d.raceId)?.stateName}</span>
                  </td>
                  <td className="px-3 py-1.5">
                    <RatingChip rating={d.a.rating} size="xs" />
                  </td>
                  <td className="px-3 py-1.5">
                    <RatingChip rating={d.b.rating} size="xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Most contested races                                                                        */
/* ------------------------------------------------------------------------------------------ */

const BANDS: DotStripBand[] = [
  { from: 3.25, to: 2.5, color: RATING_COLOR["Safe D"] },
  { from: 2.5, to: 1.5, color: RATING_COLOR["Likely D"] },
  { from: 1.5, to: 0.5, color: RATING_COLOR["Lean D"] },
  { from: 0.5, to: -0.5, color: RATING_COLOR.Tossup },
  { from: -0.5, to: -1.5, color: RATING_COLOR["Lean R"] },
  { from: -1.5, to: -2.5, color: RATING_COLOR["Likely R"] },
  { from: -2.5, to: -3.25, color: RATING_COLOR["Safe R"] },
];

const TICKS_WIDE: DotStripTick[] = [
  { value: 3, label: "Safe D" },
  { value: 2, label: "Likely D" },
  { value: 1, label: "Lean D" },
  { value: 0, label: "Tossup" },
  { value: -1, label: "Lean R" },
  { value: -2, label: "Likely R" },
  { value: -3, label: "Safe R" },
];
const TICKS_NARROW: DotStripTick[] = [
  { value: 3, label: "Safe D" },
  { value: 0, label: "Tossup" },
  { value: -3, label: "Safe R" },
];

export function MostContested({ chamber, analysis, source }: { chamber: Chamber; analysis: ChamberAnalysis; source: ReactNode }) {
  const { href } = useScenario();
  const rowHeight = 30;

  const rows = useMemo<DotStripRow[]>(
    () =>
      analysis.contested.map(({ race, ratings }) => ({
        key: race.id,
        label: race.id,
        sublabel: `Consensus ${race.rating}`,
        href: href(raceHref(race.id)),
        range: true,
        marker: { value: race.ratingScore, label: `Consensus: ${race.rating}` },
        dots: [...ratings]
          .sort((x, y) => x.source.localeCompare(y.source))
          .map((r) => ({
            key: r.source,
            value: r.score,
            color: RATING_COLOR[categoryOf(r.rating, r.score)],
            label: `${r.source}: ${r.rating}`,
          })),
      })),
    [analysis, href],
  );

  const table = {
    columns: [
      { key: "race", label: "Race" },
      { key: "consensus", label: "Consensus" },
      { key: "spread", label: "Spread (steps)", align: "right" as const },
      { key: "ratings", label: "Ratings" },
    ],
    rows: analysis.contested.map(({ race, spread, ratings }) => ({
      race: race.id,
      consensus: race.rating,
      spread,
      ratings: [...ratings]
        .sort((x, y) => y.score - x.score || x.source.localeCompare(y.source))
        .map((r) => `${shortName(r.source)}: ${r.rating}`)
        .join("; "),
    })),
  };

  return (
    <ChartFrame
      title="Most contested races"
      subtitle={`The ${rows.length} ${chamber === "house" ? "House" : "Senate"} races where the forecasters' ratings are furthest apart (highest minus lowest). Each dot is one forecaster; the dark tick is the consensus. Click a race to open it.`}
      legend={
        <>
          {RATING_ORDER.map((r) => (
            <LegendItem key={r} color={RATING_COLOR[r]} label={r} shape="dot" />
          ))}
          <LegendItem color="var(--ink)" label="Consensus" shape="line" />
        </>
      }
      source={source}
      table={table}
      csvName={`forecasters-most-contested-${chamber}`}
      height={dotStripHeight(Math.max(rows.length, 1), rowHeight)}
    >
      {(width) =>
        rows.length === 0 ? (
          <Empty title="No disagreements">Every forecaster gives every race the same rating.</Empty>
        ) : (
          <DotStrip
            width={width}
            rows={rows}
            domain={[3.25, -3.25]}
            ticks={width < 560 ? TICKS_NARROW : TICKS_WIDE}
            rowHeight={rowHeight}
            format={scoreLabel}
            formatSpread={(n) => `${Number(n.toFixed(1))} ${n === 1 ? "step" : "steps"}`}
            stackOverlaps
            bands={BANDS}
            ariaLabel={`The ${rows.length} races with the widest spread of forecaster ratings`}
          />
        )
      }
    </ChartFrame>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Freshness                                                                                   */
/* ------------------------------------------------------------------------------------------ */

export function Freshness({
  chamber,
  order,
  newest,
  focus,
  onFocus,
}: {
  chamber: Chamber;
  order: ForecasterStat[];
  newest: string | null;
  focus: string;
  onFocus: (source: string) => void;
}) {
  const columns: Column<ForecasterStat>[] = [
    {
      key: "source",
      header: "Forecaster",
      value: (f) => f.source,
      cell: (f) => (
        <button
          type="button"
          onClick={() => onFocus(f.source)}
          aria-pressed={focus === f.source}
          className="font-medium text-ink hover:underline"
          title="Focus this forecaster"
        >
          {f.source}
        </button>
      ),
    },
    { key: "rated", header: "Races rated", value: (f) => f.rated, align: "right" },
    { key: "latest", header: "Last update", value: (f) => f.latest || null, cell: (f) => fmtDate(f.latest) },
    {
      key: "days",
      header: "Days since update",
      value: (f) => f.daysBehind,
      align: "right",
      cell: (f) => (f.daysBehind == null ? "—" : f.daysBehind === 0 ? "Newest" : `${f.daysBehind} ${f.daysBehind === 1 ? "day" : "days"}`),
    },
    {
      key: "effect",
      header: "Vs consensus",
      value: (f) => (f.effect == null ? null : Number(f.effect.toFixed(3))),
      cell: (f) => (f.effect == null ? "—" : signed(f.effect, 2)),
      align: "right",
      hideOnMobile: true,
    },
    {
      key: "match",
      header: "Same as consensus",
      value: (f) => (f.matchConsensus == null ? null : Number(f.matchConsensus.toFixed(3))),
      cell: (f) => (f.matchConsensus == null ? "—" : fmtProb(f.matchConsensus)),
      align: "right",
      hideOnMobile: true,
    },
  ];

  return (
    <div>
      <SectionTitle
        title="Freshness"
        description={`When each forecaster last updated its ${chamber === "house" ? "House" : "Senate"} ratings. Days are counted from the newest update in the data${
          newest ? ` (${fmtDate(newest)})` : ""
        }, not from today.`}
      />
      <DataTable
        rows={order}
        columns={columns}
        rowKey={(f) => f.source}
        initialSort={{ key: "days", dir: "asc" }}
        csvName={`forecasters-freshness-${chamber}`}
        highlight={(f) => f.source === focus}
        caption={
          <>
            <span className="font-semibold text-ink tabular-nums">{order.length}</span> forecasters
          </>
        }
      />
    </div>
  );
}
