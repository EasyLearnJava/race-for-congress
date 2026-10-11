"use client";

// The scenario every analytic view shares: the national environment and model settings.
// Lives in the URL (env, w, inc, sn, sr) so any drill-down link carries the same scenario.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";

import { DEFAULT_PARAMS, type ModelParams } from "@/lib/model/engine";
import { setSearchParams, useSearchString } from "@/lib/url-state";

export const SCENARIO_KEYS = { env: "env", expertWeight: "w", incumbency: "inc", sigmaNational: "sn", sigmaRace: "sr" } as const;

interface ScenarioContextValue {
  params: ModelParams;
  /** The environment the published ratings reflect (generic-ballot average). */
  baselineEnv: number;
  baselineLabel: string;
  isDefault: boolean;
  set: (patch: Partial<Omit<ModelParams, "baselineEnv">>) => void;
  reset: () => void;
  /** Append the current scenario to an internal link so drill-downs keep it. */
  href: (path: string) => string;
}

const ScenarioContext = createContext<ScenarioContextValue | null>(null);

const round = (n: number, digits = 1) => Number(n.toFixed(digits));

export function ScenarioProvider({
  baselineEnv,
  baselineLabel,
  children,
}: {
  baselineEnv: number;
  baselineLabel: string;
  children: ReactNode;
}) {
  const query = useSearchString();

  const params = useMemo<ModelParams>(() => {
    const search = new URLSearchParams(query);
    const read = (key: string, fallback: number, min: number, max: number) => {
      const raw = search.get(key);
      const n = raw == null ? NaN : Number(raw);
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
    };
    return {
      env: read(SCENARIO_KEYS.env, baselineEnv, -25, 25),
      baselineEnv,
      expertWeight: read(SCENARIO_KEYS.expertWeight, DEFAULT_PARAMS.expertWeight, 0, 1),
      incumbency: read(SCENARIO_KEYS.incumbency, DEFAULT_PARAMS.incumbency, 0, 10),
      sigmaNational: read(SCENARIO_KEYS.sigmaNational, DEFAULT_PARAMS.sigmaNational, 0, 10),
      sigmaRace: read(SCENARIO_KEYS.sigmaRace, DEFAULT_PARAMS.sigmaRace, 0, 15),
    };
  }, [query, baselineEnv]);

  const set = useCallback((patch: Partial<Omit<ModelParams, "baselineEnv">>) => {
    const updates: Record<string, string | null> = {};
    for (const [field, value] of Object.entries(patch)) {
      const key = SCENARIO_KEYS[field as keyof typeof SCENARIO_KEYS];
      if (key && typeof value === "number") updates[key] = String(round(value, field === "expertWeight" ? 2 : 1));
    }
    setSearchParams(updates);
  }, []);

  const reset = useCallback(() => {
    setSearchParams(Object.fromEntries(Object.values(SCENARIO_KEYS).map((k) => [k, null])));
  }, []);

  const href = useCallback(
    (path: string) => {
      const search = new URLSearchParams(query);
      const scenario = new URLSearchParams();
      for (const key of Object.values(SCENARIO_KEYS)) {
        const v = search.get(key);
        if (v != null) scenario.set(key, v);
      }
      const extra = scenario.toString();
      if (!extra) return path;
      return `${path}${path.includes("?") ? "&" : "?"}${extra}`;
    },
    [query],
  );

  const isDefault = useMemo(() => {
    const search = new URLSearchParams(query);
    return Object.values(SCENARIO_KEYS).every((k) => search.get(k) == null);
  }, [query]);

  const value = useMemo(
    () => ({ params, baselineEnv, baselineLabel, isDefault, set, reset, href }),
    [params, baselineEnv, baselineLabel, isDefault, set, reset, href],
  );
  return <ScenarioContext.Provider value={value}>{children}</ScenarioContext.Provider>;
}

export function useScenario(): ScenarioContextValue {
  const ctx = useContext(ScenarioContext);
  if (!ctx) throw new Error("useScenario must be used inside <ScenarioProvider>");
  return ctx;
}
