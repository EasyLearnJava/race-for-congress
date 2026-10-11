"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { HexMap } from "@/components/charts/hex-map";
import { ProbBar } from "@/components/charts/sparkline";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { SeatDistributionChart } from "@/components/model/seat-distribution";
import { useScenario } from "@/components/scenario/scenario";
import { Card, PageHeader, RatingChip, SectionTitle, Stat } from "@/components/ui/primitives";
import type { HexMap as HexMapData, HouseRace, OldLinesRow, RatingLabel, Row, SenateRace } from "@/lib/data/types";
import { districtName, fmtDate, fmtMargin, fmtProb } from "@/lib/format";
import { envForSeats } from "@/lib/model/engine";
import { useHouseOutlook, useProjections } from "@/lib/model/use-outlook";
import { RATING_COLOR, RATING_ORDER, isCompetitive, ratingFromProb } from "@/lib/ratings";
import { houseHref, senateHref } from "@/lib/routes";
import { fmtNetShort, heldCounts, netColor } from "./shared";
import { DelegationCurve, MarginHistogram, RatingsMix } from "./state-charts";
import { StateDistrictTable } from "./state-district-table";
import { StateRedistricting } from "./state-redistricting";
import { SenateCard } from "./state-senate";
import { StateSwitcher } from "./state-switcher";

