"use client";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Empty, SectionTitle } from "@/components/ui/primitives";
import type { MoneyRow, OutsideRow, SpenderRow } from "@/lib/data/types";
import { fmtDate, fmtMoney, partyName } from "@/lib/format";
import { RATING_COLOR, partyColor } from "@/lib/ratings";

const PARTY_ORDER: Record<string, number> = { D: 0, I: 1, R: 3 };
const ROW_H = 30;
const SUBHEAD = 22;
const TOP_SPENDERS = 10;

function candidateRows(money: MoneyRow[], metric: "receipts" | "cashOnHand"): BarRow[] {
  return [...money]
    .sort((a, b) => (PARTY_ORDER[a.party] ?? 2) - (PARTY_ORDER[b.party] ?? 2) || (b.receipts ?? 0) - (a.receipts ?? 0))
    .map((m) => ({
      key: `${m.fecId || m.candidate}-${metric}`,
      label: m.candidate,
      sublabel: m.party || undefined,
      value: m[metric],
      color: partyColor(m.party),
    }));
}

function CandidateMoney({ raceId, money }: { raceId: string; money: MoneyRow[] }) {
  const raised = candidateRows(money, "receipts");
  const cash = candidateRows(money, "cashOnHand");
  const max = Math.max(1, ...money.map((m) => Math.max(m.receipts ?? 0, m.cashOnHand ?? 0)));
  const each = barChartHeight(raised.length, ROW_H, true);
  const coverage = money.reduce((m, r) => (r.coverageEnd > m ? r.coverageEnd : m), "");
  const parties = [...new Set(money.map((m) => m.party))].sort((a, b) => (PARTY_ORDER[a] ?? 2) - (PARTY_ORDER[b] ?? 2));

  return (
    <ChartFrame
      className="min-w-0"
      title="Raised and cash on hand"
      subtitle="Each candidate's campaign committee, from the latest filings. Both panels share one scale."
      legend={parties.map((p) => (
        <LegendItem key={p || "none"} color={partyColor(p)} label={partyName(p)} />
      ))}
      height={2 * (each + SUBHEAD)}
      csvName={`${raceId.toLowerCase()}-candidate-money`}
      table={{
        columns: [
          { key: "candidate", label: "Candidate" },
          { key: "party", label: "Party" },
          { key: "receipts", label: "Raised", align: "right", format: (v) => fmtMoney(v as number | null) },
          { key: "disbursements", label: "Spent", align: "right", format: (v) => fmtMoney(v as number | null) },
          { key: "cashOnHand", label: "Cash on hand", align: "right", format: (v) => fmtMoney(v as number | null) },
          { key: "selfFunding", label: "Self-funding", align: "right", format: (v) => fmtMoney(v as number | null) },
          { key: "debts", label: "Debts", align: "right", format: (v) => fmtMoney(v as number | null) },
          { key: "coverageEnd", label: "Coverage through", format: (v) => fmtDate(v as string) },
        ],
        rows: money.map((m) => ({ ...m })),
      }}
      source={`Source: Federal Election Commission, filings covering through ${fmtDate(coverage)}.`}
    >
      {(w) => (
        <div className="space-y-0">
          <div className="text-xs font-medium text-ink-2" style={{ height: SUBHEAD }}>
            Raised
          </div>
          <BarChart width={w} rows={raised} rowHeight={ROW_H} max={max} format={fmtMoney} valueLabel="Raised" showValues ariaLabel="Money raised by each candidate" />
          <div className="text-xs font-medium text-ink-2" style={{ height: SUBHEAD }}>
            Cash on hand
          </div>
          <BarChart width={w} rows={cash} rowHeight={ROW_H} max={max} format={fmtMoney} valueLabel="Cash on hand" showValues ariaLabel="Cash on hand for each candidate" />
        </div>
      )}
    </ChartFrame>
  );
}

