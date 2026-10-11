"use client";

// The big, explained controls. They read and write the same URL params as the sticky scenario
// bar (through useScenario), so the two always agree and every page follows along.
import { useMemo, type ReactNode } from "react";

import { SCENARIO_KEYS, useScenario } from "@/components/scenario/scenario";
import { Card } from "@/components/ui/primitives";
import { fmtMargin, fmtProb } from "@/lib/format";
import { setSearchParams } from "@/lib/url-state";
import { DEFAULT_PARAMS, totalSigma, winProbability, type ModelParams } from "@/lib/model/engine";
import type { Environment, SimRace } from "./types";

type Patch = Partial<Omit<ModelParams, "baselineEnv">>;

interface Preset {
  key: string;
  label: string;
  help: string;
  patch: Patch;
  active: (p: ModelParams) => boolean;
}

const same = (a: number, b: number) => Math.abs(a - b) < 1e-6;
/** z for an 80% two-sided interval. */
const Z80 = 1.2816;

export function Controls({ house, environment }: { house: SimRace[]; environment: Environment | null }) {
  const { params, baselineEnv, isDefault, set, reset } = useScenario();

  const runningIncumbents = useMemo(() => house.filter((r) => r.incumbentRunning).length, [house]);
  const unrated = useMemo(() => house.filter((r) => r.ratingCount === 0).length, [house]);

  const envPresets: Preset[] = [
    {
      key: "poll",
      label: environment ? `Polling average ${fmtMargin(baselineEnv)}` : "Polling average (not loaded)",
      help: environment
        ? `Average of ${environment.nSources} generic-ballot polling averages`
        : "No polling average is loaded yet, so this uses an even national vote",
      patch: { env: baselineEnv },
      active: (p) => same(p.env, baselineEnv),
    },
    { key: "even", label: "Even", help: "Both parties tie the national vote", patch: { env: 0 }, active: (p) => same(p.env, 0) },
    {
      key: "2018",
      label: "2018 wave D+8.6",
      help: "The Democratic margin in the 2018 national House vote",
      patch: { env: 8.6 },
      active: (p) => same(p.env, 8.6),
    },
    {
      key: "2010",
      label: "2010 wave R+6.8",
      help: "The Republican margin in the 2010 national House vote",
      patch: { env: -6.8 },
      active: (p) => same(p.env, -6.8),
    },
  ];
  const modelPresets: Preset[] = [
    {
      key: "fund",
      label: "Fundamentals only",
      help: "Ignore the published ratings: lean, national vote and incumbency only",
      patch: { expertWeight: 0 },
      active: (p) => same(p.expertWeight, 0),
    },
    {
      key: "blend",
      label: `Default blend ${Math.round(DEFAULT_PARAMS.expertWeight * 100)}%`,
      help: "The model default: half ratings, half fundamentals",
      patch: { expertWeight: DEFAULT_PARAMS.expertWeight },
      active: (p) => same(p.expertWeight, DEFAULT_PARAMS.expertWeight),
    },
    {
      key: "fore",
      label: "Forecasters only",
      help: "Use only the median published rating where one exists",
      patch: { expertWeight: 1 },
      active: (p) => same(p.expertWeight, 1),
    },
  ];

  // The polling average is the default: clearing the param gives the exact (unrounded) value.
  const toPollingAverage = () => setSearchParams({ [SCENARIO_KEYS.env]: null });
  const pick = (p: Preset) => (p.key === "poll" ? toPollingAverage() : set(p.patch));

  const w = Math.round(params.expertWeight * 100);
  const sn80 = Z80 * params.sigmaNational;
  const sigma = totalSigma(params);

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-ink">Set the scenario</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-ink-2">
            Five settings drive every number on the site. They are the same values as the bar at the top of the page, so the
            two always agree.
          </p>
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Reset all to defaults
          </button>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <PresetGroup label="National vote presets" presets={envPresets} params={params} onPick={pick} />
        <PresetGroup label="Model presets" presets={modelPresets} params={params} onPick={pick} />
      </div>

      <div className="mt-5 border-t border-line pt-5">
        <BigSlider
          id="sim-env"
          label="National vote"
          value={params.env}
          min={-15}
          max={15}
          step={0.5}
          display={fmtMargin(params.env)}
          valueText={
            params.env === 0 ? "Even national vote" : `${params.env > 0 ? "Democrats" : "Republicans"} ahead by ${Math.abs(params.env)} points`
          }
          defaultValue={baselineEnv}
          defaultLabel={environment ? "polling average" : "default"}
          ends={["R+15", "D+15"]}
          endColors={["var(--rep)", "var(--dem)"]}
          large
          onChange={(v) => set({ env: v })}
          onReset={toPollingAverage}
          help={
            <>
              The Democratic-minus-Republican margin of the national House vote. Every race&apos;s expected margin moves one point
              for each point you move this. The tick marks the{" "}
              {environment
                ? `polling average (${fmtMargin(baselineEnv)})`
                : "default, an even vote, because no polling average is loaded yet"}
              .
            </>
          }
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-x-8 gap-y-6 border-t border-line pt-5 sm:grid-cols-2">
        <BigSlider
          id="sim-w"
          label="Weight on forecaster ratings"
          value={params.expertWeight}
          min={0}
          max={1}
          step={0.05}
          display={`${w}%`}
          valueText={`${w} percent ratings, ${100 - w} percent fundamentals`}
          defaultValue={DEFAULT_PARAMS.expertWeight}
          ends={["Fundamentals", "Ratings"]}
          onChange={(v) => set({ expertWeight: v })}
          help={
            <>
              Expected margin = <strong className="font-semibold text-ink">{w}%</strong> the median published rating +{" "}
              <strong className="font-semibold text-ink">{100 - w}%</strong> fundamentals (lean, national vote, incumbency). The{" "}
              {unrated} House seats no forecaster rates always use fundamentals.
            </>
          }
        />
        <BigSlider
          id="sim-inc"
          label="Incumbency advantage"
          value={params.incumbency}
          min={0}
          max={6}
          step={0.5}
          display={`${params.incumbency.toFixed(1)} pts`}
          valueText={`${params.incumbency} points`}
          defaultValue={DEFAULT_PARAMS.incumbency}
          ends={["0", "6 pts"]}
          onChange={(v) => set({ incumbency: v })}
          help={
            <>
              Extra margin for an incumbent running again, added for their party. {runningIncumbents} House incumbents are on the
              ballot; open seats get none.
            </>
          }
        />
        <BigSlider
          id="sim-sn"
          label="National error"
          value={params.sigmaNational}
          min={0}
          max={8}
          step={0.5}
          display={`±${params.sigmaNational.toFixed(1)} pts`}
          valueText={`plus or minus ${params.sigmaNational} points`}
          defaultValue={DEFAULT_PARAMS.sigmaNational}
          ends={["None", "±8"]}
          onChange={(v) => set({ sigmaNational: v })}
          help={
            params.sigmaNational > 0 ? (
              <>
                Polls can miss together, moving every race the same way. At this setting the national vote lands between{" "}
                {fmtMargin(params.env - sn80)} and {fmtMargin(params.env + sn80)} four times in five.
              </>
            ) : (
              <>No shared error: every race is treated as independent of the others, which narrows the range of seat counts.</>
            )
          }
        />
        <BigSlider
          id="sim-sr"
          label="Race error"
          value={params.sigmaRace}
          min={0}
          max={12}
          step={0.5}
          display={`±${params.sigmaRace.toFixed(1)} pts`}
          valueText={`plus or minus ${params.sigmaRace} points`}
          defaultValue={DEFAULT_PARAMS.sigmaRace}
          ends={["None", "±12"]}
          onChange={(v) => set({ sigmaRace: v })}
          help={
            <>
              Candidates, local issues and other surprises in each race. With the national error (±{sigma.toFixed(1)} pts in all), a
              race expected at D+5 or R+5 goes to the favored side {fmtProb(winProbability(5, params))} of the time.
            </>
          }
        />
      </div>
    </Card>
  );
}

