"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { Card, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { fmtDate, fmtMoney, fmtNum } from "@/lib/format";
import { useProjections } from "@/lib/model/use-outlook";
import { raceHref } from "@/lib/routes";
import { useQueryParam } from "@/lib/url-state";
import { CandidateMoneyChart, OutsideMoneyChart } from "./race-money-charts";
import { MoneyVsModel } from "./money-vs-model";
import { SpendersTable } from "./spenders-table";
import { candidateTotal, type ChamberFilter, Segmented, parseChamber } from "./shared";
import type { Coverage, MoneyRace, SpenderRace, SpenderSummary } from "./types";

export function MoneyDashboard({
  races,
  spenders,
  spenderRaces,
  spenderCount,
  coverage,
}: {
  races: MoneyRace[];
  spenders: SpenderSummary[];
  spenderRaces: SpenderRace[];
  spenderCount: number;
  coverage: Coverage;
}) {
  const { href } = useScenario();
  const [chamber, setChamber] = useQueryParam<ChamberFilter>("chamber", "all", parseChamber);
  const projections = useProjections(races);

  const hasCandidates = races.some((r) => r.candidates);
  const hasOutside = races.some((r) => r.outside);
  const hasAny = hasCandidates || hasOutside || spenders.length > 0;

  const shown = useMemo(() => (chamber === "all" ? races : races.filter((r) => r.chamber === chamber)), [races, chamber]);
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);

  const kpis = useMemo(() => {
    let dem = 0;
    let rep = 0;
    let proDem = 0;
    let proRep = 0;
    let last30 = 0;
    let hasLast30 = false;
    let top: { race: MoneyRace; total: number } | null = null;
    for (const r of shown) {
      dem += r.candidates?.dem?.raised ?? 0;
      rep += r.candidates?.rep?.raised ?? 0;
      proDem += r.outside?.proDem ?? 0;
      proRep += r.outside?.proRep ?? 0;
      if (r.outside?.last30 != null) {
        last30 += r.outside.last30;
        hasLast30 = true;
      }
      const total = candidateTotal(r, "raised") + (r.outside?.total ?? 0);
      if (total > 0 && (!top || total > top.total)) top = { race: r, total };
    }
    return { dem, rep, proDem, proRep, last30: hasLast30 ? last30 : null, top };
  }, [shown]);

  const scope = chamber === "house" ? "House" : chamber === "senate" ? "Senate" : "House and Senate";

  return (
    <div className="pb-6">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "Campaign money" }]}
        eyebrow="2026 midterms · Campaign finance"
        title="Where the money is going"
        description="Fundraising by each party's nominees and spending by outside groups, race by race, set beside the model. Click any bar, point or row to open the race."
      />

      {!hasAny ? (
        <NoMoneyData />
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Races to include"
              value={chamber}
              onChange={(v) => setChamber(v === "all" ? null : v)}
              options={[
                { value: "all", label: "All races" },
                { value: "house", label: "House" },
                { value: "senate", label: "Senate" },
              ]}
            />
            <p className="text-xs text-ink-2">
              {coverage.candidateEnd && <>Candidate reports through {fmtDate(coverage.candidateEnd)}. </>}
              {coverage.outsideLatest && <>Outside spending through {fmtDate(coverage.outsideLatest)}.</>}
            </p>
          </div>

          <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Raised by Democratic nominees"
              value={hasCandidates ? fmtMoney(kpis.dem) : "—"}
              detail={hasCandidates ? `${scope} campaign committees` : "Candidate data not loaded"}
              accent="var(--dem)"
            />
            <Stat
              label="Raised by Republican nominees"
              value={hasCandidates ? fmtMoney(kpis.rep) : "—"}
              detail={hasCandidates ? `${scope} campaign committees` : "Candidate data not loaded"}
              accent="var(--rep)"
            />
            <Stat
              label="Outside spending helping Democrats"
              value={hasOutside ? fmtMoney(kpis.proDem) : "—"}
              detail={hasOutside ? "For Democrats or against Republicans" : "Outside data not loaded"}
              accent="var(--dem)"
            />
            <Stat
              label="Outside spending helping Republicans"
              value={hasOutside ? fmtMoney(kpis.proRep) : "—"}
              detail={hasOutside ? "For Republicans or against Democrats" : "Outside data not loaded"}
              accent="var(--rep)"
            />
            <Stat
              label="Most money in one race"
              value={kpis.top ? kpis.top.race.label : "—"}
              detail={kpis.top ? `${fmtMoney(kpis.top.total)} raised by nominees plus outside spending` : "No race totals loaded"}
              href={kpis.top ? href(raceHref(kpis.top.race.id)) : undefined}
            />
            <Stat
              label="Outside spending, last 30 days"
              value={kpis.last30 == null ? "—" : fmtMoney(kpis.last30)}
              detail={coverage.outsideLatest ? `30 days to ${fmtDate(coverage.outsideLatest)}` : "Outside data not loaded"}
            />
          </section>

          <CoverageNote coverage={coverage} hasCandidates={hasCandidates} />

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            {hasCandidates ? (
              <CandidateMoneyChart races={shown} projections={projections} source={coverage.candidateSource} />
            ) : (
              <MissingCard
                title="Candidate fundraising is not loaded"
                body="Receipts and cash on hand come from the FEC's House and Senate current-campaigns file. That step of the data pipeline has not produced rows yet."
              />
            )}
            {hasOutside ? (
              <OutsideMoneyChart
                races={shown}
                raceById={raceById}
                spenders={spenders}
                spenderRaces={spenderRaces}
                projections={projections}
                chamber={chamber}
                source={coverage.outsideSource}
              />
            ) : (
              <MissingCard
                title="Outside spending is not loaded"
                body="Independent expenditures come from the FEC's 24- and 48-hour reports. That step of the data pipeline has not produced rows yet."
              />
            )}
          </div>

          <div className="mt-6">
            {hasCandidates ? (
              <MoneyVsModel races={shown} projections={projections} source={coverage.candidateSource} />
            ) : (
              <MissingCard
                title="Money vs. the model needs candidate data"
                body="This chart compares each race's cash-on-hand gap with the model's expected margin. It appears once candidate totals are loaded."
              />
            )}
          </div>

          <div className="mt-6">
            {spenders.length > 0 ? (
              <SpendersTable
                spenders={spenders}
                spenderRaces={spenderRaces}
                spenderCount={spenderCount}
                raceById={raceById}
                chamber={chamber}
                source={coverage.outsideSource}
              />
            ) : (
              <MissingCard
                title="Outside spenders are not loaded"
                body="The list of super PACs, party committees and other groups comes from the same FEC independent-expenditure reports."
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CoverageNote({ coverage, hasCandidates }: { coverage: Coverage; hasCandidates: boolean }) {
  const { href } = useScenario();
  const share = coverage.nominees > 0 ? coverage.matched / coverage.nominees : 0;
  return (
    <Card className="mt-3 !p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm leading-6 text-ink-2">
          <span className="font-semibold text-ink">Coverage. </span>
          {hasCandidates ? (
            <>
              Totals cover matched nominees only:{" "}
              <span className="font-semibold text-ink tabular-nums">{fmtNum(coverage.matched)}</span> of{" "}
              <span className="tabular-nums">{fmtNum(coverage.nominees)}</span> general-election nominees are matched to an FEC
              campaign, and <span className="tabular-nums">{fmtNum(coverage.reporting)}</span> of those have a processed report.
              Candidate totals run from Jan 1, 2025
              {coverage.candidateEnd
                ? ` to each campaign's latest processed report (${
                    coverage.candidateEarliest && coverage.candidateEarliest !== coverage.candidateEnd
                      ? `reports end between ${fmtDate(coverage.candidateEarliest)} and ${fmtDate(coverage.candidateEnd)}`
                      : `through ${fmtDate(coverage.candidateEnd)}`
                  })`
                : ""}
              .
            </>
          ) : (
            <>Candidate totals are not loaded, so only outside spending is shown.</>
          )}{" "}
          Outside spending counts general-election independent expenditures large enough to require a 24- or 48-hour report.
        </div>
        {hasCandidates && (
          <div className="flex shrink-0 items-center gap-2" aria-hidden>
            <span className="h-2 w-28 overflow-hidden rounded-full bg-surface-2">
              <span className="block h-full rounded-full bg-ink-2" style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <span className="text-xs text-ink-2 tabular-nums">{Math.round(share * 100)}% matched</span>
          </div>
        )}
      </div>
      <Link href={href("/data")} className="mt-2 inline-block text-xs font-semibold underline underline-offset-2">
        Download the full money tables
      </Link>
    </Card>
  );
}

function MissingCard({ title, body }: { title: string; body: string }) {
  const { href } = useScenario();
  return (
    <Empty title={title}>
      <p className="mx-auto max-w-md leading-6">{body}</p>
      <Link href={href("/data")} className="mt-2 inline-block text-xs font-semibold text-ink underline underline-offset-2">
        See what data is loaded
      </Link>
    </Empty>
  );
}

function NoMoneyData() {
  const { href } = useScenario();
  return (
    <Empty title="Campaign finance data is not loaded yet">
      <div className="mx-auto max-w-xl space-y-2 text-left leading-6 sm:text-center">
        <p>
          This page is built from Federal Election Commission bulk files: each nominee&apos;s receipts, spending and cash on
          hand, and independent expenditures by super PACs, party committees and other groups. The data pipeline step that
          downloads those files and matches them to the nominees (<code className="text-xs">pipeline/fec.py</code>, run by{" "}
          <code className="text-xs">pipeline/run.py</code>) has not produced rows for this build.
        </p>
        <p>Once it runs, this page shows the races drawing the most money, the largest outside spenders, and money compared with the model.</p>
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-3 text-xs font-semibold">
        <Link href={href("/data")} className="underline underline-offset-2">
          See every dataset and its status
        </Link>
        <Link href={href("/house?competitive=1")} className="underline underline-offset-2">
          Explore the competitive House races
        </Link>
      </div>
    </Empty>
  );
}
