"use client";

import { Stat } from "@/components/ui/primitives";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { fmtSideMargin, type AnyRace } from "./race-utils";

export function RaceKpis({
  race,
  projection,
  flipPoint,
  env,
  national2024,
}: {
  race: AnyRace;
  projection: RaceProjection;
  flipPoint: number | null;
  env: number;
  national2024: number;
}) {
  const ind = projection.challenger === "I";
  const sideWord = ind ? "independent" : "Democrat";
  const isHouse = "district" in race;
  const pres20 = isHouse ? race.pres20 : null;
  const pDem = projection.pWin;

  let flipDetail: string;
  if (flipPoint == null) {
    flipDetail = "The ballot decides which party wins, so the national vote cannot flip it.";
  } else {
    const gap = Math.abs(env - flipPoint);
    const away = gap < 0.05 ? "right at the current setting" : `${gap.toFixed(1)} points from the current setting`;
    flipDetail =
      projection.margin >= 0
        ? `Flips to the Republican if the national vote is worse for Democrats than ${fmtMargin(flipPoint)}: ${away}.`
        : `Flips if the national vote is better for Democrats than ${fmtMargin(flipPoint)}: ${away}.`;
  }

  return (
    <section aria-label="Key numbers in this scenario" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Stat
        label={`Chance the ${sideWord} wins`}
        value={<span className="tabular-nums">{fmtProb(pDem)}</span>}
        detail={`Republican ${fmtProb(1 - pDem)}, at a national vote of ${fmtMargin(env)}`}
        accent={ind ? "var(--ind)" : "var(--dem)"}
      />
      <Stat
        label="Expected margin"
        value={<span className="tabular-nums">{fmtSideMargin(projection.margin, projection.challenger)}</span>}
        detail={projection.forced ? "Fixed by who is on the ballot" : "Model blend of fundamentals and the forecasters"}
      />
      <Stat
        label="Flip point"
        value={<span className="tabular-nums">{flipPoint == null ? "None" : fmtMargin(flipPoint)}</span>}
        detail={flipDetail}
      />
      <Stat
        label="2024 presidential margin"
        value={<span className="tabular-nums">{fmtMargin(race.pres24)}</span>}
        detail={
          pres20 != null
            ? `2020: ${fmtMargin(pres20)}, a shift of ${Math.abs(race.pres24 - pres20).toFixed(1)} points toward ${race.pres24 >= pres20 ? "Democrats" : "Republicans"}`
            : isHouse
              ? "No 2020 result on these lines"
              : "Statewide result"
        }
      />
      {/* Five tiles: the last spans the row on phones so the grid has no orphan. */}
      <div className="col-span-2 md:col-span-1 [&>*]:h-full">
        <Stat
          label={isHouse ? "District lean" : "State lean"}
          value={<span className="tabular-nums">{fmtMargin(race.lean)}</span>}
          detail={`2024 margin compared with the nation's ${fmtMargin(national2024)}`}
        />
      </div>
    </section>
  );
}
