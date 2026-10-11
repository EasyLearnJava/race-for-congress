"use client";

// The scenario lab: big controls for the shared scenario, House and Senate results side by
// side, the seats that decide the House, the change from the polling average, and a share link.
// Every number recomputes from the scenario in the URL, so a copied link reproduces the page.
import Link from "next/link";
import { useState } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { PageHeader } from "@/components/ui/primitives";
import { fmtDate, fmtMargin, fmtProb } from "@/lib/format";
import { envForSeats } from "@/lib/model/engine";
import { useHouseOutlook, useModelParams, useSenateOutlook } from "@/lib/model/use-outlook";
import { ChangeFromDefault } from "./change-from-default";
import { Controls } from "./controls";
import { DecidingSeats } from "./deciding-seats";
import { PollingContext } from "./polling-context";
import { Results } from "./results";
import { CopyLinkButton, ShareCard } from "./share";
import type { Composition, Environment, PollRow, SimRace } from "./types";

interface Explored {
  chamber: "house" | "senate";
  seats: number;
  env: number;
}

/** The scenario provider accepts national votes from R+25 to D+25. */
const clampEnv = (env: number) => Math.min(25, Math.max(-25, Math.round(env * 2) / 2));

export function Simulator({
  house,
  senate,
  composition,
  compositionDerived,
  environment,
  polls,
  generated,
  ratingSources,
}: {
  house: SimRace[];
  senate: SimRace[];
  composition: Composition;
  compositionDerived: boolean;
  environment: Environment | null;
  polls: PollRow[];
  generated: string;
  ratingSources: string[];
}) {
  const { params, href, set, reset } = useScenario();
  const houseOutlook = useHouseOutlook(house);
  const senateOutlook = useSenateOutlook(senate, composition);
  // The deferred settings the outlooks were computed with, so the summary never mixes two scenarios.
  const shown = useModelParams();
  const [explored, setExplored] = useState<Explored | null>(null);

  const explore = (chamber: "house" | "senate", seats: number) => {
    const target = chamber === "house" ? seats : seats - composition.holdoverDem;
    const env = clampEnv(envForSeats(chamber === "house" ? house : senate, params, target));
    set({ env });
    setExplored({ chamber, seats, env });
  };
  // The banner describes the world the user picked only while the national vote is still there.
  const exploring = explored && Math.abs(params.env - explored.env) < 0.01 ? explored : null;

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "Scenario lab" }]}
        eyebrow="Scenario lab · Simulation, not a forecast"
        title="What happens if…"
        description={
          <>
            Set the national vote and the model&apos;s assumptions, then watch both chambers respond. Every chart below recomputes,
            and every page you open from here keeps this scenario. Data updated {fmtDate(generated)}.{" "}
            <Link href={href("/methodology")} className="underline underline-offset-2">
              How the model works
            </Link>
          </>
        }
        actions={<CopyLinkButton />}
      />

      <p className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm leading-6 text-ink" aria-live="polite">
        At a national vote of <strong className="font-semibold tabular-nums">{fmtMargin(shown.env)}</strong>, Democrats have a{" "}
        <strong className="font-semibold tabular-nums">{fmtProb(houseOutlook.pDemMajority)}</strong> chance of a House majority and a{" "}
        <strong className="font-semibold tabular-nums">{fmtProb(senateOutlook.pDemControl)}</strong> chance of Senate control;
        Republicans <strong className="font-semibold tabular-nums">{fmtProb(1 - houseOutlook.pDemMajority)}</strong> and{" "}
        <strong className="font-semibold tabular-nums">{fmtProb(senateOutlook.pRepControl)}</strong>.
      </p>

      <Controls house={house} environment={environment} />

      {exploring && (
        <div
          role="status"
          className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ink/30 bg-surface px-4 py-3 text-sm"
        >
          <span>
            Exploring the world where Democrats win{" "}
            <strong className="font-semibold tabular-nums">
              {exploring.seats} {exploring.chamber === "house" ? "House seats" : "Senate seats (caucus)"}
            </strong>
            : that is the expected result at a national vote of{" "}
            <strong className="font-semibold tabular-nums">{fmtMargin(exploring.env)}</strong>
            {Math.abs(exploring.env) >= 25 ? ", the edge of the range the model allows" : ""}.
          </span>
          <button
            type="button"
            onClick={() => {
              reset();
              setExplored(null);
            }}
            className="rounded-lg border border-line px-3 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Back to defaults
          </button>
        </div>
      )}

      <Results
        house={house}
        senate={senate}
        composition={composition}
        houseOutlook={houseOutlook}
        senateOutlook={senateOutlook}
        onExplore={explore}
      />

      <DecidingSeats house={house} projections={houseOutlook.projections} />

      <ChangeFromDefault
        house={house}
        senate={senate}
        composition={composition}
        houseNow={houseOutlook}
        senateNow={senateOutlook}
        hasPollingAverage={environment != null}
      />

      <PollingContext polls={polls} environment={environment} />

      <ShareCard />

      <p className="mt-6 text-[11px] leading-4 text-muted">
        Presidential results by district: The Downballot. Ratings: {ratingSources.length ? ratingSources.join(", ") : "none loaded"}, via
        Wikipedia. 2018 and 2010 presets are the national House popular-vote margins of those
        years.
        {compositionDerived
          ? " Senate seats not up in 2026 are derived from the current 53–47 chamber minus the seats each caucus defends."
          : ""}
      </p>
    </div>
  );
}
