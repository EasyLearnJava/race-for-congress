"use client";

import Link from "next/link";

import { ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { Badge, Card, RatingChip } from "@/components/ui/primitives";
import type { SenateRace } from "@/lib/data/types";
import { fmtMargin, fmtProb, partyName } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { partyColor, ratingFromProb } from "@/lib/ratings";
import { senateHref } from "@/lib/routes";

const PARTY_CODE: Record<string, string> = {
  Democratic: "D",
  Republican: "R",
  Independent: "I",
  Libertarian: "L",
  Green: "G",
};

interface Candidate {
  name: string;
  party: string;
}

/** D, R, then everyone in `others` ("Name (Party); ..."). */
function candidates(race: SenateRace): Candidate[] {
  const list: Candidate[] = [];
  for (const name of race.dem.split(" / ").filter(Boolean)) list.push({ name, party: "D" });
  for (const name of race.rep.split(" / ").filter(Boolean)) list.push({ name, party: "R" });
  for (const raw of race.others.split(";")) {
    const text = raw.trim();
    if (!text) continue;
    const m = /^(.*?)\s*\(([^)]+)\)\s*$/.exec(text);
    const party = m ? m[2].trim() : "";
    list.push({ name: m ? m[1] : text, party: PARTY_CODE[party] ?? (party.length === 1 ? party : "O") });
  }
  return list;
}

/** Margin for the race's non-Republican side, labelled with that side. */
function fmtSideMargin(p: RaceProjection): string {
  if (p.challenger === "D") return fmtMargin(p.margin);
  if (Math.abs(p.margin) >= 99.5) return p.margin > 0 ? "Ind. unopposed" : "R unopposed";
  const r = Math.abs(p.margin).toFixed(1);
  if (Number(r) === 0) return "Even";
  return `${p.margin > 0 ? "Ind." : "R"}+${r}`;
}

export function SenateCard({
  name,
  postal,
  races,
  projections,
}: {
  name: string;
  postal: string;
  races: SenateRace[];
  projections: Map<string, RaceProjection>;
}) {
  const { href } = useScenario();

  if (!races.length) {
    return (
      <Card>
        <h2 className="text-base font-semibold text-ink">Senate</h2>
        <p className="mt-1 text-sm text-ink-2">Neither of {name}&apos;s Senate seats is up in 2026.</p>
        <Link href={href("/senate")} className="mt-3 inline-block link-more text-sm">
          See the 35 Senate races on the ballot
        </Link>
      </Card>
    );
  }

  return (
    <>
      {races.map((race) => {
        const p = projections.get(race.id);
        const side = p?.challenger === "I" ? "independent" : "Democrat";
        const pWin = p ? (p.forced ? (p.margin > 0 ? 1 : 0) : p.pWin) : null;
        return (
          <Card key={race.id}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-ink">Senate</h2>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <RatingChip rating={race.rating} size="xs" />
                  <span className="text-[11px] text-ink-2">forecasters</span>
                  {race.specialElection && <Badge>Special election</Badge>}
                  {race.rankedChoice && <Badge>Ranked-choice</Badge>}
                </div>
              </div>
              {p && (
                <div className="text-right">
                  <div className="text-2xl font-semibold tracking-tight text-ink tabular-nums">{fmtProb(pWin)}</div>
                  <div className="text-[11px] text-ink-2">chance the {side} wins</div>
                </div>
              )}
            </div>

            {p && (
              <div className="mt-3">
                <ProbBar p={pWin} challenger={p.challenger} width={220} height={12} ariaLabel={`Chance the ${side} wins: ${fmtProb(pWin)}`} />
                <div className="mt-1.5 flex flex-wrap justify-between gap-x-3 text-xs text-ink-2 tabular-nums">
                  <span>
                    Expected margin <span className="font-semibold text-ink">{fmtSideMargin(p)}</span>
                  </span>
                  <span>
                    Model: <span className="font-semibold text-ink">{ratingFromProb(pWin ?? 0.5)}</span>
                  </span>
                </div>
              </div>
            )}

            <ul className="mt-3 space-y-1.5 border-t border-line pt-3">
              {candidates(race).map((c) => {
                const incumbent = race.incumbent && race.incumbentRunning && c.name.includes(race.incumbent);
                return (
                  <li key={`${c.party}-${c.name}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: partyColor(c.party) }} />
                      <span className="truncate text-ink">{c.name}</span>
                      {incumbent && <span className="shrink-0 text-[11px] text-ink-2">incumbent</span>}
                    </span>
                    <span className="shrink-0 text-xs text-ink-2">{partyName(c.party)}</span>
                  </li>
                );
              })}
              {!candidates(race).length && <li className="text-sm text-ink-2">Candidates not yet known.</li>}
            </ul>
            {!race.incumbentRunning && race.incumbent && (
              <p className="mt-2 text-xs text-ink-2">
                Open seat: {race.incumbent} ({race.incumbentParty || "?"}) is not running.
              </p>
            )}

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
              <span>2024 presidential margin in {postal}: {fmtMargin(race.pres24)}</span>
              <Link href={href(senateHref(postal))} className="font-semibold text-ink underline underline-offset-2">
                Open the {name} Senate race
              </Link>
            </div>
          </Card>
        );
      })}
    </>
  );
}