function PresetGroup({
  label,
  presets,
  params,
  onPick,
}: {
  label: string;
  presets: Preset[];
  params: ModelParams;
  onPick: (preset: Preset) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="mb-1.5 text-xs font-medium text-ink-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const on = p.active(params);
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              title={p.help}
              onClick={() => onPick(p)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
                on ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:bg-surface-2 hover:text-ink"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function BigSlider({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  valueText,
  defaultValue,
  defaultLabel = "default",
  ends,
  endColors,
  large = false,
  help,
  onChange,
  onReset,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  valueText: string;
  defaultValue: number;
  defaultLabel?: string;
  ends: [string, string];
  endColors?: [string, string];
  large?: boolean;
  help: ReactNode;
  onChange: (v: number) => void;
  /** Restores the default (defaults to onChange(defaultValue)). */
  onReset?: () => void;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const pct = ((clamp(defaultValue) - min) / (max - min)) * 100;
  const atDefault = same(value, defaultValue);
  const nudge = (dir: 1 | -1) => onChange(clamp(Number((value + dir * step).toFixed(2))));

  return (
    <div>
      <div className="flex min-h-9 flex-wrap items-end justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-semibold text-ink">
          {label}
        </label>
        <div className="ml-auto flex items-baseline gap-2">
          {!atDefault && (
            <button
              type="button"
              onClick={() => (onReset ? onReset() : onChange(defaultValue))}
              className="text-xs whitespace-nowrap text-ink-2 underline underline-offset-2 hover:text-ink"
            >
              Back to {defaultLabel}
            </button>
          )}
          <output
            htmlFor={id}
            className={`font-semibold tracking-tight whitespace-nowrap text-ink tabular-nums ${large ? "text-3xl" : "text-xl"}`}
          >
            {display}
          </output>
        </div>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StepButton label={`Decrease ${label.toLowerCase()}`} onClick={() => nudge(-1)} disabled={value <= min}>
          −
        </StepButton>
        <div className="relative min-w-0 flex-1">
          <input
            id={id}
            type="range"
            min={min}
            max={max}
            step={step}
            value={clamp(value)}
            onChange={(e) => onChange(Number(e.target.value))}
            aria-valuetext={valueText}
            aria-describedby={`${id}-help`}
            className="relative z-10 block w-full accent-[var(--ink)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-2"
            style={{ left: `${pct}%` }}
          />
        </div>
        <StepButton label={`Increase ${label.toLowerCase()}`} onClick={() => nudge(1)} disabled={value >= max}>
          +
        </StepButton>
      </div>
      <div className="mt-1 flex justify-between px-9 text-[11px] font-semibold tabular-nums" aria-hidden>
        <span style={{ color: endColors?.[0] ?? "var(--muted)" }}>{ends[0]}</span>
        <span style={{ color: endColors?.[1] ?? "var(--muted)" }}>{ends[1]}</span>
      </div>
      <p id={`${id}-help`} className="mt-1.5 text-xs leading-5 text-ink-2">
        {help}
      </p>
    </div>
  );
}

function StepButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-base leading-none text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-40"
    >
      {children}
    </button>
  );
}
