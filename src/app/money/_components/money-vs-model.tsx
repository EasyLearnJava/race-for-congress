"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ChartFrame, LegendItem, type FrameTable } from "@/components/charts/chart-frame";
import { ScatterPlot, type ScatterPoint, type ScatterRefLine } from "@/components/charts/scatter-plot";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { fmtMargin, fmtMoney, fmtNum, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { RATING_COLOR, RATING_ORDER } from "@/lib/ratings";
import { explorerHref, raceHref } from "@/lib/routes";
import { challengerSide, fmtGap, fmtGapTick } from "./shared";
import type { MoneyRace } from "./types";

const HEIGHT = 400;
const LABELLED = 5;
const REF_LINES: ScatterRefLine[] = [{ x: 0, label: "Even cash" }, { y: 0 }];
const fmtMarginTick = (v: number) => fmtMargin(v, 0);

interface Datum {
  race: MoneyRace;
  projection: RaceProjection;
  challengerCash: number;
  repCash: number;
  /** Cash-on-hand gap, non-Republican side minus Republican, in $ millions. */
  gap: number;
}

export function MoneyVsModel({
  races,
  projections,
  source,
}: {
  races: MoneyRace[];
  projections: Map<string, RaceProjection>;
  source: string;
}) {
  const { href, params } = useScenario();
  const [selected, setSelected] = useState<string[] | null>(null);

  // Contested races where both sides report cash on hand; races settled by the ballot are left out.
  const data = useMemo<Datum[]>(() => {
    const out: Datum[] = [];
    for (const race of races) {
      const projection = projections.get(race.id);
      const ch = challengerSide(race)?.cash;
      const rep = race.candidates?.rep?.cash;
      if (!projection || projection.forced || ch == null || rep == null) continue;
      out.push({ race, projection, challengerCash: ch, repCash: rep, gap: (ch - rep) / 1e6 });
    }
    return out;
  }, [races, projections]);

  const byId = useMemo(() => new Map(data.map((d) => [d.race.id, d])), [data]);

  const points = useMemo<ScatterPoint[]>(
    () =>
      data.map((d) => ({
        id: d.race.id,
        x: d.gap,
        y: d.projection.margin,
        color: RATING_COLOR[d.race.rating],
        label: d.race.label,
        href: href(raceHref(d.race.id)),
      })),
    [data, href],
  );

  const xDomain = useMemo<[number, number]>(() => {
    const m = Math.max(0.5, ...data.map((d) => Math.abs(d.gap)));
    const padded = m * 1.08;
    return [-padded, padded];
  }, [data]);

  const labelIds = useMemo(
    () =>
      [...data]
        .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
        .slice(0, LABELLED)
        .map((d) => d.race.id),
    [data],
  );

  // How often the side with more cash is also the side the model favors.
  const agree = data.filter((d) => d.gap !== 0 && Math.sign(d.gap) === Math.sign(d.projection.margin)).length;
  const decided = data.filter((d) => d.gap !== 0 && d.projection.margin !== 0).length;

  const selectedSet = useMemo(() => (selected ? new Set(selected) : null), [selected]);
  const selectedHouse = (selected ?? []).filter((id) => byId.get(id)?.race.chamber === "house");
  const ratingsShown = RATING_ORDER.filter((r) => data.some((d) => d.race.rating === r));

  const table: FrameTable = {
    columns: [
      { key: "race", label: "Race" },
      { key: "rating", label: "Forecasters" },
      { key: "challengerCash", label: "D (or independent) cash", align: "right", format: (v) => fmtMoney(v as number) },
      { key: "repCash", label: "R cash", align: "right", format: (v) => fmtMoney(v as number) },
      { key: "gap", label: "Cash gap ($M, D minus R)", align: "right", format: (v) => fmtGap(v as number) },
      { key: "margin", label: "Model expected margin", align: "right", format: (v) => fmtMargin(v as number) },
      { key: "pWin", label: "Model chance (D or independent)", align: "right", format: (v) => fmtProb(v as number) },
    ],
    rows: data
      .slice()
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
      .map((d) => ({
        race: d.race.place,
        rating: d.race.rating,
        challengerCash: d.challengerCash,
        repCash: d.repCash,
        gap: Math.round(d.gap * 1000) / 1000,
        margin: Math.round(d.projection.margin * 10) / 10,
        pWin: d.projection.pWin,
      })),
  };

  if (data.length === 0) {
    return (
      <ChartFrame title="Money vs. the model" subtitle="No race has cash-on-hand reports for both sides yet." height={120}>
        {() => <p className="py-8 text-center text-sm text-ink-2">Nothing to compare in this selection.</p>}
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title="Money vs. the model"
      subtitle={
        <>
          Each dot is a contested race: across, the cash-on-hand gap between the nominees (Democratic side to the left); up, the
          model&apos;s expected margin at a national vote of {fmtMargin(params.env)}. The side with more cash is also the side
          the model favors in{" "}
          <span className="font-semibold text-ink tabular-nums">
            {fmtNum(agree)} of {fmtNum(decided)}
          </span>{" "}
          races. Click a dot to open the race, or drag to select a group.
        </>
      }
      legend={ratingsShown.map((r) => (
        <LegendItem key={r} color={RATING_COLOR[r]} label={r} shape="dot" />
      ))}
      source={`Source: ${source}; model at ${fmtMargin(params.env)}. Color is the forecasters' consensus rating. Where no Democrat runs, the independent's cash is used.`}
      table={table}
      csvName="money-vs-model"
      height={HEIGHT}
    >
      {(width) => (
        <>
          <ScatterPlot
            width={width}
            height={HEIGHT}
            points={points}
            xDomain={xDomain}
            xReverse
            xLabel="Cash-on-hand advantage"
            yLabel="Model expected margin"
            xFormat={fmtGapTick}
            yFormat={fmtMarginTick}
            refLines={REF_LINES}
            labelIds={labelIds}
            brushable
            onBrush={setSelected}
            selectedIds={selectedSet}
            ariaLabel={`Scatter plot of ${data.length} races: cash-on-hand advantage against the model's expected margin`}
            tooltip={(p) => {
              const d = byId.get(p.id)!;
              const who = d.race.challenger === "I" ? "Independent" : "Democrat";
              return (
                <>
                  <TipTitle>{d.race.place}</TipTitle>
                  <TipRow color={d.race.challenger === "I" ? "var(--ind)" : "var(--dem)"} label={`${who} cash`} value={fmtMoney(d.challengerCash)} />
                  <TipRow color="var(--rep)" label="Republican cash" value={fmtMoney(d.repCash)} />
                  <TipRow label="Cash advantage" value={fmtGap(d.gap)} />
                  <div className="mt-1 border-t border-line pt-1">
                    <TipRow label="Model expected margin" value={fmtMargin(d.projection.margin)} />
                    <TipRow label={`${who} wins, this scenario`} value={fmtProb(d.projection.pWin)} />
                    <TipRow label="Forecasters" value={d.race.rating} />
                  </div>
                  <div className="mt-1 text-[11px] text-muted">Click to open the race</div>
                </>
              );
            }}
          />
          {selected && selected.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
              <span>
                <span className="font-semibold text-ink tabular-nums">{selected.length}</span> selected
              </span>
              {selectedHouse.length > 0 && (
                <Link href={href(explorerHref(selectedHouse))} className="font-semibold text-ink underline underline-offset-2">
                  Open {selectedHouse.length === 1 ? "this House race" : `these ${selectedHouse.length} House races`} in the explorer
                </Link>
              )}
              <button type="button" onClick={() => setSelected(null)} className="font-medium hover:text-ink hover:underline">
                Clear selection
              </button>
            </div>
          )}
        </>
      )}
    </ChartFrame>
  );
}
