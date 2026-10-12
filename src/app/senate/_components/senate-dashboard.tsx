"use client";

// The Senate dashboard: who is favored for control, how the 100 seats stack up, every race on
// a state map and in a table, and how it all moves with the national vote. Everything below
// recomputes from the shared scenario.
import Link from "next/link";
import { useMemo, type MouseEvent } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { SeatBar, type SeatSegment } from "@/components/charts/seat-bar";
import { US_MAP_CREDIT, UsStateMap } from "@/components/charts/us-map";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { SensitivityChart, type CurveSpec } from "@/components/model/sensitivity";
import { useScenario } from "@/components/scenario/scenario";
import { Card, PageHeader, SectionTitle, Stat } from "@/components/ui/primitives";
import { SENATE_SEATS, STATE_BY_POSTAL } from "@/lib/data/states";
import type { Meta, MoneyRow, OutsideRow, RatingLabel, SenateRace } from "@/lib/data/types";
import { fmtDate, fmtMargin, fmtProb } from "@/lib/format";
import { finishLine, tippingPoint } from "@/lib/model/engine";
import { useModelParams, useSenateOutlook } from "@/lib/model/use-outlook";
import { RATING_COLOR, RATING_ORDER } from "@/lib/ratings";
import { senateHref } from "@/lib/routes";
import { setSearchParams, useQueryParam } from "@/lib/url-state";
import { SenateMoney } from "./senate-money";
import { SenatePath } from "./senate-path";
import { SenateRaceTable } from "./senate-race-table";
import { SenateSeatDistribution } from "./senate-seat-distribution";
import {
  challengerName,
  demThreshold,
  favoredText,
  listNames,
  modelCategory,
  parseCategories,
  serializeCategories,
  sideMargin,
  type SenateComp,
} from "./senate-shared";

const NO_CATEGORIES: RatingLabel[] = [];

