"use client";

// The road to control: races with a Democratic nominee ranked from most to least Democratic in
// this scenario, with the running Democratic-caucus total. The race that brings the caucus to
// the control line is the tipping point.
import Link from "next/link";
import { useMemo } from "react";

import { ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { Card, SectionTitle } from "@/components/ui/primitives";
import type { SenateRace } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { senateHref } from "@/lib/routes";

export function SenatePath({
  senate,
  projections,
  holdoverDem,
  threshold,
  finish,
}: {
  senate: SenateRace[];
  projections: RaceProjection[];
  holdoverDem: number;
  threshold: number;
  /** National vote at which the tipping-point race is even, when defined. */
  finish: number | undefined;
}) {
  const { href } = useScenario();
  const byId = useMemo(() => new Map(senate.map((r) => [r.id, r])), [senate]);
  const needed = threshold - holdoverDem;

  const ladder = useMemo(() => {
    const ranked = projections
      .filter((p) => p.challenger === "D")
      .sort((a, b) => b.margin - a.margin)
      .map((p, i) => ({ p, race: byId.get(p.id)!, seats: holdoverDem + i + 1 }));
    const at = Math.max(0, Math.min(ranked.length - 1, needed - 1));
    return { rows: ranked.slice(Math.max(0, at - 4), at + 4), total: ranked.length };
  }, [projections, byId, holdoverDem, needed]);

  return (
    <Card className="flex flex-col">
      <SectionTitle
        title={`The road to ${threshold}`}
        description={`Democrats hold ${holdoverDem} seats that are not up and need ${needed > 0 ? `${needed} more` : "no more"} for control. Races with a Democratic nominee, ranked from most to least Democratic in this scenario.`}
      />
      {needed <= 0 || needed > ladder.total ? (
        <p className="text-sm text-ink-2">
          {needed <= 0
            ? "Democrats reach control with the seats not up this year."
            : "Even winning every race with a Democratic nominee would leave the caucus short of control."}
        </p>
      ) : (
        <ol className="-mx-1 divide-y divide-line text-sm">
          {ladder.rows.map(({ p, race, seats }) => {
            const tipping = seats === threshold;
            return (
              <li key={race.id} className={`flex items-center gap-3 rounded-md px-1 py-2 ${tipping ? "bg-surface-2" : ""}`}>
                <span className="w-7 shrink-0 text-right text-xs text-ink-2 tabular-nums" title="Democratic-caucus seats with this race">
                  {seats}
                </span>
                <span className="min-w-0 flex-1">
                  <Link href={href(senateHref(race.state))} className="block truncate font-medium hover:underline">
                    {race.stateName}
                  </Link>
                  <span className="block truncate text-[11px] text-muted">
                    {tipping ? "Tipping point · " : ""}
                    {fmtMargin(p.margin)}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-2 text-xs tabular-nums">
                  <ProbBar p={p.pWin} width={56} height={10} />
                  <span className="w-9 text-right">{fmtProb(p.pWin)}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <p className="mt-auto pt-3 text-xs leading-5 text-ink-2">
        {finish != null
          ? `The tipping-point race is even at a national vote of ${fmtMargin(finish)}: the Senate finish line. `
          : ""}
        The left number is the Democratic-caucus total if Democrats win that race and every race above it. Chance is for the Democrat.
      </p>
    </Card>
  );
}
