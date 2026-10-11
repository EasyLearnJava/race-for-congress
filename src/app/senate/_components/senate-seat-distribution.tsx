"use client";

// The chance of every Democratic-caucus seat count, with the tie line at 50 and the control
// line at 51 (or 50 when the vice president is a Democrat). Built on the kit Histogram because
// the shared SeatDistributionChart draws a single majority line and the Senate needs both.
import { useMemo } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { Histogram, type HistogramBin, type HistogramMarker } from "@/components/charts/histogram";
import { useScenario } from "@/components/scenario/scenario";
import type { SenateRace } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import { envForSeats, quantile, type SenateOutlook } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import { demThreshold, type SenateComp } from "./senate-shared";

const HEIGHT = 250;

interface SeatBin extends HistogramBin {
  seats: number;
  atLeast: number;
}

export function SenateSeatDistribution({
  senate,
  composition,
  outlook,
  source,
}: {
  senate: SenateRace[];
  composition: SenateComp;
  outlook: SenateOutlook;
  source: string;
}) {
  const { set } = useScenario();
  const params = useModelParams();
  const threshold = demThreshold(composition);
  const tieParty = composition.vicePresidentParty === "D" ? "Democrats" : "Republicans";

  const bins = useMemo<SeatBin[]>(() => {
    const pmf = outlook.demSeats.pmf;
    const out: SeatBin[] = [];
    let tail = 1;
    for (let k = 0; k < pmf.length; k++) {
      if (pmf[k] >= 0.0005) out.push({ x0: k, x1: k + 1, value: pmf[k], seats: k, atLeast: Math.max(0, tail) });
      tail -= pmf[k];
    }
    return out;
  }, [outlook]);

  const markers = useMemo<HistogramMarker[]>(
    () =>
      threshold === 51
        ? [
            { x: 50, label: "50: tie" },
            { x: 51, label: "51 for control", strong: true },
          ]
        : [{ x: 50, label: "50 for control", strong: true }],
    [threshold],
  );

  const median = quantile(outlook.demSeats, 0.5);
  const maxWins = senate.filter((r) => r.special !== "independent_vs_R").length;

  return (
    <ChartFrame
      title="How many seats the Democratic caucus could hold"
      subtitle={`Chance of every result at a national vote of ${fmtMargin(params.env)}, counting the ${composition.holdoverDem} Democratic-caucus seats not up. A 50–50 tie goes to ${tieParty} through the vice president. Click a column to set the national vote where that result is the expected one.`}
      height={HEIGHT}
      csvName="senate-seat-distribution"
      source={source}
      legend={
        <>
          <LegendItem color="var(--dem)" label={`Democratic control (${threshold}+)`} />
          <LegendItem color="var(--rep)" label={`No Democratic control (${threshold - 1} or fewer)`} />
        </>
      }
      table={{
        columns: [
          { key: "seats", label: "Democratic-caucus seats", align: "right" },
          { key: "value", label: "Chance of exactly this many", align: "right", format: (v) => fmtProb(Number(v)) },
          { key: "atLeast", label: "Chance of at least this many", align: "right", format: (v) => fmtProb(Number(v)) },
        ],
        rows: bins.map((b) => ({ seats: b.seats, value: b.value, atLeast: b.atLeast })),
      }}
    >
      {(width) => (
        <Histogram<SeatBin>
          width={width}
          height={HEIGHT}
          bins={bins}
          discrete
          markers={markers}
          colorFor={(b) => (b.seats >= threshold ? "var(--dem)" : "var(--rep)")}
          xLabel="Democratic-caucus seats"
          yLabel="Chance"
          yFormat={(v) => `${Math.round(v * 100)}%`}
          valueFormat={fmtProb}
          binLabel={(b) => `${b.seats} Democratic-caucus seats (at least this many: ${fmtProb(b.atLeast)})`}
          onBinClick={(b) => {
            const wins = Math.max(0, Math.min(maxWins, b.seats - composition.holdoverDem));
            set({ env: Math.round(envForSeats(senate, params, wins) * 2) / 2 });
          }}
          summary={`Distribution of Democratic-caucus Senate seats. Median ${median}; ${threshold} needed for control; chance of Democratic control ${fmtProb(outlook.pDemControl)}.`}
        />
      )}
    </ChartFrame>
  );
}
