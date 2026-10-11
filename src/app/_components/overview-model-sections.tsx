"use client";

import { useMemo } from "react";

import { SeatDistributionChart } from "@/components/model/seat-distribution";
import { SensitivityChart, type CurveSpec } from "@/components/model/sensitivity";
import { useScenario } from "@/components/scenario/scenario";
import { HOUSE_MAJORITY } from "@/lib/data/states";
import type { HouseRace, SenateRace } from "@/lib/data/types";
import { fmtMargin } from "@/lib/format";
import { envForSeats, type ChamberOutlook, type SenateComposition, type SenateOutlook } from "@/lib/model/engine";

export function ModelSections({
  house,
  senate,
  composition,
  houseOutlook,
}: {
  house: HouseRace[];
  senate: SenateRace[];
  composition: SenateComposition;
  houseOutlook: ChamberOutlook;
  senateOutlook: SenateOutlook;
}) {
  const { params, set } = useScenario();
  const curves = useMemo<CurveSpec[]>(
    () => [
      { key: "house", label: "Democrats win the House", color: "var(--dem)", races: house, threshold: HOUSE_MAJORITY },
      {
        key: "senate",
        label: "Democrats win the Senate",
        color: "var(--r-safe-d)",
        races: senate,
        threshold: (composition.vicePresidentParty === "D" ? 50 : 51) - composition.holdoverDem,
      },
    ],
    [house, senate, composition],
  );

  return (
    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
      <SeatDistributionChart
        title="How many seats Democrats could win"
        subtitle={`Chance of every possible House result at a national vote of ${fmtMargin(params.env)}. Click a column to see the national vote where that result is the expected one.`}
        dist={houseOutlook.dist}
        majority={HOUSE_MAJORITY}
        seatLabel="Democratic seats"
        csvName="house-seat-distribution"
        source="Model: lean, national vote, incumbency and published ratings, with national and race-level error."
        onSelect={(k) => set({ env: Math.round(envForSeats(house, params, k) * 2) / 2 })}
      />
      <SensitivityChart
        title="Chance of control, by national vote"
        subtitle="The vertical line is your current setting. Click anywhere to move the national vote there."
        curves={curves}
        source="Model curves at every national-vote setting from R+15 to D+15."
      />
    </div>
  );
}
