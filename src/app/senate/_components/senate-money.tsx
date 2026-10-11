"use client";

// Money in Senate races: candidate receipts by party, or outside spending helping each side.
// The FEC datasets are optional; without them the card says what is missing instead of
// drawing zeros.
import Link from "next/link";
import { useMemo, useState } from "react";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { useScenario } from "@/components/scenario/scenario";
import { Card, Empty, SectionTitle } from "@/components/ui/primitives";
import type { MoneyRow, OutsideRow, SenateRace } from "@/lib/data/types";
import { fmtDate, fmtMoney } from "@/lib/format";
import { senateHref } from "@/lib/routes";

const TOP = 15;

type Mode = "candidates" | "outside";

export function SenateMoney({ senate, money, outside }: { senate: SenateRace[]; money: MoneyRow[]; outside: OutsideRow[] }) {
  const { href } = useScenario();
  const byId = useMemo(() => new Map(senate.map((r) => [r.id, r])), [senate]);
  const modes = useMemo(() => {
    const m: Mode[] = [];
    if (money.length) m.push("candidates");
    if (outside.length) m.push("outside");
    return m;
  }, [money, outside]);
  const [picked, setPicked] = useState<Mode>("candidates");
  const mode = modes.includes(picked) ? picked : modes[0];

  const candidateRows = useMemo(() => {
    const agg = new Map<string, { D: number; R: number; other: number }>();
    for (const m of money) {
      if (!byId.has(m.raceId)) continue;
      const a = agg.get(m.raceId) ?? { D: 0, R: 0, other: 0 };
      const v = m.receipts ?? 0;
      if (m.party === "D") a.D += v;
      else if (m.party === "R") a.R += v;
      else a.other += v;
      agg.set(m.raceId, a);
    }
    return [...agg.entries()]
      .map(([id, a]) => ({ id, ...a, total: a.D + a.R + a.other }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [money, byId]);

  const outsideRows = useMemo(
    () =>
      outside
        .filter((o) => byId.has(o.raceId) && o.proDem + o.proRep > 0)
        .map((o) => ({ id: o.raceId, proDem: o.proDem, proRep: o.proRep, total: o.proDem + o.proRep }))
        .sort((a, b) => b.total - a.total),
    [outside, byId],
  );

  if (!mode) {
    return (
      <Card>
        <SectionTitle title="Money in Senate races" description="Candidate fundraising and outside spending, race by race." />
        <Empty title="Campaign finance data is not loaded yet">
          The FEC step of the data pipeline has not produced Senate figures for this build, so no totals are shown.{" "}
          <Link href={href("/data")} className="font-medium underline underline-offset-2">
            See the data page
          </Link>
          .
        </Empty>
      </Card>
    );
  }

  const coverage =
    mode === "candidates"
      ? money.reduce((d, m) => (m.coverageEnd > d ? m.coverageEnd : d), "")
      : outside.reduce((d, o) => (o.latest > d ? o.latest : d), "");

  const rows: BarRow[] =
    mode === "candidates"
      ? candidateRows.slice(0, TOP).map((r) => {
          const race = byId.get(r.id)!;
          return {
            key: r.id,
            label: race.stateName,
            href: href(senateHref(race.state)),
            segments: [
              { key: "D", label: "Democratic candidates", value: r.D, color: "var(--dem)" },
              { key: "other", label: "Other candidates", value: r.other, color: "var(--ind)" },
              { key: "R", label: "Republican candidates", value: r.R, color: "var(--rep)" },
            ],
          };
        })
      : outsideRows.slice(0, TOP).map((r) => {
          const race = byId.get(r.id)!;
          return {
            key: r.id,
            label: race.stateName,
            href: href(senateHref(race.state)),
            segments: [
              { key: "proDem", label: "Helping Democrats", value: r.proDem, color: "var(--dem)" },
              { key: "proRep", label: "Helping Republicans", value: r.proRep, color: "var(--rep)" },
            ],
          };
        });

  const height = barChartHeight(Math.max(1, rows.length));

  const toggle =
    modes.length > 1 ? (
      <div role="group" aria-label="Money shown" className="inline-flex rounded-lg border border-line p-0.5 text-xs">
        {modes.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={mode === m}
            onClick={() => setPicked(m)}
            className={`rounded-md px-2.5 py-1 font-medium ${mode === m ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
          >
            {m === "candidates" ? "Candidates" : "Outside groups"}
          </button>
        ))}
      </div>
    ) : null;

  return (
    <ChartFrame
      title={mode === "candidates" ? "Money raised by the candidates" : "Outside spending"}
      subtitle={`The ${Math.min(TOP, rows.length)} Senate races with the most ${mode === "candidates" ? "candidate receipts" : "independent expenditures"}. Click a race to open it.`}
      height={height}
      actions={toggle}
      csvName={mode === "candidates" ? "senate-candidate-money" : "senate-outside-spending"}
      source={`Source: Federal Election Commission${coverage ? `, through ${fmtDate(coverage)}` : ""}. Totals cover candidates matched to nominees only.`}
      legend={
        mode === "candidates" ? (
          <>
            <LegendItem color="var(--dem)" label="Democratic" />
            <LegendItem color="var(--ind)" label="Other" />
            <LegendItem color="var(--rep)" label="Republican" />
          </>
        ) : (
          <>
            <LegendItem color="var(--dem)" label="Helping Democrats" />
            <LegendItem color="var(--rep)" label="Helping Republicans" />
          </>
        )
      }
      table={
        mode === "candidates"
          ? {
              columns: [
                { key: "race", label: "Race" },
                { key: "D", label: "Democratic", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "other", label: "Other", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "R", label: "Republican", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "total", label: "Total", align: "right", format: (v) => fmtMoney(Number(v)) },
              ],
              rows: candidateRows.map((r) => ({ race: byId.get(r.id)!.stateName, D: r.D, other: r.other, R: r.R, total: r.total })),
            }
          : {
              columns: [
                { key: "race", label: "Race" },
                { key: "proDem", label: "Helping Democrats", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "proRep", label: "Helping Republicans", align: "right", format: (v) => fmtMoney(Number(v)) },
                { key: "total", label: "Total", align: "right", format: (v) => fmtMoney(Number(v)) },
              ],
              rows: outsideRows.map((r) => ({ race: byId.get(r.id)!.stateName, proDem: r.proDem, proRep: r.proRep, total: r.total })),
            }
      }
    >
      {(width) =>
        rows.length ? (
          <BarChart rows={rows} width={width} format={fmtMoney} tickFormat={fmtMoney} showValues clickHint="Click to open the race" />
        ) : (
          <p className="py-8 text-center text-sm text-ink-2">No Senate race has reported totals yet.</p>
        )
      }
    </ChartFrame>
  );
}
