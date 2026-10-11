"use client";

import Link from "next/link";
import { useMemo } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui/primitives";
import { HOUSE_SEATS, REDRAWN_2026, STATE_BY_POSTAL } from "@/lib/data/states";
import type { HexMap as HexMapData, HouseRace } from "@/lib/data/types";
import { fmtDate, fmtMargin } from "@/lib/format";
import { useProjections } from "@/lib/model/use-outlook";
import { explorerHref, stateHref } from "@/lib/routes";
import { useQueryParam } from "@/lib/url-state";
import type { CurvePoint, OldDistrict } from "../_lib/data";
import { CLOSE_LEAN, describeDistricts, netPhrase, netSeats, oldCoverage, tallyStates, type Basis } from "../_lib/derive";
import { FinishLine } from "./finish-line";
import { RedistrictingMap } from "./redistricting-map";
import { RedistrictingTable, type Show } from "./redistricting-table";
import { SeatCurve } from "./seat-curve";
import { Segmented } from "./segmented";
import { StateBars, type Compare } from "./state-bars";

const BASES = [
  { value: "pres", label: "2024 result" },
  { value: "even", label: "Tied national vote" },
] as const;
const COMPARES = [
  { value: "old", label: "Old lines" },
  { value: "held", label: "Holders" },
] as const;

const parseBasis = (raw: string): Basis | undefined => (raw === "pres" || raw === "even" ? raw : undefined);
const parseCompare = (raw: string): Compare | undefined => (raw === "old" || raw === "held" ? raw : undefined);
const parseShow = (raw: string): Show | undefined => (raw === "all" || raw === "flips" || raw === "close" ? raw : undefined);
const parseState = (raw: string): string | undefined => {
  const s = raw.toUpperCase();
  return REDRAWN_2026.includes(s) ? s : undefined;
};

