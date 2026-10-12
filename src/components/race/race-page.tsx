"use client";

// The race page shared by /house/[id] and /senate/[st]. The route's Server Component builds
// a RaceData slice (load.ts); everything here follows the shared scenario in the URL.
import { useEffect } from "react";

import { track, takeNavigationSource } from "@/lib/analytics";
import { useProjections } from "@/lib/model/use-outlook";
import { fmtDate, fmtMargin } from "@/lib/format";
import { CandidatesCard } from "./candidates-card";
import { ForecastersCard } from "./forecasters-card";
import { HistorySection } from "./history-section";
import { MoneySection } from "./money-card";
import { RaceHeader } from "./race-header";
import { RaceKpis } from "./race-kpis";
import { HouseRacesTable, SenateLinkCard, SimilarSeats, StateMapCard } from "./state-context";
import type { RaceData } from "./types";
import { useRaceModel } from "./use-race-model";
import { WhatItTakes } from "./what-it-takes";

export function RacePage({ data }: { data: RaceData }) {
  const { race } = data;
  const { params, projection, flipPoint, curve } = useRaceModel(race);
  const stateProjections = useProjections(data.stateHouse);

  useEffect(() => {
    track("race_opened", { race: race.id, chamber: data.chamber, from: takeNavigationSource() });
  }, [race.id, data.chamber]);

  return (
    <div className="pb-8">
      <RaceHeader race={race} chamber={data.chamber} />

      <RaceKpis race={race} projection={projection} flipPoint={flipPoint} env={params.env} national2024={data.national2024} />
      <p className="mt-2 text-xs text-muted">
        Simulation, not a forecast: model numbers are for a national vote of {fmtMargin(params.env)} and update with the scenario bar. Data as of{" "}
        {fmtDate(data.generated)}.
      </p>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <CandidatesCard race={race} />
        <WhatItTakes
          className="min-w-0 lg:col-span-2"
          raceId={race.id}
          curve={curve}
          projection={projection}
          flipPoint={flipPoint}
          env={params.env}
        />
      </div>

      <section aria-label="Forecaster ratings" className="mt-8">
        <ForecastersCard race={race} ratings={data.ratings} forecasterCount={data.forecasterCount} chamber={data.chamber} />
      </section>

      <MoneySection raceId={race.id} money={data.money} outside={data.outside} spenders={data.spenders} />

      <section aria-label="Context" className="mt-8">
        {data.chamber === "house" ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <StateMapCard
              className="min-w-0 lg:col-span-2"
              stateName={race.stateName}
              postal={race.state}
              map={data.stateMap}
              races={data.stateHouse}
              projections={stateProjections}
              selectedId={race.id}
            />
            <div className="min-w-0 space-y-6">
              <SimilarSeats race={data.race} similar={data.similar} />
              {data.senateRace && <SenateLinkCard senate={data.senateRace} />}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <StateMapCard
              className="min-w-0 lg:col-span-2"
              stateName={race.stateName}
              postal={race.state}
              map={data.stateMap}
              races={data.stateHouse}
              projections={stateProjections}
            />
            <div className="min-w-0 lg:col-span-3">
              <HouseRacesTable stateName={race.stateName} races={data.stateHouse} projections={stateProjections} />
            </div>
          </div>
        )}
      </section>

      {data.chamber === "house" && <HistorySection raceId={race.id} history={data.history} />}
    </div>
  );
}
