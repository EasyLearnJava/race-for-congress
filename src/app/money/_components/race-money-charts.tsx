"use client";

import Link from "next/link";
import { useMemo } from "react";

import { BarChart, barChartHeight, type BarRow, type BarSegment } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem, type FrameTable } from "@/components/charts/chart-frame";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { fmtMoney, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { explorerHref, raceHref } from "@/lib/routes";
import { useQueryParam } from "@/lib/url-state";
import { type ChamberFilter, METRIC_LABEL, type Metric, Segmented, candidateTotal, parseMetric, sideValue } from "./shared";
import type { MoneyRace, SpenderRace, SpenderSummary } from "./types";

const TOP = 20;
const ROW_HEIGHT = 28;
const money = (v: unknown) => (typeof v === "number" ? fmtMoney(v) : "—");

/** The model's chance for the race's non-Republican side, as a tooltip row. */
function ModelRow({ race, projection }: { race: MoneyRace; projection: RaceProjection | undefined }) {
  if (!projection) return null;
  const who = projection.challenger === "I" ? "Independent" : "Democrat";
  const p = projection.forced ? (projection.margin > 0 ? 1 : 0) : projection.pWin;
  return (
    <div className="mt-1 border-t border-line pt-1">
      <TipRow label={`${who} wins, this scenario`} value={fmtProb(p)} />
      <TipRow label="Forecasters" value={race.rating} />
    </div>
  );
}

export function CandidateMoneyChart({
  races,
  projections,
  source,
}: {
  races: MoneyRace[];
  projections: Map<string, RaceProjection>;
  source: string;
}) {
  const { href } = useScenario();
  const [metric, setMetric] = useQueryParam<Metric>("metric", "raised", parseMetric);

  const ranked = useMemo(
    () =>
      races
        .filter((r) => r.candidates && candidateTotal(r, metric) > 0)
        .sort((a, b) => candidateTotal(b, metric) - candidateTotal(a, metric))
        .slice(0, TOP),
    [races, metric],
  );
  const hasOther = ranked.some((r) => (sideValue(r.candidates?.other, metric) ?? 0) > 0);

  const rows = useMemo<BarRow[]>(
    () =>
      ranked.map((r) => {
        const c = r.candidates!;
        const segments: BarSegment[] = [
          { key: "dem", label: `Democratic nominee${c.dem?.names.includes(" / ") ? "s" : ""}`, value: sideValue(c.dem, metric), color: "var(--dem)" },
          { key: "other", label: "Independent and other nominees", value: sideValue(c.other, metric), color: "var(--ind)" },
          { key: "rep", label: `Republican nominee${c.rep?.names.includes(" / ") ? "s" : ""}`, value: sideValue(c.rep, metric), color: "var(--rep)" },
        ];
        return { key: r.id, label: r.label, sublabel: r.rating, href: href(raceHref(r.id)), segments };
      }),
    [ranked, metric, href],
  );
  const byId = useMemo(() => new Map(ranked.map((r) => [r.id, r])), [ranked]);

  const table: FrameTable = {
    columns: [
      { key: "race", label: "Race" },
      { key: "rating", label: "Forecasters" },
      { key: "dem", label: "Democratic nominee" },
      { key: "demValue", label: `D ${METRIC_LABEL[metric].toLowerCase()}`, align: "right", format: money },
      { key: "rep", label: "Republican nominee" },
      { key: "repValue", label: `R ${METRIC_LABEL[metric].toLowerCase()}`, align: "right", format: money },
      { key: "otherValue", label: `Other ${METRIC_LABEL[metric].toLowerCase()}`, align: "right", format: money },
      { key: "total", label: "Total", align: "right", format: money },
    ],
    rows: ranked.map((r) => ({
      race: r.place,
      rating: r.rating,
      dem: r.candidates?.dem?.names ?? "",
      demValue: sideValue(r.candidates?.dem, metric),
      rep: r.candidates?.rep?.names ?? "",
      repValue: sideValue(r.candidates?.rep, metric),
      otherValue: sideValue(r.candidates?.other, metric),
      total: candidateTotal(r, metric),
    })),
  };

  const metricText = metric === "raised" ? "raised" : metric === "spent" ? "spent" : "held in cash";

  return (
    <ChartFrame
      title="Top races by candidate money"
      subtitle={`The ${TOP} races where the nominees' campaigns have ${metricText} the most, Democrats on the left. Click a bar to open the race.`}
      legend={
        <>
          <LegendItem color="var(--dem)" label="Democratic nominee" />
          {hasOther && <LegendItem color="var(--ind)" label="Independent and other" />}
          <LegendItem color="var(--rep)" label="Republican nominee" />
        </>
      }
      actions={
        <Segmented
          label="Candidate money measure"
          value={metric}
          onChange={(v) => setMetric(v === "raised" ? null : v)}
          options={(["raised", "spent", "cash"] as const).map((m) => ({ value: m, label: m === "cash" ? "Cash" : METRIC_LABEL[m] }))}
        />
      }
      source={`Source: ${source}. Totals since Jan 1, 2025, matched nominees only.`}
      table={table}
      csvName={`top-races-candidate-${metric}`}
      height={barChartHeight(Math.max(1, rows.length), ROW_HEIGHT)}
    >
      {(width) => (
        <BarChart
          rows={rows}
          width={width}
          rowHeight={ROW_HEIGHT}
          format={fmtMoney}
          segmentLabels={false}
          ariaLabel={`Top ${rows.length} races by candidate money ${metricText}, stacked by party`}
          clickHint="Click to open the race"
          tooltip={(row) => {
            const r = byId.get(row.key)!;
            const c = r.candidates!;
            return (
              <>
                <TipTitle>{r.place}</TipTitle>
                {c.dem && <TipRow color="var(--dem)" label={c.dem.names || "Democrat"} value={money(sideValue(c.dem, metric))} />}
                {c.other && <TipRow color="var(--ind)" label={c.other.names || "Other"} value={money(sideValue(c.other, metric))} />}
                {c.rep && <TipRow color="var(--rep)" label={c.rep.names || "Republican"} value={money(sideValue(c.rep, metric))} />}
                <TipRow label={`Total ${metricText}`} value={fmtMoney(candidateTotal(r, metric))} />
                <ModelRow race={r} projection={projections.get(r.id)} />
                <div className="mt-1 text-[11px] text-muted">Click to open the race</div>
              </>
            );
          }}
        />
      )}
    </ChartFrame>
  );
}

export function OutsideMoneyChart({
  races,
  raceById,
  spenders,
  spenderRaces,
  projections,
  chamber,
  source,
}: {
  races: MoneyRace[];
  raceById: Map<string, MoneyRace>;
  spenders: SpenderSummary[];
  spenderRaces: SpenderRace[];
  projections: Map<string, RaceProjection>;
  chamber: ChamberFilter;
  source: string;
}) {
  const { href } = useScenario();
  const [spenderId, setSpender] = useQueryParam<string>("spender", "", (s) => s);
  const focus = spenders.find((s) => s.id === spenderId) ?? null;

  // One row shape for both views: everything outside groups spent, or one spender's share.
  const ranked = useMemo(() => {
    if (focus) {
      return spenderRaces
        .filter((s) => s.spender === focus.id)
        .map((s) => ({ race: raceById.get(s.raceId), proDem: s.proDem, proRep: s.proRep, other: s.other }))
        .filter((s): s is { race: MoneyRace; proDem: number; proRep: number; other: number } => !!s.race)
        .filter((s) => chamber === "all" || s.race.chamber === chamber)
        .map((s) => ({ ...s, total: s.proDem + s.proRep + s.other }))
        .filter((s) => s.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, TOP);
    }
    return races
      .filter((r) => r.outside && r.outside.total > 0)
      .map((r) => ({ race: r, proDem: r.outside!.proDem, proRep: r.outside!.proRep, other: r.outside!.other, total: r.outside!.total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, TOP);
  }, [focus, spenderRaces, raceById, chamber, races]);
  const hasOther = ranked.some((r) => r.other > 0);
  const byId = useMemo(() => new Map(ranked.map((r) => [r.race.id, r])), [ranked]);

  const rows = useMemo<BarRow[]>(
    () =>
      ranked.map((r) => ({
        key: r.race.id,
        label: r.race.label,
        sublabel: r.race.rating,
        href: href(raceHref(r.race.id)),
        segments: [
          { key: "dem", label: "Helping Democrats", value: r.proDem, color: "var(--dem)" },
          { key: "other", label: "For or against others", value: r.other, color: "var(--ind)" },
          { key: "rep", label: "Helping Republicans", value: r.proRep, color: "var(--rep)" },
        ],
      })),
    [ranked, href],
  );

  const houseIds = ranked.filter((r) => r.race.chamber === "house").map((r) => r.race.id);
  const table: FrameTable = {
    columns: [
      { key: "race", label: "Race" },
      { key: "rating", label: "Forecasters" },
      { key: "proDem", label: "Helping Democrats", align: "right", format: money },
      { key: "proRep", label: "Helping Republicans", align: "right", format: money },
      { key: "other", label: "For or against others", align: "right", format: money },
      { key: "total", label: "Total", align: "right", format: money },
    ],
    rows: ranked.map((r) => ({ race: r.race.place, rating: r.race.rating, proDem: r.proDem, proRep: r.proRep, other: r.other, total: r.total })),
  };

  return (
    <div id="outside-spending" className="scroll-mt-28">
      <ChartFrame
        title={focus ? `Where ${focus.name} spent` : "Top races by outside spending"}
        subtitle={
          focus
            ? `This spender's general-election independent expenditures, by race and the side they help. Click a bar to open the race.`
            : `The ${TOP} races with the most independent expenditures, split by the side the spending helps: support for a party's nominee or opposition to the other party's. Click a bar to open the race.`
        }
        legend={
          <>
            <LegendItem color="var(--dem)" label="Helping Democrats" />
            {hasOther && <LegendItem color="var(--ind)" label="For or against others" />}
            <LegendItem color="var(--rep)" label="Helping Republicans" />
          </>
        }
        actions={
          focus ? (
            <button
              type="button"
              onClick={() => setSpender(null)}
              className="rounded-md border border-line px-2 py-1 text-xs font-medium text-ink hover:bg-surface-2"
            >
              Show all spenders
            </button>
          ) : undefined
        }
        source={
          <>
            Source: {source}. General election only.
            {houseIds.length > 0 && (
              <>
                {" "}
                <Link href={href(explorerHref(houseIds))} className="font-semibold text-ink-2 underline underline-offset-2">
                  Open these House races in the explorer
                </Link>
              </>
            )}
          </>
        }
        table={table}
        csvName={focus ? `outside-spending-${focus.id}` : "top-races-outside-spending"}
        height={barChartHeight(Math.max(1, rows.length), ROW_HEIGHT)}
      >
        {(width) => (
          <BarChart
            rows={rows}
            width={width}
            rowHeight={ROW_HEIGHT}
            format={fmtMoney}
            segmentLabels={false}
            ariaLabel={`${focus ? `Races where ${focus.name} spent` : "Top races by outside spending"}, stacked by the side helped`}
            clickHint="Click to open the race"
            tooltip={(row) => {
              const r = byId.get(row.key)!;
              const o = r.race.outside;
              return (
                <>
                  <TipTitle>{r.race.place}</TipTitle>
                  <TipRow color="var(--dem)" label="Helping Democrats" value={fmtMoney(r.proDem)} />
                  <TipRow color="var(--rep)" label="Helping Republicans" value={fmtMoney(r.proRep)} />
                  {r.other > 0 && <TipRow color="var(--ind)" label="For or against others" value={fmtMoney(r.other)} />}
                  <TipRow label={focus ? "This spender, total" : "Total"} value={fmtMoney(r.total)} />
                  {!focus && o?.last30 != null && <TipRow label="Last 30 days" value={fmtMoney(o.last30)} />}
                  <ModelRow race={r.race} projection={projections.get(r.race.id)} />
                  <div className="mt-1 text-[11px] text-muted">Click to open the race</div>
                </>
              );
            }}
          />
        )}
      </ChartFrame>
    </div>
  );
}