export function StateDashboard({
  postal,
  name,
  races,
  senate,
  hexmap,
  redrawn,
  oldLines,
  redistrictingSummary,
  redistrictingDistricts,
  redistrictingCurve,
  generated,
  hexmapCredit,
}: {
  postal: string;
  name: string;
  races: HouseRace[];
  senate: SenateRace[];
  hexmap: HexMapData;
  redrawn: boolean;
  oldLines: OldLinesRow[];
  redistrictingSummary: Row | null;
  redistrictingDistricts: Row[];
  redistrictingCurve: Row[];
  generated: string;
  hexmapCredit: string;
}) {
  const { params, set, href } = useScenario();
  const n = races.length;
  const majority = Math.floor(n / 2) + 1;
  const outlook = useHouseOutlook(races, majority);
  const senateProj = useProjections(senate);
  const [mode, setMode] = useState<"model" | "forecasters">("model");

  const projections = useMemo(() => new Map(outlook.projections.map((p) => [p.id, p])), [outlook]);
  const byId = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);

  const held = heldCounts(races);
  const expD = outlook.expectedDem;
  const net = expD - held.dem;
  const competitive = races.filter((r) => isCompetitive(r.rating));
  const tossups = races.filter((r) => r.rating === "Tossup").length;
  const newLines = races.filter((r) => r.newLines).length;

  const modelCat = (id: string): RatingLabel => {
    const p = projections.get(id);
    return p ? ratingFromProb(p.pWin) : (byId.get(id)?.rating ?? "Tossup");
  };
  const categoryOf = (id: string): RatingLabel => (mode === "model" ? modelCat(id) : (byId.get(id)?.rating ?? "Tossup"));

  const closest = useMemo(
    () =>
      outlook.projections
        .filter((p) => !p.forced)
        .sort((a, b) => Math.abs(a.pWin - 0.5) - Math.abs(b.pWin - 0.5))
        .slice(0, 5),
    [outlook],
  );

  const senateRace = senate[0];
  const senateP = senateRace ? senateProj.get(senateRace.id) : undefined;

  const hexHeight = n <= 2 ? 180 : n <= 8 ? 300 : 440;
  const scenarioSource = `model at a national vote of ${fmtMargin(params.env)}`;

  return (
    <div className="pb-8">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "States", href: href("/states") }, { label: name }]}
        eyebrow={`${n} House ${n === 1 ? "seat" : "seats"}${redrawn ? " · New 2026 map" : ""}${senateRace ? " · Senate race" : ""}`}
        title={name}
        actions={<StateSwitcher current={postal} />}
        description={
          <>
            Democrats hold {held.dem} and Republicans {held.rep}
            {held.other ? ` (${held.other} other)` : ""} of {name}&apos;s {n} House {n === 1 ? "seat" : "seats"}. At a national vote of{" "}
            {fmtMargin(params.env)}, the model expects Democrats to win about {expD.toFixed(1)}
            {n > 1 ? ` (80% range ${outlook.low}–${outlook.high})` : ""}. This is a simulation, not a forecast. Data updated{" "}
            {fmtDate(generated)}.
          </>
        }
      />

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat
          label="House seats"
          value={n}
          detail={redrawn ? `${newLines} on new 2026 lines` : "Same lines as 2024"}
          href={href(`/house?state=${postal}`)}
        />
        <Stat label="Held now" value={`D ${held.dem} · R ${held.rep}`} detail={held.other ? `${held.other} held by another party` : "Party holding each seat today"} />
        <Stat
          label="Expected after November"
          value={`D ${Math.round(expD)} · R ${n - Math.round(expD)}`}
          detail={`Net change: ${fmtNetShort(net)}, in this scenario`}
          accent={netColor(net)}
        />
        <Stat
          label="Competitive seats"
          value={competitive.length}
          detail={`${tossups} ${tossups === 1 ? "toss-up" : "toss-ups"}; the rest Lean or Likely`}
          href={href(`/house?state=${postal}&competitive=1`)}
        />
        {senateRace && senateP ? (
          <Stat
            label={senateP.challenger === "I" ? "Senate: independent wins" : "Senate: Democrat wins"}
            value={fmtProb(senateP.pWin)}
            detail={`Forecasters: ${senateRace.rating}${senateRace.specialElection ? " · special election" : ""}`}
            accent={senateP.challenger === "I" ? "var(--ind)" : "var(--dem)"}
            href={href(senateHref(postal))}
          />
        ) : (
          <Stat label="Senate race" value="None" detail={`No ${name} Senate seat is up in 2026`} href={href("/senate")} />
        )}
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartFrame
          className="lg:col-span-2"
          title={`${name}'s districts`}
          subtitle={
            mode === "model"
              ? `Colored by the model's category at a national vote of ${fmtMargin(params.env)}. Click a district to open it.`
              : "Colored by the median of 10 forecasters' ratings. Click a district to open it."
          }
          height={Math.min(hexHeight, 260)}
          csvName={`${postal.toLowerCase()}-district-map`}
          source={
            <>
              Equal-area map: every district is the same size. {hexmapCredit} (
              <a href="https://the-db.co/maps" className="underline">
                CC BY 4.0
              </a>
              ); {scenarioSource}.
            </>
          }
          actions={
            <div role="group" aria-label="Color districts by" className="mr-1 inline-flex rounded-lg border border-line p-0.5 text-xs">
              {(["model", "forecasters"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2 py-1 font-medium ${mode === m ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
                >
                  {m === "model" ? "Model" : "Forecasters"}
                </button>
              ))}
            </div>
          }
          legend={RATING_ORDER.map((r) => {
            const count = races.filter((x) => categoryOf(x.id) === r).length;
            return count ? <LegendItem key={r} color={RATING_COLOR[r]} label={`${r} ${count}`} /> : null;
          })}
          table={{
            columns: [
              { key: "id", label: "District" },
              { key: "model", label: "Model category" },
              { key: "chance", label: "Chance D", align: "right", format: (v) => fmtProb(Number(v)) },
              { key: "margin", label: "Expected margin", align: "right", format: (v) => fmtMargin(Number(v)) },
              { key: "rating", label: "Forecasters" },
            ],
            rows: races.map((r) => {
              const p = projections.get(r.id);
              return { id: r.id, model: modelCat(r.id), chance: p?.pWin ?? null, margin: p?.margin ?? null, rating: r.rating };
            }),
          }}
        >
          {() => (
            <HexMap
              map={hexmap}
              maxHeight={hexHeight}
              districtLabels
              showStateLabels={false}
              ariaLabel={`Map of ${name}'s ${n} House districts colored by ${mode === "model" ? "the model" : "forecaster consensus"}. The table view lists every district.`}
              fill={(id) => RATING_COLOR[categoryOf(id)]}
              hrefFor={(id) => href(houseHref(id))}
              tooltip={(id) => {
                const race = byId.get(id);
                const p = projections.get(id);
                if (!race) return null;
                return (
                  <>
                    <TipTitle>{districtName(race.id, race.stateName)}</TipTitle>
                    <div className="mb-1 text-ink-2">
                      {race.incumbent
                        ? `${race.incumbent} (${race.incumbentParty || "?"})${race.incumbentRunning ? "" : ", not running"}`
                        : "Open seat"}
                    </div>
                    {p && <TipRow color="var(--dem)" label="Democrat wins" value={fmtProb(p.forced ? (p.margin > 0 ? 1 : 0) : p.pWin)} />}
                    {p && <TipRow label="Expected margin" value={fmtMargin(p.margin)} />}
                    <TipRow label="Forecasters" value={race.rating} />
                    <TipRow label="District lean" value={fmtMargin(race.lean)} />
                  </>
                );
              }}
            />
          )}
        </ChartFrame>

        <div className="space-y-6">
          <SenateCard name={name} postal={postal} races={senate} projections={senateProj} />
          <Card>
            <SectionTitle
              title="Closest House races"
              description="Seats nearest a coin flip in this scenario."
              action={
                competitive.length > 0 ? (
                  <Link href={href(`/house?state=${postal}&competitive=1`)} className="text-xs font-semibold underline underline-offset-2">
                    All competitive
                  </Link>
                ) : undefined
              }
            />
            {closest.length ? (
              <ul className="divide-y divide-line">
                {closest.map((p) => {
                  const race = byId.get(p.id)!;
                  return (
                    <li key={p.id}>
                      <Link href={href(houseHref(p.id))} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                        <span className="w-14 shrink-0 text-sm font-semibold">{p.id}</span>
                        <span className="min-w-0 flex-1 truncate text-xs text-ink-2" title={`${race.dem || "—"} vs ${race.rep || "—"}`}>
                          {race.dem || "—"} vs {race.rep || "—"}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-2 text-xs tabular-nums">
                          <ProbBar p={p.pWin} challenger={p.challenger} width={48} height={10} />
                          <span className="w-8 text-right">{fmtProb(p.pWin)}</span>
                        </span>
                        <span className="hidden shrink-0 sm:inline">
                          <RatingChip rating={race.rating} size="xs" />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-ink-2">Every seat here is settled by who is on the ballot.</p>
            )}
          </Card>
        </div>
      </div>

      {n >= 2 && (
        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
          <MarginHistogram name={name} postal={postal} races={races} projections={projections} />
          <SeatDistributionChart
            title={`How many of ${name}'s ${n} seats Democrats could win`}
            subtitle={`Chance of every delegation result at a national vote of ${fmtMargin(params.env)}. Click a column to set the national vote where that result is the expected one.`}
            dist={outlook.dist}
            majority={majority}
            seatLabel="Democratic seats"
            csvName={`${postal.toLowerCase()}-seat-distribution`}
            source="Model: lean, national vote, incumbency and published ratings, with national and race-level error. The line marks a majority of the delegation."
            onSelect={(k) => set({ env: Math.round(envForSeats(races, params, k) * 2) / 2 })}
          />
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DelegationCurve name={name} postal={postal} races={races} heldDem={held.dem} />
        <RatingsMix name={name} postal={postal} races={races} projections={projections} />
      </div>

      {redrawn && (
        <StateRedistricting
          name={name}
          postal={postal}
          races={races}
          expectedDem={expD}
          oldLines={oldLines}
          summary={redistrictingSummary}
          districts={redistrictingDistricts}
          curve={redistrictingCurve}
        />
      )}

      <section aria-labelledby="districts-title" className="mt-8">
        <SectionTitle
          title={<span id="districts-title">Every district</span>}
          description={`All ${n} ${name} House ${n === 1 ? "race" : "races"} in this scenario. Sort any column, or download the table.`}
        />
        <StateDistrictTable name={name} postal={postal} races={races} projections={projections} />
      </section>
    </div>
  );
}
