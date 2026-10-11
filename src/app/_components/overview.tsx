"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { HexMap } from "@/components/charts/hex-map";
import { SeatBar, type SeatSegment } from "@/components/charts/seat-bar";
import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { Card, RatingChip, SectionTitle, Stat } from "@/components/ui/primitives";
import { HOUSE_MAJORITY, HOUSE_SEATS } from "@/lib/data/states";
import type { HexMap as HexMapData, HouseRace, Meta, RatingLabel, SenateRace } from "@/lib/data/types";
import { fmtDate, fmtMargin, fmtProb } from "@/lib/format";
import { houseInsights } from "@/lib/insights";
import type { SenateComposition } from "@/lib/model/engine";
import { useHouseOutlook, useSenateOutlook } from "@/lib/model/use-outlook";
import { RATING_COLOR, RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { houseHref, senateHref, stateHref } from "@/lib/routes";
import { ModelSections } from "./overview-model-sections";

export function Overview({
  house,
  senate,
  hexmap,
  composition,
  generated,
  environment,
}: {
  house: HouseRace[];
  senate: SenateRace[];
  hexmap: HexMapData;
  composition: SenateComposition;
  generated: string;
  environment: Meta["environment"] | null;
}) {
  const { params, href } = useScenario();
  const houseOutlook = useHouseOutlook(house);
  const senateOutlook = useSenateOutlook(senate, composition);
  const [mode, setMode] = useState<"model" | "forecasters">("model");

  const projections = useMemo(() => new Map(houseOutlook.projections.map((p) => [p.id, p])), [houseOutlook]);
  const byId = useMemo(() => new Map(house.map((r) => [r.id, r])), [house]);

  const categoryOf = (race: HouseRace): RatingLabel => {
    if (mode === "forecasters") return race.rating;
    const p = projections.get(race.id);
    return p ? ratingFromProb(p.pWin) : race.rating;
  };

  const segments: SeatSegment[] = RATING_ORDER.map((label) => ({
    key: label,
    label: mode === "model" ? `Model: ${label}` : `Forecasters: ${label}`,
    count: house.filter((r) => categoryOf(r) === label).length,
    color: RATING_COLOR[label],
    href: mode === "forecasters" ? href(`/house?rating=${encodeURIComponent(label)}`) : href(`/house?ids=${house.filter((r) => categoryOf(r) === label).map((r) => r.id).join(",")}`),
  }));

  const expectedD = Math.round(houseOutlook.expectedDem);
  const insights = useMemo(() => houseInsights(house, houseOutlook, params), [house, houseOutlook, params]);

  // The road to 218: seats ranked from most to least Democratic, around the majority line.
  const ladder = useMemo(() => {
    const ranked = houseOutlook.projections
      .filter((p) => p.challenger === "D")
      .sort((a, b) => b.margin - a.margin)
      .map((p, i) => ({ rank: i + 1, p, race: byId.get(p.id)! }));
    return ranked.slice(HOUSE_MAJORITY - 13, HOUSE_MAJORITY + 12);
  }, [houseOutlook, byId]);

  const senateSegments: SeatSegment[] = useMemo(() => {
    const cats = new Map<RatingLabel, number>();
    for (const p of senateOutlook.projections) {
      const c = ratingFromProb(p.pWin);
      cats.set(c, (cats.get(c) ?? 0) + 1);
    }
    return [
      { key: "hold-d", label: "Democrats, not up in 2026", count: composition.holdoverDem, color: "var(--r-safe-d)" },
      ...RATING_ORDER.map((label) => ({
        key: label,
        label: `Up in 2026, model: ${label}`,
        count: cats.get(label) ?? 0,
        color: RATING_COLOR[label],
        href: href("/senate"),
      })),
      { key: "hold-r", label: "Republicans, not up in 2026", count: composition.holdoverRep, color: "var(--r-safe-r)" },
    ];
  }, [senateOutlook, composition, href]);

  const tossups = house.filter((r) => r.rating === "Tossup").length + senate.filter((r) => r.rating === "Tossup").length;

  return (
    <div className="pb-6">
      <header className="pt-6 pb-5 sm:pt-8">
        <div className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">2026 midterms · Live scenario</div>
        <h1 className="mt-1 font-serif text-3xl leading-tight font-semibold tracking-tight sm:text-4xl">
          435 seats. 218 to win. Here&apos;s where it stands.
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-2 sm:text-base">
          Every number below recomputes from the national vote you set above
          {environment ? ` (default: the polling average, ${fmtMargin(environment.margin)})` : ""}. Click any seat, state or bar to drill
          down. Data updated {fmtDate(generated)}.
        </p>
      </header>

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat
          label="Democrats win the House"
          value={fmtProb(houseOutlook.pDemMajority)}
          detail={`Republicans ${fmtProb(1 - houseOutlook.pDemMajority)}`}
          accent="var(--dem)"
          href={href("/simulator")}
        />
        <Stat
          label="House seats, D–R"
          value={`${expectedD}–${HOUSE_SEATS - expectedD}`}
          detail={`Democrats' 80% range: ${houseOutlook.low}–${houseOutlook.high}`}
          href={href("/house")}
        />
        <Stat
          label="Finish line"
          value={houseOutlook.finishLine == null ? "—" : fmtMargin(houseOutlook.finishLine)}
          detail="National vote Democrats need to be favored"
          href={href("/simulator")}
        />
        <Stat
          label="Democrats win the Senate"
          value={fmtProb(senateOutlook.pDemControl)}
          detail={`Republicans ${fmtProb(senateOutlook.pRepControl)}`}
          accent="var(--dem)"
          href={href("/senate")}
        />
        <Stat
          label="Senate seats, D–R"
          value={`${Math.round(senateOutlook.expectedDem)}–${Math.round(senateOutlook.expectedRep)}`}
          detail="Democratic caucus needs 51 for control"
          href={href("/senate")}
        />
        <Stat
          label="Toss-ups"
          value={tossups}
          detail="House and Senate races the forecasters call even"
          href={href("/house?rating=Tossup")}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold">The House, seat by seat</h2>
              <p className="mt-0.5 text-sm text-ink-2">
                {mode === "model"
                  ? `The model at a national vote of ${fmtMargin(params.env)}. Seats sorted from most Democratic to most Republican.`
                  : "The median of 10 published forecasters' ratings."}{" "}
                Click a segment or a district to drill down.
              </p>
            </div>
            <div role="group" aria-label="Color seats by" className="inline-flex rounded-lg border border-line p-0.5 text-xs">
              {(["model", "forecasters"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  aria-pressed={mode === m}
                  onClick={() => setMode(m)}
                  className={`rounded-md px-2.5 py-1 font-medium ${mode === m ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
                >
                  {m === "model" ? "This model" : "Forecasters"}
                </button>
              ))}
            </div>
          </div>
          <SeatBar
            segments={segments}
            majority={HOUSE_MAJORITY}
            total={HOUSE_SEATS}
            majorityLabel="218 for a majority"
            leftLabel={
              <span>
                <span className="font-semibold text-ink">{segments.slice(0, 3).reduce((s, x) => s + x.count, 0)}</span>{" "}
                <span className="text-ink-2">lean Democratic</span>
              </span>
            }
            rightLabel={
              <span>
                <span className="font-semibold text-ink">{segments.slice(4).reduce((s, x) => s + x.count, 0)}</span>{" "}
                <span className="text-ink-2">lean Republican</span>
              </span>
            }
          />
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            {RATING_ORDER.map((r) => (
              <span key={r} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="size-2.5 rounded-sm" style={{ background: RATING_COLOR[r] }} />
                {r} {segments.find((s) => s.key === r)?.count}
              </span>
            ))}
          </div>
          <div className="mt-5">
            <HexMap
              map={hexmap}
              ariaLabel={`Map of all 435 House districts colored by ${mode === "model" ? "the model" : "forecaster consensus"}`}
              fill={(id) => RATING_COLOR[categoryOf(byId.get(id)!)]}
              hrefFor={(id) => href(houseHref(id))}
              stateHref={(st) => href(stateHref(st))}
              tooltip={(id) => {
                const race = byId.get(id)!;
                const p = projections.get(id);
                return (
                  <>
                    <TipTitle>
                      {id} · {race.stateName}
                    </TipTitle>
                    <div className="mb-1 text-ink-2">
                      {race.incumbent ? `${race.incumbent} (${race.incumbentParty || "?"})${race.incumbentRunning ? "" : ", not running"}` : "Open seat"}
                    </div>
                    {p && <TipRow color="var(--dem)" label="Democrats win" value={fmtProb(p.forced ? (p.margin > 0 ? 1 : 0) : p.pWin)} />}
                    {p && <TipRow label="Expected margin" value={fmtMargin(p.margin)} />}
                    <TipRow label="Forecasters" value={race.rating} />
                    <TipRow label="District lean" value={fmtMargin(race.lean)} />
                  </>
                );
              }}
            />
            <p className="mt-2 text-[11px] text-muted">
              Equal-area map: every district is the same size. Congressional District Hexmap by Daniel Donner for{" "}
              <a href="https://the-db.co/maps" className="underline">
                The Downballot
              </a>{" "}
              (CC BY 4.0).
            </p>
          </div>
        </Card>

        <div className="space-y-3">
          <SectionTitle title="What the numbers say" description="Generated from the data and your scenario." />
          {insights.map((ins) => (
            <Card key={ins.key} className="!p-4">
              <h3 className="text-sm font-semibold">{ins.title}</h3>
              <p className="mt-1 text-sm leading-6 text-ink-2">{ins.body}</p>
              {ins.href && (
                <Link href={href(ins.href)} className="mt-2 inline-block text-xs font-semibold underline underline-offset-2">
                  {ins.linkLabel ?? "Explore"}
                </Link>
              )}
            </Card>
          ))}
        </div>
      </div>

      <ModelSections house={house} senate={senate} composition={composition} houseOutlook={houseOutlook} senateOutlook={senateOutlook} />

      <Card className="mt-6">
        <SectionTitle
          title="The road to 218"
          description="Seats ranked from most to least Democratic in this scenario. Democrats need every seat down to the 218th; the line marks the tipping point."
          action={
            <Link href={href("/house?competitive=1")} className="text-xs font-semibold underline underline-offset-2">
              All competitive seats
            </Link>
          }
        />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-ink-2">
              <tr>
                <th className="py-2 pr-3 font-medium">Rank</th>
                <th className="py-2 pr-3 font-medium">Seat</th>
                <th className="py-2 pr-3 font-medium">Held by</th>
                <th className="py-2 pr-3 font-medium">Candidates (D vs R)</th>
                <th className="py-2 pr-3 text-right font-medium">Expected</th>
                <th className="py-2 pr-3 font-medium">Chance (D | R)</th>
                <th className="py-2 font-medium">Forecasters</th>
              </tr>
            </thead>
            <tbody>
              {ladder.map(({ rank, p, race }) => (
                <tr key={race.id} className={`border-t ${rank === HOUSE_MAJORITY ? "border-t-2 border-ink" : "border-line"} hover:bg-surface-2`}>
                  <td className="py-1.5 pr-3 text-ink-2 tabular-nums">
                    {rank}
                    {rank === HOUSE_MAJORITY && <span className="ml-1 text-[10px] font-semibold text-ink">TIPPING POINT</span>}
                  </td>
                  <td className="py-1.5 pr-3 font-medium">
                    <Link href={href(houseHref(race.id))} className="hover:underline">
                      {race.id}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3">{race.heldBy || "—"}</td>
                  <td className="max-w-56 truncate py-1.5 pr-3 text-ink-2" title={`${race.dem} vs ${race.rep}`}>
                    {race.dem || "—"} vs {race.rep || "—"}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    <span className="inline-flex items-center gap-2">
                      {fmtMargin(p.margin)}
                      <MarginBar value={p.margin} max={8} width={60} height={12} />
                    </span>
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="inline-flex items-center gap-2 tabular-nums">
                      <ProbBar p={p.pWin} width={70} height={12} />
                      {fmtProb(p.pWin)}
                    </span>
                  </td>
                  <td className="py-1.5">
                    <RatingChip rating={race.rating} size="xs" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-6">
        <SectionTitle
          title="The Senate"
          description={`${senate.length} seats are up. Democrats need 51 seats for control (a 50–50 tie goes to the Republican vice president).`}
          action={
            <Link href={href("/senate")} className="text-xs font-semibold underline underline-offset-2">
              Open the Senate dashboard
            </Link>
          }
        />
        <SeatBar
          segments={senateSegments}
          majority={51}
          total={100}
          majorityLabel="51 for Democratic control"
          leftLabel={
            <span>
              <span className="font-semibold text-ink">{Math.round(senateOutlook.expectedDem)}</span>{" "}
              <span className="text-ink-2">expected Democratic caucus</span>
            </span>
          }
          rightLabel={
            <span>
              <span className="font-semibold text-ink">{Math.round(senateOutlook.expectedRep)}</span>{" "}
              <span className="text-ink-2">expected Republican</span>
            </span>
          }
        />
        <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {senateOutlook.projections
            .filter((p) => p.pWin > 0.05 && p.pWin < 0.95)
            .sort((a, b) => Math.abs(a.pWin - 0.5) - Math.abs(b.pWin - 0.5))
            .slice(0, 8)
            .map((p) => {
              const race = senate.find((r) => r.id === p.id)!;
              return (
                <Link key={p.id} href={href(senateHref(race.state))} className="rounded-lg border border-line p-3 hover:bg-surface-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{race.stateName}</span>
                    <RatingChip rating={ratingFromProb(p.pWin)} size="xs" />
                  </div>
                  <div className="mt-1 truncate text-xs text-ink-2">
                    {(p.challenger === "I" ? race.others.split(";").find((o) => o.includes("Independent"))?.trim() : race.dem) || "—"} vs {race.rep || "—"}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs tabular-nums">
                    <ProbBar p={p.pWin} width={90} height={10} />
                    {fmtProb(p.pWin)} {p.challenger === "I" ? "Ind." : "Dem."}
                  </div>
                </Link>
              );
            })}
        </div>
      </Card>
    </div>
  );
}
