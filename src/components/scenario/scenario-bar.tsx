"use client";

// The control every dashboard shares: the national environment (and, behind "Model", the
// model's settings). Sticky under the header on analytic pages; state lives in the URL.
import { usePathname } from "next/navigation";
import { useState } from "react";

import { DEFAULT_PARAMS } from "@/lib/model/engine";
import { fmtMargin } from "@/lib/format";
import { useScenario } from "./scenario";

const SCENARIO_PATHS = ["/", "/house", "/senate", "/states", "/simulator", "/redistricting"];

const PRESETS = [
  { label: "2018 blue wave", env: 8.6 },
  { label: "Even", env: 0 },
  { label: "2010 red wave", env: -6.8 },
];

export function ScenarioBar() {
  const pathname = usePathname();
  const { params, baselineEnv, baselineLabel, isDefault, set, reset } = useScenario();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const show = SCENARIO_PATHS.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(`${p}/`)));
  if (!show) return null;

  const env = params.env;
  const basePct = ((baselineEnv + 15) / 30) * 100;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="sticky top-14 z-20 border-b border-line bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/85">
      <div className="mx-auto w-full max-w-7xl px-4 py-2.5 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex w-full min-w-0 items-center gap-2 sm:gap-3 md:w-auto md:flex-1">
            <label htmlFor="env" className="shrink-0 text-xs font-medium text-ink-2">
              <span className="sm:hidden">Vote</span>
              <span className="hidden sm:inline">National vote</span>
            </label>
            <span className="hidden shrink-0 text-[11px] font-semibold text-rep tabular-nums sm:inline" aria-hidden>
              R+15
            </span>
            <div className="relative min-w-0 flex-1">
              <input
                id="env"
                type="range"
                min={-15}
                max={15}
                step={0.5}
                value={env}
                onChange={(e) => set({ env: Number(e.target.value) })}
                aria-valuetext={env === 0 ? "Even national vote" : `${env > 0 ? "Democrats" : "Republicans"} ahead by ${Math.abs(env)} points`}
                className="relative z-10 w-full accent-[var(--ink)]"
              />
              {/* Polling-average marker */}
              <span
                aria-hidden
                className="pointer-events-none absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-2"
                style={{ left: `${basePct}%` }}
              />
            </div>
            <span className="hidden shrink-0 text-[11px] font-semibold text-dem tabular-nums sm:inline" aria-hidden>
              D+15
            </span>
            <output htmlFor="env" className="w-14 shrink-0 text-right text-base font-semibold tabular-nums sm:w-16">
              {fmtMargin(env)}
            </output>
          </div>
          <div className="flex w-full flex-wrap items-center gap-1.5 md:w-auto">
            <button
              type="button"
              onClick={() => set({ env: baselineEnv })}
              className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                env === baselineEnv ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:bg-surface-2"
              }`}
              title={baselineLabel}
            >
              Polling avg {fmtMargin(baselineEnv)}
            </button>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => set({ env: p.env })}
                className={`hidden rounded-full border px-2.5 py-1 text-xs font-medium sm:inline-flex ${
                  env === p.env ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:bg-surface-2"
                }`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setOpen(!open)}
              aria-expanded={open}
              aria-controls="model-settings"
              className="rounded-full border border-line px-2.5 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2"
            >
              Model {open ? "▴" : "▾"}
            </button>
            {!isDefault && (
              <button type="button" onClick={reset} className="rounded-full px-2 py-1 text-xs font-medium text-ink-2 hover:text-ink">
                Reset
              </button>
            )}
            <button type="button" onClick={copy} className="rounded-full px-2 py-1 text-xs font-medium text-ink-2 hover:text-ink">
              {copied ? "Link copied" : "Copy link"}
            </button>
          </div>
        </div>
        {open && (
          <div id="model-settings" className="mt-3 grid grid-cols-1 gap-4 border-t border-line pt-3 sm:grid-cols-2 lg:grid-cols-4">
            <Setting
              id="w"
              label="Weight on expert ratings"
              value={params.expertWeight}
              min={0}
              max={1}
              step={0.05}
              display={`${Math.round(params.expertWeight * 100)}%`}
              help="0% uses only district lean, the national vote and incumbency. 100% uses only the median published rating."
              onChange={(v) => set({ expertWeight: v })}
              defaultValue={DEFAULT_PARAMS.expertWeight}
            />
            <Setting
              id="inc"
              label="Incumbency advantage"
              value={params.incumbency}
              min={0}
              max={6}
              step={0.5}
              display={`${params.incumbency.toFixed(1)} pts`}
              help="Extra margin for an incumbent running again."
              onChange={(v) => set({ incumbency: v })}
              defaultValue={DEFAULT_PARAMS.incumbency}
            />
            <Setting
              id="sn"
              label="National polling error"
              value={params.sigmaNational}
              min={0}
              max={8}
              step={0.5}
              display={`±${params.sigmaNational.toFixed(1)} pts`}
              help="How far the national vote could land from the setting above. Shared by every race."
              onChange={(v) => set({ sigmaNational: v })}
              defaultValue={DEFAULT_PARAMS.sigmaNational}
            />
            <Setting
              id="sr"
              label="Race-level error"
              value={params.sigmaRace}
              min={0}
              max={12}
              step={0.5}
              display={`±${params.sigmaRace.toFixed(1)} pts`}
              help="Candidate quality, local issues and other surprises in each race, independent of the others."
              onChange={(v) => set({ sigmaRace: v })}
              defaultValue={DEFAULT_PARAMS.sigmaRace}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Setting({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  help,
  onChange,
  defaultValue,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  help: string;
  onChange: (v: number) => void;
  defaultValue: number;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <label htmlFor={`setting-${id}`} className="text-xs font-medium text-ink">
          {label}
        </label>
        <span className="text-xs font-semibold tabular-nums">
          {display}
          {value !== defaultValue && (
            <button type="button" onClick={() => onChange(defaultValue)} className="ml-2 font-normal text-ink-2 underline">
              default
            </button>
          )}
        </span>
      </div>
      <input
        id={`setting-${id}`}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-full accent-[var(--ink)]"
      />
      <p className="mt-0.5 text-[11px] leading-4 text-ink-2">{help}</p>
    </div>
  );
}