export function SenateDashboard({
  senate,
  composition,
  generated,
  environment,
  forecasters,
  ratingsAsOf,
  money,
  outside,
}: {
  senate: SenateRace[];
  composition: SenateComp;
  generated: string;
  environment: Meta["environment"] | null;
  forecasters: string[];
  ratingsAsOf: string | null;
  money: MoneyRow[];
  outside: OutsideRow[];
}) {
  const { href } = useScenario();
  const params = useModelParams();
  const outlook = useSenateOutlook(senate, composition);
  const [categories, setCategories] = useQueryParam<RatingLabel[]>("cat", NO_CATEGORIES, parseCategories, serializeCategories);

  const threshold = demThreshold(composition);
  const vpParty = composition.vicePresidentParty === "D" ? "Democratic" : "Republican";
  const tieWinner = composition.vicePresidentParty === "D" ? "Democrats" : "Republicans";
  const needed = threshold - composition.holdoverDem;

  const projections = useMemo(() => new Map(outlook.projections.map((p) => [p.id, p])), [outlook]);
  const byState = useMemo(() => new Map(senate.map((r) => [r.state, r])), [senate]);
  const categoryOf = useMemo(() => {
    const m = new Map<string, RatingLabel>();
    for (const r of senate) m.set(r.state, modelCategory(projections.get(r.id), r));
    return m;
  }, [senate, projections]);

  // Who defends what this year, by the party of the current senator.
  const defending = useMemo(() => {
    let D = 0;
    let R = 0;
    let other = 0;
    for (const r of senate) {
      if (r.incumbentParty === "R") R += 1;
      else if (r.incumbentParty === "D" || r.incumbentParty === "I") D += 1;
      else other += 1;
    }
    return { D, R, other };
  }, [senate]);

  const currentDem = composition.holdoverDem + defending.D;
  const netDem = outlook.expectedDem - currentDem;

  const tipping = useMemo(() => tippingPoint(outlook.projections, needed), [outlook, needed]);
  const finish = useMemo(() => (needed > 0 ? finishLine(senate, params, needed) : undefined), [senate, params, needed]);
  const tippingRace = tipping ? senate.find((r) => r.id === tipping.id) : undefined;

  const counts = useMemo(() => {
    const m = new Map<RatingLabel, number>();
    for (const c of categoryOf.values()) m.set(c, (m.get(c) ?? 0) + 1);
    return m;
  }, [categoryOf]);

  const segments: SeatSegment[] = [
    { key: "hold-d", label: "Democratic caucus, not up in 2026", count: composition.holdoverDem, color: "var(--r-safe-d)" },
    ...RATING_ORDER.map((label) => ({
      key: label,
      label: `Up in 2026, model: ${label}`,
      count: counts.get(label) ?? 0,
      color: RATING_COLOR[label],
      href: `${href(`/senate?cat=${encodeURIComponent(label)}`)}#races`,
    })),
    { key: "hold-o", label: "Other senators, not up in 2026", count: composition.holdoverOther, color: "var(--ind)" },
    { key: "hold-r", label: "Republicans, not up in 2026", count: composition.holdoverRep, color: "var(--r-safe-r)" },
  ];
  const leftSeats = composition.holdoverDem + (["Safe D", "Likely D", "Lean D"] as const).reduce((s, c) => s + (counts.get(c) ?? 0), 0);
  const rightSeats = composition.holdoverRep + (["Lean R", "Likely R", "Safe R"] as const).reduce((s, c) => s + (counts.get(c) ?? 0), 0);

  const curves = useMemo<CurveSpec[]>(
    () => [{ key: "senate", label: "Democrats win control", color: "var(--dem)", races: senate, threshold: needed }],
    [senate, needed],
  );

  const selectedStates = useMemo(
    () => (categories.length ? new Set(senate.filter((r) => categories.includes(categoryOf.get(r.state)!)).map((r) => r.state)) : null),
    [categories, senate, categoryOf],
  );

  const sourceLine = `Source: model from 2024 presidential lean (The Downballot), the national vote, incumbency and ${forecasters.length || "the published"} forecasters' ratings${ratingsAsOf ? ` (latest ${fmtDate(ratingsAsOf)})` : ""}; candidates from Wikipedia. Model at ${fmtMargin(params.env)}.`;

  const specials = senate.filter((r) => r.specialElection);
  const independents = senate.filter((r) => r.special === "independent_vs_R");
  const rankedChoice = senate.filter((r) => r.rankedChoice);

  // Seat-bar segments link to this page's table filtered to that category. Handle those here,
  // as a URL update plus a scroll, so the filter applies without a navigation; other links
  // (and modified clicks, which open a new tab) behave normally.
  const onSamePageLink = (e: MouseEvent<HTMLDivElement>) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    // The seat bar's links are SVG <a> elements, whose `href` is not a string: read the attribute.
    const anchor = e.target instanceof Element ? e.target.closest("a") : null;
    const raw = anchor?.getAttribute("href");
    if (!raw) return;
    const url = new URL(raw, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname) return;
    e.preventDefault();
    e.stopPropagation();
    setSearchParams({ cat: url.searchParams.get("cat") });
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("races")?.scrollIntoView({ behavior: still ? "auto" : "smooth", block: "start" });
  };

  const tileHeight = 420;

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "Senate" }]}
        eyebrow="2026 Senate · Live scenario"
        title={`${senate.length} seats up. ${threshold} for control.`}
        description={
          <>
            Every number below recomputes from the national vote set above
            {environment ? ` (default: the polling average, ${fmtMargin(environment.margin)})` : ""}. This is a simulation, not a forecast.
            Click a state, a segment or a row to drill down. Data updated {fmtDate(generated)}.
          </>
        }
      />

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Democrats win control"
          value={fmtProb(outlook.pDemControl)}
          detail={`Needs ${threshold} Democratic-caucus seats`}
          accent="var(--dem)"
          href={href("/simulator")}
        />
        <Stat
          label="Republicans win control"
          value={fmtProb(outlook.pRepControl)}
          detail={`Needs ${composition.vicePresidentParty === "R" ? 50 : 51} seats; the ${vpParty} vice president breaks ties`}
          accent="var(--rep)"
          href={href("/simulator")}
        />
        <Stat
          label="Expected seats"
          value={
            <span className="tabular-nums">
              D {Math.round(outlook.expectedDem)} · R {Math.round(outlook.expectedRep)}
            </span>
          }
          detail={`Independents outside either caucus: ${outlook.expectedInd.toFixed(1)}. Democratic caucus ${netDem >= 0 ? "+" : "−"}${Math.abs(netDem).toFixed(1)} vs today`}
        />
        <Stat
          label="Seats up in 2026"
          value={senate.length}
          detail={`Republicans defend ${defending.R}, Democrats ${defending.D}${defending.other ? `, others ${defending.other}` : ""}`}
          href="#races"
        />
        <Stat
          label="Seats not up"
          value={
            <span className="tabular-nums">
              D {composition.holdoverDem} · R {composition.holdoverRep}
            </span>
          }
          detail={
            composition.source === "derived"
              ? "By caucus; derived from the current 53–47 Senate"
              : `By caucus${composition.holdoverOther ? `; ${composition.holdoverOther} other` : ""}`
          }
        />
        <Stat
          label="Senate finish line"
          value={finish == null ? "—" : fmtMargin(finish)}
          detail={tippingRace ? `National vote where the tipping-point race, ${tippingRace.stateName}, is even` : "National vote Democrats need to be favored"}
          href={tippingRace ? href(senateHref(tippingRace.state)) : undefined}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle
            title="All 100 seats"
            description={`Seats not up in 2026 sit at the ends; the ${senate.length} races are colored by the model's category at a national vote of ${fmtMargin(params.env)}. Click a segment to list those races.`}
          />
          <div onClickCapture={onSamePageLink}>
            <SeatBar
              segments={segments}
              majority={threshold}
              total={SENATE_SEATS}
              majorityLabel={`${threshold} for Democratic control`}
              ends={{
                left: { label: "Democrats", value: leftSeats, color: "var(--r-safe-d)", detail: "Seats favoring the Democratic caucus" },
                right: { label: "Republicans", value: rightSeats, color: "var(--r-safe-r)", detail: "Seats favoring Republicans" },
              }}
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            <LegendItem color="var(--r-safe-d)" label={`D not up ${composition.holdoverDem}`} />
            {RATING_ORDER.map((r) => (
              <LegendItem key={r} color={RATING_COLOR[r]} label={`${r} ${counts.get(r) ?? 0}`} />
            ))}
            {composition.holdoverOther > 0 && <LegendItem color="var(--ind)" label={`Other not up ${composition.holdoverOther}`} />}
            <LegendItem color="var(--r-safe-r)" label={`R not up ${composition.holdoverRep}`} />
          </div>
          <p className="mt-4 text-sm leading-6 text-ink-2">
            The vice president is a {vpParty}, and breaks a 50–50 tie, so {tieWinner} control the chamber at 50 seats. Democrats need{" "}
            {threshold}: the {composition.holdoverDem} seats they hold that are not up, plus {needed > 0 ? needed : 0} of this year&apos;s{" "}
            {senate.length} races. Independents who caucus with Democrats are counted with them.
          </p>

          <div className="mt-5 border-t border-line pt-5">
            <ChartFrame
              className="!border-0 !p-0"
              title="Races on the map"
              subtitle="States with a Senate race, colored by the model's category. The label is the favored side's chance. Click a state to open its race."
              height={tileHeight}
              csvName="senate-races-map"
              source={`${sourceLine} ${US_MAP_CREDIT}`}
              legend={
                <>
                  {RATING_ORDER.map((r) => (
                    <LegendItem key={r} color={RATING_COLOR[r]} label={r} />
                  ))}
                  <LegendItem color="var(--surface-2)" label="No race in 2026" />
                </>
              }
              table={{
                columns: [
                  { key: "state", label: "State" },
                  { key: "model", label: "Model category" },
                  { key: "favored", label: "Favored side's chance", align: "right" },
                  { key: "margin", label: "Expected margin", align: "right" },
                  { key: "consensus", label: "Forecaster consensus" },
                ],
                rows: senate
                  .map((r) => {
                    const p = projections.get(r.id);
                    return {
                      state: r.stateName,
                      model: categoryOf.get(r.state),
                      favored: p ? favoredText(p) : "",
                      margin: p ? sideMargin(p) : "",
                      consensus: r.rating,
                    };
                  })
                  .sort((a, b) => a.state.localeCompare(b.state)),
              }}
            >
              {(width) => (
                <UsStateMap
                  width={width}
                  fill={(st) => {
                    const c = categoryOf.get(st);
                    return c ? RATING_COLOR[c] : null;
                  }}
                  label={(st) => {
                    const r = byState.get(st);
                    const p = r && projections.get(r.id);
                    return p ? favoredText(p) : null;
                  }}
                  hrefFor={(st) => (byState.has(st) ? href(senateHref(st)) : null)}
                  selected={selectedStates}
                  ariaLabel={`Map of the ${senate.length} states with a Senate race in 2026, colored by the model's category. Each state links to its race.`}
                  tooltip={(st) => {
                    const r = byState.get(st);
                    if (!r) return <TipTitle>{`${STATE_BY_POSTAL[st]?.name ?? st}: no Senate race in 2026`}</TipTitle>;
                    const p = projections.get(r.id);
                    return (
                      <>
                        <TipTitle>
                          {r.stateName}
                          {r.specialElection ? " (special)" : ""}
                        </TipTitle>
                        <div className="mb-1 max-w-64 text-ink-2">
                          {p ? challengerName(r, p.challenger) : r.dem || "—"} vs {r.rep || "—"}
                        </div>
                        {p && (
                          <TipRow
                            color={p.challenger === "I" ? "var(--ind)" : "var(--dem)"}
                            label={p.challenger === "I" ? "Independent wins" : "Democrat wins"}
                            value={fmtProb(p.pWin)}
                          />
                        )}
                        {p && <TipRow color="var(--rep)" label="Republican wins" value={fmtProb(1 - p.pWin)} />}
                        {p && <TipRow label="Expected margin" value={sideMargin(p)} />}
                        <TipRow label="Model" value={categoryOf.get(st)} />
                        <TipRow label="Forecasters" value={r.rating} />
                        <TipRow label="Incumbent" value={`${r.incumbent || "—"} (${r.incumbentParty || "?"})${r.incumbentRunning ? "" : ", not running"}`} />
                      </>
                    );
                  }}
                />
              )}
            </ChartFrame>
          </div>
        </Card>

        <SenatePath
          senate={senate}
          projections={outlook.projections}
          holdoverDem={composition.holdoverDem}
          threshold={threshold}
          finish={finish}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SenateSeatDistribution senate={senate} composition={composition} outlook={outlook} source={sourceLine} />
        <SensitivityChart
          title="Chance of Democratic control, by national vote"
          subtitle={`Republican control is close to the complement; the gap is the chance that independents outside either caucus hold the balance. The vertical line is your setting. Click anywhere to move the national vote there.`}
          curves={curves}
          source={`Model curves at every national-vote setting from R+15 to D+15, counting ${composition.holdoverDem} Democratic-caucus seats not up.`}
        />
      </div>

      <section id="races" aria-labelledby="races-title" className="mt-8 scroll-mt-28">
        <SectionTitle
          title={<span id="races-title">Every race</span>}
          description={`The ${senate.length} races, closest first. Filter by the model's category; the filter is kept in the link. Click a row to open the race.`}
        />
        <SenateRaceTable
          senate={senate}
          projections={projections}
          categories={categories}
          onCategories={(next) => setCategories(next)}
        />
      </section>

      <div className="mt-6">
        <SenateMoney senate={senate} money={money} outside={outside} />
      </div>

      <Card className="mt-6">
        <SectionTitle title="Notes" />
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-ink-2">
          <li>
            <span className="font-medium text-ink">Control.</span> The Senate has 100 seats. The vice president is a {vpParty} and breaks
            50–50 ties, so {tieWinner} control the chamber with 50 seats and the other side needs 51.
          </li>
          {independents.length > 0 && (
            <li>
              <span className="font-medium text-ink">Independents.</span> In {listNames(independents.map((r) => r.stateName))} no Democrat is
              on the ballot, and the model treats the leading independent as the Republican&apos;s opponent. A win by one of these candidates
              counts as an independent seat, not a Democratic one, in the seat totals and the chance of control; in the table and on the map
              their chance is labelled &quot;I&quot;, and the model categories (&quot;Lean D&quot; and so on) refer to the independent.
              Independents now in the Senate who caucus with Democrats are counted as Democrats.
            </li>
          )}
          {specials.length > 0 && (
            <li>
              <span className="font-medium text-ink">Special elections.</span> {listNames(specials.map((r) => r.stateName))}{" "}
              {specials.length === 1 ? "holds a special election" : "hold special elections"} to fill the rest of a term; the winner serves
              until that term ends. {specials.length === 1 ? "It counts" : "They count"} as {specials.length === 1 ? "a seat" : "seats"} up in
              2026 like any other.
            </li>
          )}
          {rankedChoice.length > 0 && (
            <li>
              <span className="font-medium text-ink">Ranked-choice voting.</span> {listNames(rankedChoice.map((r) => r.stateName))}{" "}
              {rankedChoice.length === 1 ? "uses" : "use"} ranked-choice voting in the general election. The model works with the
              two-party margin.
            </li>
          )}
          <li>
            <span className="font-medium text-ink">Seats not up.</span>{" "}
            {composition.source === "derived"
              ? "The split of seats not up in 2026 is derived from the current 53–47 Senate minus the seats each caucus defends this year."
              : "The split of seats not up in 2026 comes from the data pipeline (Wikipedia)."}
          </li>
          <li>
            <span className="font-medium text-ink">Ratings.</span> Consensus is the median of{" "}
            {forecasters.length ? listNames(forecasters) : "the published forecasters"}. Model categories come from the chance of winning:
            under 60% is a toss-up, under 80% lean, under 95% likely, otherwise safe.{" "}
            <Link href={href("/methodology")} className="font-medium underline underline-offset-2">
              How the model works
            </Link>
            {" · "}
            <Link href={href("/forecasters?chamber=senate")} className="font-medium underline underline-offset-2">
              Compare the forecasters
            </Link>
          </li>
        </ul>
      </Card>
    </div>
  );
}
