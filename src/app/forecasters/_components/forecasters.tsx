"use client";

import { useMemo, type ReactNode } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { Empty, PageHeader, Stat } from "@/components/ui/primitives";
import { HOUSE_MAJORITY } from "@/lib/data/states";
import type { Rating, RatingLabel } from "@/lib/data/types";
import { fmtDate, fmtMargin, fmtNum, signed } from "@/lib/format";
import type { SenateComposition } from "@/lib/model/engine";
import { useProjections } from "@/lib/model/use-outlook";
import { RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { explorerHref } from "@/lib/routes";
import { useQueryParam } from "@/lib/url-state";
import { analyzeChamber, daysBetween, shortName, type Chamber, type RaceLite } from "./analytics";
import { AgreementMatrix, ChamberToggle, FocusPanel, Freshness, HouseEffects, ImpliedSeats, MostContested, PairPanel } from "./sections";

export interface RatingsSource {
  name: string;
  url: string;
  retrieved: string;
}

const parseChamber = (raw: string): Chamber | undefined => (raw === "house" || raw === "senate" ? raw : undefined);
const parseText = (raw: string) => raw;
const PAIR_SEP = "~";
const FOCUS_PANEL_ID = "forecaster-focus";
const PAIR_PANEL_ID = "forecaster-pair";

/**
 * After a click opens a panel, bring it into view when it sits off screen (the freshness table
 * is below the focus panel; on phones the pair panel sits under the matrix). Runs from event
 * handlers, after React has committed the URL change, never during render.
 */
function reveal(id: string) {
  requestAnimationFrame(() => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ block: "nearest", behavior: reduce ? "auto" : "smooth" });
  });
}

/** Forecaster names in a KPI tile: a step smaller than the numeric values so they fit. */
function NameValue({ children }: { children: ReactNode }) {
  return <span className="block text-base leading-6 sm:text-xl sm:leading-8 xl:text-lg">{children}</span>;
}

const plural = (n: number, word: string) => `${fmtNum(n)} ${word}${n === 1 ? "" : "s"}`;

