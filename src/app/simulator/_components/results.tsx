"use client";

// Results, House and Senate side by side: headline tiles, the seat distribution of each
// chamber (click a column to explore the world where that result is the expected one) and the
// chance of control across national environments.
import { useMemo } from "react";

import { SeatDistributionChart } from "@/components/model/seat-distribution";
import { SensitivityChart, type CurveSpec } from "@/components/model/sensitivity";
import { useScenario } from "@/components/scenario/scenario";
import { Stat } from "@/components/ui/primitives";
import { HOUSE_MAJORITY, HOUSE_SEATS } from "@/lib/data/states";
import { fmtMargin, fmtProb } from "@/lib/format";
import { finishLine, quantile, type ChamberOutlook, type SenateOutlook } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import type { Composition, SimRace } from "./types";

export function Results({
  house,
  senate,
  composition,
  houseOutlook,
  senateOutlook,
  onExplore,
}: {
  house: SimRace[];
  senate: SimRace[];
  composition: Composition;
  houseOutlook: ChamberOutlook;
  senateOutlook: SenateOutlook;
  onExplore: (chamber: "house" | "senate", seats: number) => void;
}) {
  const { href } = useScenario();
  const params = useModelParams();

  const senateMajority = composition.vicePresidentParty === "D" ? 50 : 51;
  const senateNeeded = senateMajority - composition.holdoverDem;
  const senateFinish = useMemo(() => finishLine(senate, params, senateNeeded), [senate, params, senateNeeded]);
  const senateLow = quantile(senateOutlook.demSeats, 0.1);
  const senateHigh = quantile(senateOutlook.demSeats, 0.9);

  const expectedHouseD = Math.round(houseOutlook.expectedDem);
  const expectedInd = Math.round(senateOutlook.expectedInd);

  const curves = useMemo<CurveSpec[]>(
    () => [
      { key: "house", label: "Democrats win the House", color: "var(--dem)", races: house, threshold: HOUSE_MAJORITY },
      { key: "senate", label: "Democrats win the Senate", color: "var(--r-safe-d)", races: senate, threshold: senateNeeded },
    ],
    [house, senate, senateNeeded],
  );

  const source = `Model at a national vote of ${fmtMargin(params.env)}: lean, national vote, incumbency and published ratings, with national and race-level error.`;

  return (
    <section aria-labelledby="results-title" className="mt-8">
      <h2 id="results-title" className="font-serif text-2xl font-semibold tracking-tight text-ink">
        Results in this scenario
      </h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-2">
        Chances are over the model&apos;s uncertainty, not a forecast. Click a column in either distribution to set the national
        vote where that result becomes the expected one.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0 space-y-4">
          <ChamberHeading title="House" detail={`${HOUSE_SEATS} seats, ${HOUSE_MAJORITY} for a majority`} />
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Democrats win the House"
              value={fmtProb(houseOutlook.pDemMajority)}
              detail={`Republicans ${fmtProb(1 - houseOutlook.pDemMajority)}`}
              accent="var(--dem)"
              href={href("/house")}
            />
            <Stat
              label="Expected seats"
              value={<span className="tabular-nums">D {expectedHouseD}</span>}
              detail={`Republicans ${HOUSE_SEATS - expectedHouseD}`}
              href={href("/house")}
            />
            <Stat
              label="80% range, Democrats"
              value={<span className="tabular-nums">{`${houseOutlook.low}–${houseOutlook.high}`}</span>}
              detail="Four in five outcomes land inside"
            />
            <Stat
              label="Finish line"
              value={houseOutlook.finishLine == null ? "—" : fmtMargin(houseOutlook.finishLine)}
              detail="National vote where Democrats are expected to win 218"
            />
          </div>
          <SeatDistributionChart
            title="House: how many seats Democrats could win"
            subtitle="Chance of every seat count. Columns at 218 or more are Democratic majorities."
            dist={houseOutlook.dist}
            majority={HOUSE_MAJORITY}
            seatLabel="Democratic seats"
            csvName="simulator-house-seat-distribution"
            source={source}
            onSelect={(k) => onExplore("house", k)}
          />
        </div>

        <div className="min-w-0 space-y-4">
          <ChamberHeading
            title="Senate"
            detail={`${senate.length} seats up, ${composition.holdoverDem} Democratic-caucus and ${composition.holdoverRep} Republican seats not up`}
          />
          <div className="grid grid-cols-2 gap-3">
            <Stat
              label="Democrats win the Senate"
              value={fmtProb(senateOutlook.pDemControl)}
              detail={`Republicans ${fmtProb(senateOutlook.pRepControl)}`}
              accent="var(--dem)"
              href={href("/senate")}
            />
            <Stat
              label="Expected seats"
              value={<span className="tabular-nums">D {Math.round(senateOutlook.expectedDem)}</span>}
              detail={`Republicans ${Math.round(senateOutlook.expectedRep)}${expectedInd > 0 ? `, others ${expectedInd}` : ""}`}
              href={href("/senate")}
            />
            <Stat
              label="80% range, Democratic caucus"
              value={<span className="tabular-nums">{`${senateLow}–${senateHigh}`}</span>}
              detail="Four in five outcomes land inside"
            />
            <Stat
              label="Finish line"
              value={senateFinish == null ? "—" : fmtMargin(senateFinish)}
              detail={`National vote where Democrats are expected to reach ${senateMajority}`}
            />
          </div>
          <SeatDistributionChart
            title="Senate: Democratic-caucus seats after the election"
            subtitle={`Seats not up plus seats won. ${senateMajority} or more is Democratic control${
              senateMajority === 51 ? " (a 50–50 tie goes to the Republican vice president)" : ""
            }.`}
            dist={senateOutlook.demSeats}
            majority={senateMajority}
            seatLabel="Democratic-caucus seats"
            csvName="simulator-senate-seat-distribution"
            source={source}
            onSelect={(k) => onExplore("senate", k)}
          />
        </div>
      </div>

      <div className="mt-6">
        <SensitivityChart
          title="Chance of control, by national vote"
          subtitle="Both chambers at every national vote from R+15 to D+15, with the other settings as set above. The vertical line is the current setting; click anywhere to move it."
          curves={curves}
          source="Model curves; Senate counts Democratic-caucus seats, including seats not up in 2026."
        />
      </div>
    </section>
  );
}

function ChamberHeading({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line pb-2">
      <h3 className="text-lg font-semibold text-ink">{title}</h3>
      <span className="text-xs text-ink-2">{detail}</span>
    </div>
  );
}
