"use client";

// The House race explorer: URL-synced filters, KPIs for the filtered set, cross-filter charts
// and the table. The filter bar reads the live URL; the heavy views read a deferred copy so
// typing in the search box stays instant.
import { useDeferredValue, useMemo } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { Card, Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { HOUSE_SEATS } from "@/lib/data/states";
import type { HexMap as HexMapData, HouseRace, RatingLabel } from "@/lib/data/types";
import { fmtDate, fmtMargin, fmtNum } from "@/lib/format";
import { useProjections } from "@/lib/model/use-outlook";
import { RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { useSearchString } from "@/lib/url-state";
import { ExplorerHexMap, MarginHistogram, RatingBars } from "./explorer-charts";
import { FilterBar } from "./filter-bar";
import { activeFilterCount, applyFilters, clearFilters, parseFilters, searchText } from "./filters";
import { LeanScatter } from "./lean-scatter";
import { RaceTable } from "./race-table";
import type { ExplorerRow } from "./types";

const chanceD = (r: ExplorerRow) => (r.p.challenger === "D" ? r.p.pWin : 0);

export function Explorer({
  house,
  hexmap,
  ratingsAsOf,
  generated,
}: {
  house: HouseRace[];
  hexmap: HexMapData;
  ratingsAsOf: string | null;
  generated: string;
}) {
  const { params, href } = useScenario();

  const knownIds = useMemo(() => new Set(house.map((r) => r.id)), [house]);
  const haystack = useMemo(() => new Map(house.map((r) => [r.id, searchText(r)])), [house]);

  const search = useSearchString();
  const live = useMemo(() => parseFilters(search, knownIds), [search, knownIds]);
  const deferredSearch = useDeferredValue(search);
  const filters = useMemo(() => parseFilters(deferredSearch, knownIds), [deferredSearch, knownIds]);

  const projections = useProjections(house);
  const all = useMemo(() => {
    const m = new Map<string, ExplorerRow>();
    for (const race of house) {
      const p = projections.get(race.id);
      if (p) m.set(race.id, { race, p, category: ratingFromProb(p.pWin) });
    }
    return m;
  }, [house, projections]);

  const rows = useMemo(() => {
    const list = applyFilters(house, filters, haystack)
      .map((r) => all.get(r.id))
      .filter((r): r is ExplorerRow => !!r);
    // Closest first: distance of the chance from a coin flip, then the size of the margin.
    return list.sort((a, b) => Math.abs(a.p.pWin - 0.5) - Math.abs(b.p.pWin - 0.5) || Math.abs(a.p.margin) - Math.abs(b.p.margin));
  }, [house, filters, haystack, all]);

  const ratingCounts = useMemo(() => {
    const counts = Object.fromEntries(RATING_ORDER.map((r) => [r, 0])) as Record<RatingLabel, number>;
    for (const r of applyFilters(house, filters, haystack, "ratings")) counts[r.rating] += 1;
    return counts;
  }, [house, filters, haystack]);

  const active = activeFilterCount(filters) > 0;

  const kpi = useMemo(() => {
    let expD = 0;
    let coin = 0;
    let open = 0;
    let heldD = 0;
    let heldR = 0;
    for (const r of rows) {
      expD += chanceD(r);
      if (r.p.pWin > 0.4 && r.p.pWin < 0.6) coin += 1;
      if (r.race.openSeat) open += 1;
      if (r.race.heldBy === "D") heldD += 1;
      if (r.race.heldBy === "R") heldR += 1;
    }
    return { expD, coin, open, heldD, heldR, net: expD - heldD };
  }, [rows]);

  const sourceLine = (
    <>
      Source: 2024 presidential results on the 2026 lines from The Downballot; consensus of 10 forecasters&apos; ratings via
      Wikipedia{ratingsAsOf ? `, as of ${fmtDate(ratingsAsOf)}` : ""}. Model at a national vote of {fmtMargin(params.env)} in this
      scenario.
    </>
  );
  const hexSource = (
    <>
      Congressional District Hexmap by Daniel Donner for{" "}
      <a href="https://the-db.co/maps" className="underline">
        The Downballot
      </a>{" "}
      (CC BY 4.0). Model at {fmtMargin(params.env)} in this scenario.
    </>
  );

  const net = kpi.net;
  const netValue = Math.abs(net) < 0.05 ? "No change" : `${net > 0 ? "D" : "R"} +${Math.abs(net).toFixed(1)}`;

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "House races" }]}
        eyebrow="2026 House · 435 seats"
        title="House race explorer"
        description={
          <>
            Which seats matter, and how do they compare? Filter the 435 races, then drag across a chart to narrow the selection. Every number follows the national vote set
            above ({fmtMargin(params.env)}). Data updated {fmtDate(generated)}.
          </>
        }
      />

      <FilterBar filters={live} shown={rows.length} total={HOUSE_SEATS} />

      <section aria-label="Seats in view" className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="Seats in view"
          value={<span className="tabular-nums">{fmtNum(rows.length)}</span>}
          detail={`Held now: D ${kpi.heldD} · R ${kpi.heldR}${rows.length - kpi.heldD - kpi.heldR ? ` · other ${rows.length - kpi.heldD - kpi.heldR}` : ""}`}
        />
        <Stat
          label="Expected Democratic wins"
          value={<span className="tabular-nums">{kpi.expD.toFixed(1)}</span>}
          detail={`Republicans ${(rows.length - kpi.expD).toFixed(1)}, in this scenario`}
          accent="var(--dem)"
        />
        <Stat
          label="Coin flips"
          value={<span className="tabular-nums">{fmtNum(kpi.coin)}</span>}
          detail="Chance between 40% and 60%"
          accent="var(--r-toss)"
        />
        <Stat
          label="Open seats"
          value={<span className="tabular-nums">{fmtNum(kpi.open)}</span>}
          detail="No incumbent running"
        />
        <Stat
          label="Net change in view"
          value={<span className="tabular-nums">{rows.length ? netValue : "—"}</span>}
          detail={`${kpi.expD.toFixed(1)} expected D wins minus ${kpi.heldD} seats Democrats hold`}
          accent={net > 0.05 ? "var(--dem)" : net < -0.05 ? "var(--rep)" : undefined}
        />
      </section>

      {rows.length === 0 ? (
        <div className="mt-6">
          <Empty title="No seats match these filters">
            <p>Remove a filter above, or start over.</p>
            <button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-ink underline underline-offset-2">
              Clear all filters
            </button>
          </Empty>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7 lg:row-start-1">
            <LeanScatter rows={rows} source={sourceLine} />
          </div>
          <div className="min-w-0 lg:col-span-7 lg:row-start-2">
            <MarginHistogram rows={rows} source={sourceLine} />
          </div>
          <div className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-2">
            <RatingBars counts={ratingCounts} selected={filters.ratings} source={sourceLine} />
          </div>
          <div className="min-w-0 lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <ExplorerHexMap map={hexmap} rows={all} filtered={active ? rows : null} hexSource={hexSource} />
          </div>
        </div>
      )}

      <section aria-labelledby="explorer-table" className="mt-8">
        <div className="mb-3">
          <h2 id="explorer-table" className="text-base font-semibold text-ink">
            Every seat in view
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">
            Closest races first: sorted by how near the chance is to 50%. Click a column to re-sort, or a row to open the district.
          </p>
        </div>
        <RaceTable rows={rows} sort={filters.sort} dir={filters.dir} />
        <Card className="mt-4 !p-4">
          <h3 className="text-sm font-semibold text-ink">Notes on special cases</h3>
          <ul className="mt-2 list-disc space-y-1.5 pl-5 text-xs leading-5 text-ink-2">
            <li>
              <strong className="font-medium text-ink">Lean</strong> is the 2024 presidential margin on the 2026 lines minus the national
              margin. <strong className="font-medium text-ink">Expected margin</strong> blends lean, the national vote and incumbency
              with the forecasters&apos; ratings; margins are Democratic minus Republican.
            </li>
            <li>
              <strong className="font-medium text-ink">Held by</strong> is the notional holder: the party holding the seat&apos;s
              predecessor district. On new lines it can differ from the party the district now leans to. Net change counts against it.
            </li>
            <li>
              <strong className="font-medium text-ink">One-party races.</strong> Where only Democrats or only Republicans are on the
              November ballot (California&apos;s top-two primary can send two candidates of the same party; some seats have no candidate
              from one party), the outcome is fixed and shows as &gt;99% or &lt;1%. Several names joined by &ldquo;/&rdquo; are candidates of
              the same party.
            </li>
            <li>
              <strong className="font-medium text-ink">Unrated seats*</strong> are not listed as competitive by any of the 10
              forecasters. Their consensus shows as Safe for the party that carried the district in 2024, and the model uses fundamentals only for them.
            </li>
            <li>
              <strong className="font-medium text-ink">Ranked-choice voting</strong> decides the races in Alaska and Maine if no
              candidate wins a majority of first choices. The model treats them like any other race.
            </li>
            <li>
              Chances come from the model&apos;s simulation of this scenario, not a forecast. Cook, IE (Inside Elections) and Sabato
              show each forecaster&apos;s own rating; a dash means it does not rate the race.
            </li>
          </ul>
        </Card>
      </section>
    </div>
  );
}
