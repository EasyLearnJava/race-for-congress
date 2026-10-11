"use client";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { LineChart } from "@/components/charts/line-chart";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Empty, SectionTitle } from "@/components/ui/primitives";
import type { HistoryRow } from "@/lib/data/types";
import { fmtMargin, fmtNum, partyName } from "@/lib/format";
import { partyColor } from "@/lib/ratings";

const HEIGHT = 220;
const CAPTION =
  "District lines changed over time (after each census, and in some states more often), so earlier rows describe the district as it was drawn that year, not the 2026 lines.";

export function HistorySection({ raceId, history }: { raceId: string; history: HistoryRow[] }) {
  const withMargin = history.filter((h) => h.margin != null);
  const columns: Column<HistoryRow>[] = [
    { key: "year", header: "Year", value: (h) => h.year },
    {
      key: "winner",
      header: "Winner",
      value: (h) => h.winner,
      cell: (h) => (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: partyColor(h.winnerParty) }} />
          {h.winner || "—"}
          <span className="text-ink-2">({h.winnerParty || "?"})</span>
        </span>
      ),
    },
    { key: "margin", header: "Margin", value: (h) => h.margin, cell: (h) => (h.margin == null ? "Uncontested" : fmtMargin(h.margin)), align: "right" },
    { key: "dem", header: "D votes", value: (h) => h.dem, cell: (h) => fmtNum(h.dem), align: "right", hideOnMobile: true },
    { key: "rep", header: "R votes", value: (h) => h.rep, cell: (h) => fmtNum(h.rep), align: "right", hideOnMobile: true },
    { key: "total", header: "Total", value: (h) => h.total, cell: (h) => fmtNum(h.total), align: "right", hideOnMobile: true },
  ];

  return (
    <section aria-labelledby="history-title" className="mt-8">
      <SectionTitle title={<span id="history-title">Past House results</span>} description={CAPTION} />
      {history.length === 0 ? (
        <Empty title="Past results are not loaded yet">
          House results from 2002 to 2024 (MIT Election Data and Science Lab) appear here once that dataset is added.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          {withMargin.length >= 2 ? (
            <ChartFrame
              className="min-w-0 lg:col-span-2"
              title="Winning margin by year"
              subtitle="Democratic minus Republican share of the House vote, on the lines in force each year."
              legend={<LegendItem shape="line" color="var(--ink-2)" label="House margin" />}
              height={HEIGHT}
              csvName={`${raceId.toLowerCase()}-house-history`}
              table={{
                columns: [
                  { key: "year", label: "Year" },
                  { key: "margin", label: "Margin", align: "right", format: (v) => fmtMargin(v as number | null) },
                  { key: "winner", label: "Winner" },
                ],
                rows: history.map((h) => ({ year: h.year, margin: h.margin, winner: `${h.winner} (${h.winnerParty})` })),
              }}
              source="Source: MIT Election Data and Science Lab, U.S. House 1976–2024 (CC0)."
            >
              {(w) => (
                <LineChart
                  width={w}
                  height={HEIGHT}
                  series={[{ key: "margin", label: "Margin", color: "var(--ink-2)", points: history.map((h) => [h.year, h.margin] as const) }]}
                  xFormat={(x) => String(Math.round(x))}
                  xTickFormat={(x) => String(Math.round(x))}
                  yFormat={(y) => fmtMargin(y)}
                  yTickFormat={(y) => fmtMargin(y, 0)}
                  refLines={[{ y: 0, label: "Even" }]}
                  endLabels={false}
                  ariaLabel={`House margin in ${raceId} by year, ${history[0].year} to ${history[history.length - 1].year}`}
                />
              )}
            </ChartFrame>
          ) : null}
          <div className={withMargin.length >= 2 ? "min-w-0 lg:col-span-3" : "min-w-0 lg:col-span-5"}>
            <DataTable
              rows={history}
              columns={columns}
              rowKey={(h) => String(h.year)}
              csvName={`${raceId.toLowerCase()}-house-results`}
              initialSort={{ key: "year", dir: "desc" }}
              caption={`${history.length} elections · ${partyName(history[history.length - 1].winnerParty)} won the most recent`}
              maxHeight={420}
            />
          </div>
        </div>
      )}
    </section>
  );
}
