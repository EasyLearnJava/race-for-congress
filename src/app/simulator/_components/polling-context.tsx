"use client";

// Where the default national vote comes from: each generic-ballot polling average, with the
// overall average as a reference line. Clicking a row sets the national vote to that average.
// Optional data: until the pipeline loads it, an Empty card says so.
import Link from "next/link";
import { useMemo } from "react";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame } from "@/components/charts/chart-frame";
import { useScenario } from "@/components/scenario/scenario";
import { Empty, SectionTitle } from "@/components/ui/primitives";
import { fmtDate, fmtMargin, fmtPct } from "@/lib/format";
import type { Environment, PollRow } from "./types";

const ROW_HEIGHT = 30;

export function PollingContext({ polls, environment }: { polls: PollRow[]; environment: Environment | null }) {
  const { href, set } = useScenario();

  const usable = useMemo(() => polls.filter((p) => p.margin != null && Number.isFinite(p.margin)), [polls]);
  const rows = useMemo<BarRow[]>(
    () =>
      [...usable]
        .sort((a, b) => (b.margin ?? 0) - (a.margin ?? 0))
        .map((p, i) => ({
          key: `${p.source}-${i}`,
          label: p.source,
          sublabel: p.updated ? `updated ${fmtDate(p.updated, true)}` : undefined,
          value: p.margin,
          color: (p.margin ?? 0) >= 0 ? "var(--dem)" : "var(--rep)",
        })),
    [usable],
  );
  const byKey = useMemo(() => new Map(rows.map((r) => [r.key, r.value ?? 0])), [rows]);
  const hasRef = environment != null;

  return (
    <section aria-labelledby="polls-title" className="mt-8">
      <SectionTitle
        title={<span id="polls-title">Where the polling average comes from</span>}
        description="The default national vote is the average of the published generic-ballot polling averages. Pick one to see the race through its numbers."
      />
      {rows.length === 0 ? (
        <Empty title="No generic-ballot averages loaded yet">
          The data pipeline has not added the generic-ballot polling averages, so the polling-average preset uses an even national
          vote ({fmtMargin(0)}). Every other control works as usual.{" "}
          <Link href={href("/data")} className="font-medium underline underline-offset-2">
            See the data sources
          </Link>
          .
        </Empty>
      ) : (
        <ChartFrame
          title="Generic-ballot polling averages"
          subtitle="Democratic minus Republican share of the national House vote in each average. Click a row to set the national vote to it."
          height={barChartHeight(rows, ROW_HEIGHT, true, hasRef)}
          csvName="simulator-generic-ballot-averages"
          source={
            environment
              ? `Sources: ${environment.sources.join(", ")}. Average of ${environment.nSources} as of ${fmtDate(environment.asOf)}.`
              : "Sources: each polling average as listed."
          }
          table={{
            columns: [
              { key: "source", label: "Average" },
              { key: "dates", label: "Field dates" },
              { key: "updated", label: "Updated" },
              { key: "dem", label: "Democratic", align: "right", format: (v) => (v == null ? "—" : fmtPct(Number(v))) },
              { key: "rep", label: "Republican", align: "right", format: (v) => (v == null ? "—" : fmtPct(Number(v))) },
              { key: "margin", label: "Margin", align: "right", format: (v) => fmtMargin(v == null ? null : Number(v)) },
            ],
            rows: usable.map((p) => ({ ...p })),
          }}
        >
          {(width) => (
            <BarChart
              width={width}
              rows={rows}
              rowHeight={ROW_HEIGHT}
              format={(v) => fmtMargin(v)}
              tickFormat={(v) => fmtMargin(v, 0)}
              showValues
              valueLabel="Margin"
              referenceValue={hasRef ? { value: environment.margin, label: `Average ${fmtMargin(environment.margin)}` } : undefined}
              onRowClick={(key) => set({ env: byKey.get(key) ?? 0 })}
              clickHint="Click to set the national vote to this average"
              ariaLabel="Generic-ballot polling averages, Democratic minus Republican margin"
            />
          )}
        </ChartFrame>
      )}
    </section>
  );
}