function OutsideMoney({ raceId, outside }: { raceId: string; outside: OutsideRow }) {
  const rows: BarRow[] = [
    {
      key: "pro-d",
      label: "Pro-Democratic",
      segments: [
        { key: "support-d", label: "Supporting the Democrat", value: outside.supportDem, color: RATING_COLOR["Likely D"] },
        { key: "oppose-r", label: "Opposing the Republican", value: outside.opposeRep, color: RATING_COLOR["Lean D"] },
      ],
    },
    {
      key: "pro-r",
      label: "Pro-Republican",
      segments: [
        { key: "support-r", label: "Supporting the Republican", value: outside.supportRep, color: RATING_COLOR["Likely R"] },
        { key: "oppose-d", label: "Opposing the Democrat", value: outside.opposeDem, color: RATING_COLOR["Lean R"] },
      ],
    },
  ];
  const height = barChartHeight(rows.length, 36, true);

  return (
    <ChartFrame
      title="Outside spending"
      subtitle={`Independent expenditures by groups not tied to a campaign: ${fmtMoney(outside.total)} in all${outside.last30 != null ? `, ${fmtMoney(outside.last30)} in the last 30 days` : ""}.`}
      legend={
        <>
          <LegendItem color={RATING_COLOR["Likely D"]} label="Supporting D" />
          <LegendItem color={RATING_COLOR["Lean D"]} label="Opposing R" />
          <LegendItem color={RATING_COLOR["Likely R"]} label="Supporting R" />
          <LegendItem color={RATING_COLOR["Lean R"]} label="Opposing D" />
        </>
      }
      height={height}
      csvName={`${raceId.toLowerCase()}-outside-spending`}
      table={{
        columns: [
          { key: "side", label: "Side" },
          { key: "support", label: "Supporting own candidate", align: "right", format: (v) => fmtMoney(v as number) },
          { key: "oppose", label: "Opposing the other candidate", align: "right", format: (v) => fmtMoney(v as number) },
          { key: "total", label: "Total", align: "right", format: (v) => fmtMoney(v as number) },
        ],
        rows: [
          { side: "Pro-Democratic", support: outside.supportDem, oppose: outside.opposeRep, total: outside.proDem },
          { side: "Pro-Republican", support: outside.supportRep, oppose: outside.opposeDem, total: outside.proRep },
        ],
      }}
      source={`Source: Federal Election Commission independent expenditures, latest ${fmtDate(outside.latest)}.`}
    >
      {(w) => <BarChart width={w} rows={rows} rowHeight={36} format={fmtMoney} showValues ariaLabel="Outside spending for each side" />}
    </ChartFrame>
  );
}

function TopSpenders({ raceId, spenders }: { raceId: string; spenders: SpenderRow[] }) {
  const top = spenders.slice(0, TOP_SPENDERS);
  const columns: Column<SpenderRow>[] = [
    { key: "spender", header: "Spender", value: (s) => s.spender, className: "max-w-56 truncate" },
    {
      key: "aim",
      header: "Spent to",
      value: (s) => `${s.supportOppose === "S" ? "Support" : "Oppose"} ${s.candidateParty || "?"}`,
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2 rounded-full" style={{ background: partyColor(s.candidateParty) }} />
          {s.supportOppose === "S" ? "Support" : "Oppose"} the {partyName(s.candidateParty)} candidate
        </span>
      ),
    },
    { key: "amount", header: "Amount", value: (s) => s.amount, cell: (s) => fmtMoney(s.amount), align: "right" },
    { key: "latest", header: "Latest", value: (s) => s.latest, cell: (s) => fmtDate(s.latest), align: "right", hideOnMobile: true },
  ];
  return (
    <DataTable
      rows={top}
      columns={columns}
      rowKey={(s) => `${s.spenderId || s.spender}-${s.supportOppose}-${s.candidateParty}`}
      csvName={`${raceId.toLowerCase()}-top-spenders`}
      caption={
        <>
          Top <span className="font-semibold text-ink tabular-nums">{top.length}</span> of {spenders.length} outside spenders
        </>
      }
      initialSort={{ key: "amount", dir: "desc" }}
      maxHeight={420}
    />
  );
}

export function MoneySection({
  raceId,
  money,
  outside,
  spenders,
}: {
  raceId: string;
  money: MoneyRow[];
  outside: OutsideRow | null;
  spenders: SpenderRow[];
}) {
  const none = money.length === 0 && !outside && spenders.length === 0;
  return (
    <section aria-labelledby="money-title" className="mt-8">
      <SectionTitle title={<span id="money-title">Money</span>} description="Campaign fundraising and outside spending reported to the FEC." />
      {none ? (
        <Empty title="No campaign finance data for this race yet">
          Candidate fundraising and outside spending from the Federal Election Commission have not been loaded for this race. This section fills
          in automatically when they are.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {money.length > 0 ? (
            <CandidateMoney raceId={raceId} money={money} />
          ) : (
            <Empty title="No candidate filings loaded">Campaign committee totals for this race are not in the dataset yet.</Empty>
          )}
          <div className="min-w-0 space-y-6">
            {outside && outside.total > 0 ? (
              <OutsideMoney raceId={raceId} outside={outside} />
            ) : (
              <Empty title="No outside spending reported">No independent expenditures are on file for this race.</Empty>
            )}
            {spenders.length > 0 && <TopSpenders raceId={raceId} spenders={spenders} />}
          </div>
        </div>
      )}
    </section>
  );
}