export function RedistrictingDashboard({
  house,
  hexmap,
  oldDistricts,
  curve,
  nationalMargin,
  generated,
}: {
  house: HouseRace[];
  hexmap: HexMapData;
  oldDistricts: OldDistrict[];
  curve: CurvePoint[];
  /** 2024 national presidential margin, D minus R (the yardstick for lean). */
  nationalMargin: number;
  generated: string;
}) {
  const { href, params } = useScenario();
  const projections = useProjections(house);

  const [basis, setBasis] = useQueryParam<Basis>("basis", "pres", parseBasis);
  const [cmpRaw, setCompare] = useQueryParam<Compare>("cmp", "old", parseCompare);
  const [show, setShow] = useQueryParam<Show>("show", "all", parseShow);
  const [stateRaw, setState] = useQueryParam<string | null>("st", null, parseState, (s) => s ?? "");

  const coverage = useMemo(() => oldCoverage(oldDistricts), [oldDistricts]);
  const hasOld = coverage.complete;
  const compare: Compare = hasOld ? cmpRaw : "held";
  const state = stateRaw;

  const districts = useMemo(() => describeDistricts(house, oldDistricts, basis), [house, oldDistricts, basis]);
  const tallies = useMemo(
    () => tallyStates(districts, oldDistricts, basis, nationalMargin, coverage.states),
    [districts, oldDistricts, basis, nationalMargin, coverage.states],
  );

  const seats = districts.length;
  const flipsToD = districts.filter((d) => d.flip === "toD");
  const flipsToR = districts.filter((d) => d.flip === "toR");
  const flips = [...flipsToD, ...flipsToR];
  const linesNet = hasOld ? tallies.reduce((s, t) => s + (t.newD - (t.oldD ?? 0)), 0) : null;
  const closeNew = tallies.reduce((s, t) => s + t.closeNew, 0);
  const closeOld = hasOld ? tallies.reduce((s, t) => s + (t.closeOld ?? 0), 0) : null;

  const basisText = basis === "pres" ? "the 2024 presidential result" : "lean at a tied national vote";
  const dataSource = `Source: The Downballot, 2024 presidential results by congressional district on the 2026 lines${
    hasOld ? " and the 2024 lines" : ""
  }; notional holders as assigned by The Downballot. Data as of ${fmtDate(generated)}.`;
  const finishSource = `Source: The Downballot (2024 results on both sets of lines); this site's model, fundamentals only, national error ${params.sigmaNational} and race error ${params.sigmaRace} points.`;
  const curveSource = "Source: The Downballot, 2024 presidential results on the 2024 and 2026 lines; uniform swing from the data pipeline.";

  const statePicker = (
    <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className="sr-only sm:not-sr-only">State</span>
      <select
        value={state ?? ""}
        onChange={(e) => setState(e.target.value || null)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
        aria-label="State shown in the seat curve and the table"
      >
        <option value="">All nine</option>
        {REDRAWN_2026.map((s) => (
          <option key={s} value={s}>
            {STATE_BY_POSTAL[s]?.name ?? s}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="pb-6">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "Redistricting" }]}
        eyebrow="2026 midterms · Redistricting"
        title="The new maps"
        description={
          <>
            Nine states drew new congressional lines for 2026: {REDRAWN_2026.map((s) => STATE_BY_POSTAL[s]?.name ?? s).join(", ")}.
            How much did that move the race? Counts below hold the 2024 vote fixed, so they measure the lines, not the candidates.
          </>
        }
        actions={
          <Link href={href(`/house?state=${REDRAWN_2026.join(",")}`)} className="text-xs font-semibold underline underline-offset-2">
            All {seats} seats in the explorer
          </Link>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
        <span className="text-xs font-medium text-ink-2">Read each seat&apos;s lean by</span>
        <Segmented label="Read each seat's lean by" value={basis} options={BASES} onChange={setBasis} />
        <span className="text-xs leading-5 text-ink-2">
          {basis === "pres"
            ? `Who carried the district in 2024, when the national presidential vote was ${fmtMargin(nationalMargin)}.`
            : `Which side the district favors when the national vote is tied: its 2024 margin minus the national ${fmtMargin(nationalMargin)}.`}
        </span>
      </div>

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="States redrawn" value={REDRAWN_2026.length} detail={REDRAWN_2026.join(", ")} />
        <Stat
          label="Seats in those states"
          value={seats}
          detail={`${Math.round((seats / HOUSE_SEATS) * 100)}% of the House`}
          href={href(`/house?state=${REDRAWN_2026.join(",")}`)}
        />
        <Stat
          label="Notional flips"
          value={flips.length}
          detail={`Holder differs from where the new lines lean (${basis === "pres" ? "2024 vote" : "tied vote"})`}
          href={flips.length ? href(explorerHref(flips.map((d) => d.id))) : undefined}
        />
        <Stat
          label="Toward Democrats"
          value={flipsToD.length}
          accent="var(--dem)"
          detail="Republican-held seats whose new lines lean D"
          href={flipsToD.length ? href(explorerHref(flipsToD.map((d) => d.id))) : undefined}
        />
        <Stat
          label="Toward Republicans"
          value={flipsToR.length}
          accent="var(--rep)"
          detail="Democratic-held seats whose new lines lean R"
          href={flipsToR.length ? href(explorerHref(flipsToR.map((d) => d.id))) : undefined}
        />
        <Stat
          label="Net shift"
          value={netSeats(flipsToD.length - flipsToR.length)}
          detail={
            linesNet == null
              ? "Notional flips toward each party, netted"
              : `Lines alone, old vs new: ${netSeats(linesNet)}`
          }
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <StateBars
            tallies={tallies}
            compare={compare}
            basis={basis}
            selected={state}
            source={
              hasOld
                ? dataSource
                : `${dataSource} The 2024-lines comparison appears here when that data is loaded.`
            }
            actions={hasOld ? <Segmented label="Compare the new lines with" value={compare} options={COMPARES} onChange={setCompare} /> : null}
          />
        </div>
        <div className="lg:col-span-2">
          <FinishLine house={house} old={oldDistricts} complete={hasOld} nationalMargin={nationalMargin} source={finishSource} />
        </div>
      </div>

      <div className="mt-6">
        <RedistrictingMap hexmap={hexmap} house={house} districts={districts} projections={projections} basis={basis} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SeatCurve curve={curve} state={state} source={curveSource} actions={curve.length ? statePicker : null} />
        <Card>
          <SectionTitle
            title="State by state"
            description={`Notional flips by ${basisText}, and new seats within ${CLOSE_LEAN} points of the national vote. Open a state for its full delegation.`}
          />
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tallies.map((t) => {
              const net = t.newD - (hasOld ? (t.oldD ?? 0) : t.heldD);
              return (
                <li key={t.postal}>
                  <Link
                    href={href(stateHref(t.postal))}
                    className={`block rounded-lg border p-3 hover:bg-surface-2 ${state === t.postal ? "border-ink" : "border-line"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-semibold text-ink">{t.name}</span>
                      <span className="text-xs text-ink-2 tabular-nums">{t.seats} seats</span>
                    </div>
                    <div className="mt-1 text-xs text-ink-2 tabular-nums">
                      2026 lines: {t.newD} D · {t.newR} R
                      {hasOld && t.oldD != null ? ` (2024 lines: ${t.oldD} D · ${t.oldR} R)` : ` (held: ${t.heldD} D · ${t.heldR} R)`}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums">
                      <span className="font-medium text-ink">{netPhrase(net)}</span>
                      {(t.flipsToD > 0 || t.flipsToR > 0) && (
                        <span className="text-ink-2">
                          Flips: {t.flipsToD} to D, {t.flipsToR} to R
                        </span>
                      )}
                      <span className="text-ink-2">
                        Close: {t.closeNew}
                        {t.closeOld != null ? ` (was ${t.closeOld})` : ""}
                      </span>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-xs text-ink-2">
            Across the nine states, {closeNew} new seats sit within {CLOSE_LEAN} points of the national vote
            {closeOld != null ? `, compared with ${closeOld} on the 2024 lines` : ""}. 2024 statewide results:{" "}
            {tallies.map((t, i) => (
              <span key={t.postal} className="tabular-nums">
                {i > 0 ? ", " : ""}
                {t.postal} {fmtMargin(t.statewide)}
              </span>
            ))}
            .
          </p>
        </Card>
      </div>

      <RedistrictingTable
        districts={districts}
        projections={projections}
        hasOld={hasOld || oldDistricts.length > 0}
        basis={basis}
        states={REDRAWN_2026}
        state={state}
        onState={setState}
        show={show}
        onShow={setShow}
      />

      <Card className="mt-6">
        <SectionTitle title="How these numbers are made" />
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-ink-2">
          <li>
            <span className="font-medium text-ink">Notional flips</span> compare the party that holds each seat today (The
            Downballot&apos;s assignment of members to new districts) with the side its 2026 lines lean to, read by {basisText}.
            A flip on paper is not a result: incumbents, candidates and the national mood still decide the race.
          </li>
          <li>
            <span className="font-medium text-ink">Old lines vs new</span> count the same 2024 presidential votes on the districts
            used in 2024 and on the 2026 districts, so any change is the effect of the lines alone. Districts are matched by number
            for the per-seat shift; a new map can move a number to quite different ground.
          </li>
          <li>
            <span className="font-medium text-ink">Finish line moved:</span> the model runs twice with fundamentals only (no
            weight on published ratings). Seats in the other 41 states are identical in both runs, with incumbency as set in the
            scenario. In the nine states, run (a) uses the 2026 districts and run (b) the 2024 districts, each with lean only
            (2024 presidential margin minus the national margin of {fmtMargin(nationalMargin)}), no incumbency and no ratings, so
            the maps are the only difference. The finish line is the national vote at which Democrats are favored in exactly 218
            seats; the difference between the two runs is how far the maps moved it.
          </li>
          <li>
            <span className="font-medium text-ink">Close seats</span> are new districts whose lean is within {CLOSE_LEAN} points
            of even. Expected margins and chances elsewhere on the page are the full model at your settings (
            {fmtMargin(params.env)}).
          </li>
        </ul>
        <p className="mt-3 text-[11px] leading-4 text-muted">
          Sources: The Downballot (2024 presidential results by congressional district on the 2024 and 2026 lines; Congressional
          District Hexmap by Daniel Donner, CC BY 4.0). Read the{" "}
          <Link href={href("/methodology")} className="underline">
            methodology
          </Link>{" "}
          or{" "}
          <Link href={href("/data")} className="underline">
            download the data
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
