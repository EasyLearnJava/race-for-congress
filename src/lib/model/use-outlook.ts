"use client";

// Client hooks that run the forecast engine for the shared scenario. useDeferredValue keeps
// the slider responsive: React renders the new settings when the engine has caught up.
import { useDeferredValue, useMemo } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { HOUSE_MAJORITY } from "@/lib/data/states";
import {
  houseOutlook,
  projectRaces,
  senateOutlook,
  type ModelParams,
  type ModelRace,
  type SenateComposition,
} from "./engine";

export function useModelParams(): ModelParams {
  const { params } = useScenario();
  return useDeferredValue(params);
}

export function useHouseOutlook(races: ModelRace[], majority = HOUSE_MAJORITY) {
  const params = useModelParams();
  return useMemo(() => houseOutlook(races, params, majority), [races, params, majority]);
}

export function useSenateOutlook(races: ModelRace[], composition: SenateComposition) {
  const params = useModelParams();
  return useMemo(() => senateOutlook(races, params, composition), [races, params, composition]);
}

/** Projections only (no seat distribution): cheap, for tables of a few races. */
export function useProjections(races: ModelRace[]) {
  const params = useModelParams();
  return useMemo(() => {
    const list = projectRaces(races, params);
    return new Map(list.map((p) => [p.id, p]));
  }, [races, params]);
}
