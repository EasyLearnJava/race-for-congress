"use client";

// The model for one race in the shared scenario: its projection now, its flip point and the
// curve of its chance across national environments. All math comes from the engine.
import { useMemo } from "react";

import { expectedMargin, projectRace, winProbability, type ModelRace, type RaceProjection } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";

export interface CurvePoint {
  env: number;
  p: number;
  margin: number;
}

export const CURVE_MIN = -15;
export const CURVE_MAX = 15;
const CURVE_STEP = 0.5;

export function useRaceModel(race: ModelRace) {
  const params = useModelParams();
  return useMemo(() => {
    const projection: RaceProjection = projectRace(race, params);
    // Expected margins move one-for-one with the national vote, so the race crosses zero at env - margin.
    const flipPoint = projection.forced ? null : params.env - projection.margin;
    const steps = Math.round((CURVE_MAX - CURVE_MIN) / CURVE_STEP);
    const curve: CurvePoint[] = [];
    for (let i = 0; i <= steps; i++) {
      const env = CURVE_MIN + i * CURVE_STEP;
      const margin = expectedMargin(race, { ...params, env });
      curve.push({ env, p: winProbability(margin, params), margin });
    }
    return { params, projection, flipPoint, curve };
  }, [race, params]);
}