export function Forecasters({
  ratings,
  house,
  senate,
  composition,
  compositionDerived,
  sources,
  generated,
}: {
  ratings: Rating[];
  house: RaceLite[];
  senate: RaceLite[];
  composition: SenateComposition;
  /** True when holdover seats are derived from the 53-47 Senate rather than read from the pipeline. */
  compositionDerived: boolean;
  sources: Record<Chamber, RatingsSource | null>;
  generated: string;
}) {
  const { params, href } = useScenario();
  const [chamber, setChamber] = useQueryParam<Chamber>("chamber", "house", parseChamber);
  const [focusRaw, setFocus] = useQueryParam<string>("forecaster", "", parseText);
  const [pairRaw, setPair] = useQueryParam<string>("pair", "", parseText);

  const races = chamber === "house" ? house : senate;
  const raceById = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const chamberRatings = useMemo(() => ratings.filter((r) => r.chamber === chamber), [ratings, chamber]);
  const forecasterNames = useMemo(() => [...new Set(chamberRatings.map((r) => r.source))].sort(), [chamberRatings]);
  const analysis = useMemo(() => analyzeChamber(chamberRatings, races, forecasterNames), [chamberRatings, races, forecasterNames]);

  // One order everywhere: most Democratic-leaning relative to the consensus first.
  const order = useMemo(
    () =>
      [...analysis.forecasters].sort(
        (a, b) => (b.effect ?? -Infinity) - (a.effect ?? -Infinity) || a.source.localeCompare(b.source),
      ),
    [analysis],
  );

  const focus = forecasterNames.includes(focusRaw) ? focusRaw : "";
  const focused = order.find((f) => f.source === focus) ?? null;
  const pair = useMemo<[string, string] | null>(() => {
    const [a, b] = pairRaw.split(PAIR_SEP);
    return a && b && a !== b && forecasterNames.includes(a) && forecasterNames.includes(b) ? [a, b] : null;
  }, [pairRaw, forecasterNames]);

  const toggleFocus = (source: string) => {
    if (source === focus) {
      setFocus(null);
      return;
    }
    setFocus(source);
    reveal(FOCUS_PANEL_ID);
  };
  const selectPair = (a: string, b: string) => {
    setPair(`${a}${PAIR_SEP}${b}`);
    reveal(PAIR_PANEL_ID);
  };

  // The model's own categories in the current scenario, as a comparison row.
  const projections = useProjections(races);
  const modelCounts = useMemo(() => {
    const counts = Object.fromEntries(RATING_ORDER.map((r) => [r, 0])) as Record<RatingLabel, number>;
    for (const race of races) {
      const p = projections.get(race.id);
      if (!p) continue;
      counts[ratingFromProb(p.forced ? (p.margin > 0 ? 1 : 0) : p.pWin)]++;
    }
    return counts;
  }, [races, projections]);

  // Seats Democrats need from the races drawn: 218 in the House; in the Senate, control minus holdovers.
  const senateControl = composition.vicePresidentParty === "D" ? 50 : 51;
  const senateNeed = senateControl - composition.holdoverDem;
  const reference =
    chamber === "house"
      ? { value: HOUSE_MAJORITY, label: `${HOUSE_MAJORITY} for a majority` }
      : { value: senateNeed, label: `${senateNeed} for ${senateControl} seats` };
  const referenceNote =
    chamber === "house"
      ? `The line marks ${HOUSE_MAJORITY} seats, a majority.`
      : `Democrats hold ${composition.holdoverDem} seats not up in 2026 and Republicans ${composition.holdoverRep}, so Democrats need ${senateNeed} of these ${senate.length} races for ${senateControl} seats${
          senateControl === 51 ? " (a 50–50 tie goes to the Republican vice president)" : ""
        }.${compositionDerived ? " Seats not up are derived from the current 53–47 Senate." : ""}`;

  const src = sources[chamber];
  const sourceLine: ReactNode = (
    <>
      Source: ratings published by {forecasterNames.length} forecasters ({forecasterNames.map(shortName).join(", ")}), compiled by{" "}
      {src ? (
        <a href={src.url} className="underline" target="_blank" rel="noreferrer">
          Wikipedia
        </a>
      ) : (
        "Wikipedia"
      )}{" "}
      (CC BY-SA 4.0){src ? `, retrieved ${fmtDate(src.retrieved)}` : ""}. Consensus is the median rating.
    </>
  );

  const unanimousHref =
    chamber === "house" && analysis.unanimous.length > 0 ? href(explorerHref(analysis.unanimous)) : chamber === "senate" ? href("/senate") : undefined;
  const mostD = order.find((f) => f.effect != null) ?? null;
  const mostR = [...order].reverse().find((f) => f.effect != null) ?? null;
  const chamberWord = chamber === "house" ? "House" : "Senate";

  return (
    <div className="pb-6">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "Forecasters" }]}
        eyebrow="Forecaster analytics"
        title="Where the forecasters agree, differ and lean"
        description={`${forecasterNames.length > 0 ? `${forecasterNames.length} published forecasters rate` : "Published forecasters rate"} ${chamber === "house" ? "the competitive House races" : "every Senate race up in 2026"}. Compare their ratings with each other and with the consensus (the median rating). Click a forecaster, a cell or a race to drill down. Data updated ${fmtDate(generated)}.`}
        actions={<ChamberToggle chamber={chamber} onChange={(c) => setChamber(c === "house" ? null : c)} />}
      />

      {chamberRatings.length === 0 ? (
        <Empty title={`No ${chamberWord} ratings loaded`}>
          The ratings dataset has no {chamberWord} rows yet. Charts appear here once the data pipeline adds them.
        </Empty>
      ) : (
        <>
          <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat
              label="Forecasters"
              value={forecasterNames.length}
              detail={`Rating ${fmtNum(analysis.ratedRaces)} of ${fmtNum(races.length)} ${chamber === "house" ? "House seats" : "Senate races"}`}
              href={href(chamber === "house" ? "/house?competitive=1" : "/senate")}
            />
            <Stat
              label="Unanimous races"
              value={fmtNum(analysis.unanimous.length)}
              detail={`Identical ratings from every source. ${fmtNum(analysis.withinOne.length)} of ${fmtNum(analysis.ratedRaces)} sit within one step.`}
              href={unanimousHref}
            />
            <Stat
              label="Most Democratic-leaning"
              value={mostD ? <NameValue>{mostD.short}</NameValue> : "—"}
              detail={mostD?.effect != null ? `${signed(mostD.effect, 2)} steps vs consensus` : "No ratings"}
              accent="var(--dem)"
            />
            <Stat
              label="Most Republican-leaning"
              value={mostR ? <NameValue>{mostR.short}</NameValue> : "—"}
              detail={mostR?.effect != null ? `${signed(mostR.effect, 2)} steps vs consensus` : "No ratings"}
              accent="var(--rep)"
            />
            <Stat
              label="Newest update"
              value={analysis.newest ? fmtDate(analysis.newest.date, true) : "—"}
              detail={analysis.newest ? analysis.newest.sources.map(shortName).join(", ") : undefined}
            />
            <Stat
              label="Oldest update"
              value={analysis.oldest ? fmtDate(analysis.oldest.date, true) : "—"}
              detail={
                analysis.oldest
                  ? `${analysis.oldest.sources.map(shortName).join(", ")}${
                      analysis.newest && analysis.newest.date !== analysis.oldest.date
                        ? `, ${plural(daysBetween(analysis.oldest.date, analysis.newest.date), "day")} before the newest`
                        : ""
                    }`
                  : undefined
              }
            />
          </section>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ImpliedSeats
              chamber={chamber}
              analysis={analysis}
              order={order}
              races={races}
              modelCounts={modelCounts}
              envLabel={fmtMargin(params.env)}
              reference={reference}
              referenceNote={referenceNote}
              focus={focus}
              onFocus={toggleFocus}
              source={sourceLine}
            />
            <HouseEffects chamber={chamber} order={order} focus={focus} onFocus={toggleFocus} source={sourceLine} />
          </div>

          {focused && (
            <div id={FOCUS_PANEL_ID} className="mt-6 scroll-mt-24">
              <FocusPanel chamber={chamber} forecaster={focused} analysis={analysis} raceById={raceById} onClear={() => setFocus(null)} />
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
            <div className="min-w-0 lg:col-span-3">
              <AgreementMatrix
                chamber={chamber}
                analysis={analysis}
                order={order}
                pair={pair}
                onPair={selectPair}
                source={sourceLine}
              />
            </div>
            <div id={PAIR_PANEL_ID} className="min-w-0 scroll-mt-24 lg:col-span-2">
              <PairPanel
                analysis={analysis}
                order={order}
                pair={pair}
                raceById={raceById}
                onPair={selectPair}
                onClear={() => setPair(null)}
              />
            </div>
          </div>

          <div className="mt-6">
            <MostContested chamber={chamber} analysis={analysis} source={sourceLine} />
          </div>

          <div className="mt-6">
            <Freshness chamber={chamber} order={order} newest={analysis.newest?.date ?? null} focus={focus} onFocus={toggleFocus} />
          </div>
        </>
      )}
    </div>
  );
}
