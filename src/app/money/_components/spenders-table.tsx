"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SectionTitle } from "@/components/ui/primitives";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { raceHref } from "@/lib/routes";
import { setSearchParams } from "@/lib/url-state";
import type { ChamberFilter } from "./shared";
import type { MoneyRace, SpenderRace, SpenderSummary } from "./types";

interface SpenderRow {
  id: string;
  name: string;
  total: number;
  proDem: number;
  proRep: number;
  other: number;
  /** Race ids, largest spending first. */
  races: string[];
  latest: string;
}

/** Share of a spender's money helping Democrats, Republicans and others, as one bar. */
function SplitBar({ row }: { row: SpenderRow }) {
  const total = row.total || 1;
  const d = row.proDem / total;
  const o = row.other / total;
  const r = row.proRep / total;
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className="flex h-2.5 w-24 overflow-hidden rounded-sm bg-surface-2">
        {d > 0 && <span style={{ width: `${d * 100}%`, background: "var(--dem)" }} />}
        {o > 0 && <span style={{ width: `${o * 100}%`, background: "var(--ind)" }} />}
        {r > 0 && <span style={{ width: `${r * 100}%`, background: "var(--rep)" }} />}
      </span>
      <span className="w-20 text-xs text-ink-2">
        {Math.round(d * 100)}% D · {Math.round(r * 100)}% R
      </span>
    </span>
  );
}

export function SpendersTable({
  spenders,
  spenderRaces,
  spenderCount,
  raceById,
  chamber,
  source,
}: {
  spenders: SpenderSummary[];
  spenderRaces: SpenderRace[];
  spenderCount: number;
  raceById: Map<string, MoneyRace>;
  chamber: ChamberFilter;
  source: string;
}) {
  const { href } = useScenario();

  // Totals across every race, or recomputed for the chosen chamber from the per-race rows.
  const rows = useMemo<SpenderRow[]>(() => {
    if (chamber === "all") return spenders;
    const acc = new Map<string, SpenderRow & { byRace: Map<string, number> }>();
    const meta = new Map(spenders.map((s) => [s.id, s]));
    for (const sr of spenderRaces) {
      const race = raceById.get(sr.raceId);
      const s = meta.get(sr.spender);
      if (!race || !s || race.chamber !== chamber) continue;
      const row = acc.get(s.id) ?? { ...s, total: 0, proDem: 0, proRep: 0, other: 0, races: [], byRace: new Map<string, number>() };
      const amount = sr.proDem + sr.proRep + sr.other;
      row.total += amount;
      row.proDem += sr.proDem;
      row.proRep += sr.proRep;
      row.other += sr.other;
      row.byRace.set(sr.raceId, (row.byRace.get(sr.raceId) ?? 0) + amount);
      acc.set(s.id, row);
    }
    return [...acc.values()]
      .filter((r) => r.total > 0)
      .map(({ byRace, ...r }) => ({ ...r, races: [...byRace.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id) }));
  }, [spenders, spenderRaces, raceById, chamber]);

  const focus = (id: string) => {
    setSearchParams({ spender: id });
    document.getElementById("outside-spending")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const columns: Column<SpenderRow>[] = [
    {
      key: "name",
      header: "Spender",
      value: (r) => r.name,
      cell: (r) => (
        <button
          type="button"
          onClick={() => focus(r.id)}
          className="max-w-56 truncate text-left font-medium hover:underline sm:max-w-72"
          title={`Show where ${r.name} spent`}
        >
          {r.name}
        </button>
      ),
    },
    { key: "total", header: "Total", align: "right", value: (r) => r.total, cell: (r) => fmtMoney(r.total) },
    {
      key: "split",
      header: "Helping D vs R",
      value: (r) => (r.total > 0 ? Math.round((r.proDem / r.total) * 1000) / 10 : null),
      cell: (r) => <SplitBar row={r} />,
    },
    { key: "proDem", header: "Helping D", align: "right", value: (r) => r.proDem, cell: (r) => fmtMoney(r.proDem), hideOnMobile: true },
    { key: "proRep", header: "Helping R", align: "right", value: (r) => r.proRep, cell: (r) => fmtMoney(r.proRep), hideOnMobile: true },
    { key: "raceCount", header: "Races", align: "right", value: (r) => r.races.length, cell: (r) => fmtNum(r.races.length) },
    {
      key: "races",
      header: "Largest races",
      sortable: false,
      value: (r) => r.races.join(" "),
      cell: (r) => (
        <span className="inline-flex gap-2">
          {r.races.slice(0, 3).map((id) => (
            <Link key={id} href={href(raceHref(id))} className="text-ink-2 underline-offset-2 hover:text-ink hover:underline">
              {raceById.get(id)?.label ?? id}
            </Link>
          ))}
          {r.races.length > 3 && <span className="text-muted">+{r.races.length - 3}</span>}
        </span>
      ),
    },
    { key: "latest", header: "Latest", value: (r) => r.latest, cell: (r) => fmtDate(r.latest, true), hideOnMobile: true },
  ];

  const capped = spenderCount > spenders.length;

  return (
    <section aria-labelledby="spenders-title">
      <SectionTitle
        title={<span id="spenders-title">Top outside spenders</span>}
        description="Super PACs, party committees and other groups, ranked by general-election independent expenditures. Helping Democrats means supporting a Democrat or opposing a Republican, and the reverse for Republicans. Click a spender to chart its races."
      />
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        initialSort={{ key: "total", dir: "desc" }}
        csvName={`outside-spenders${chamber === "all" ? "" : `-${chamber}`}`}
        maxHeight={560}
        caption={
          <>
            <span className="font-semibold text-ink tabular-nums">{fmtNum(rows.length)}</span> spenders
            {capped ? ` (the ${fmtNum(spenders.length)} largest of ${fmtNum(spenderCount)}; the full list is on the data page)` : ""}
          </>
        }
      />
      <p className="mt-2 text-[11px] leading-4 text-muted">
        Source: {source}. Amounts are summed across the races each spender reported; spending for or against independents and
        other nominees is counted in the total but not in either party&apos;s share.
      </p>
    </section>
  );
}
