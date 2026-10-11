"use client";

// The explorer's filter bar: search, states, ratings, held-by and three toggles, then a
// summary of what is active with one-click removal. Every control writes the URL.
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { STATES, STATE_BY_POSTAL } from "@/lib/data/states";
import { RATING_COLOR, RATING_ORDER } from "@/lib/ratings";
import {
  activeFilterCount,
  clearFilters,
  setFlag,
  setHeld,
  setIds,
  setQuery,
  setRatings,
  setStates,
  toggle,
  type Filters,
} from "./filters";

export function FilterBar({ filters, shown, total }: { filters: Filters; shown: number; total: number }) {
  const f = filters;
  const active = activeFilterCount(f);

  return (
    <section aria-label="Filters" className="rounded-xl border border-line bg-surface p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox value={f.q} />
        <StatePicker selected={f.states} />
        <Segmented
          label="Held by"
          value={f.held ?? "all"}
          options={[
            { value: "all", label: "Any holder" },
            { value: "D", label: "Held D", dot: "var(--dem)" },
            { value: "R", label: "Held R", dot: "var(--rep)" },
          ]}
          onChange={(v) => setHeld(v === "D" || v === "R" ? v : null)}
        />
        <Toggle pressed={f.open} onClick={() => setFlag("open", !f.open)}>
          Open seats
        </Toggle>
        <Toggle pressed={f.newLines} onClick={() => setFlag("new", !f.newLines)}>
          New lines
        </Toggle>
        <Toggle pressed={f.competitive} onClick={() => setFlag("competitive", !f.competitive)}>
          Competitive
        </Toggle>
      </div>

      <div role="group" aria-label="Consensus rating" className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs font-medium text-ink-2">Consensus rating</span>
        {RATING_ORDER.map((r) => {
          const on = f.ratings.includes(r);
          return (
            <button
              key={r}
              type="button"
              aria-pressed={on}
              onClick={() => setRatings(toggle(f.ratings, r))}
              className={`inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
                on ? "border-ink bg-surface-2 text-ink" : "border-line text-ink-2 hover:border-ink/40 hover:text-ink"
              }`}
            >
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: RATING_COLOR[r] }} />
              {r}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-xs" aria-live="polite">
        <span className="mr-1 text-ink-2">
          Showing <span className="font-semibold text-ink tabular-nums">{shown}</span> of{" "}
          <span className="tabular-nums">{total}</span> seats
        </span>
        {f.ids.length > 0 && (
          <Chip name="selected seats" onRemove={() => setIds([])} strong>
            {f.ids.length} selected {f.ids.length === 1 ? "seat" : "seats"}
          </Chip>
        )}
        {f.q.trim() && <Chip name="search" onRemove={() => setQuery("")}>Search: &ldquo;{f.q.trim()}&rdquo;</Chip>}
        {f.states.map((s) => (
          <Chip key={s} name={STATE_BY_POSTAL[s]?.name ?? s} onRemove={() => setStates(f.states.filter((x) => x !== s))}>
            {STATE_BY_POSTAL[s]?.name ?? s}
          </Chip>
        ))}
        {f.ratings.map((r) => (
          <Chip key={r} name={r} onRemove={() => setRatings(f.ratings.filter((x) => x !== r))} swatch={RATING_COLOR[r]}>
            {r}
          </Chip>
        ))}
        {f.held && <Chip name="held by" onRemove={() => setHeld(null)}>Held by {f.held === "D" ? "Democrats" : "Republicans"}</Chip>}
        {f.open && <Chip name="open seats" onRemove={() => setFlag("open", false)}>Open seats</Chip>}
        {f.newLines && <Chip name="new lines" onRemove={() => setFlag("new", false)}>New 2026 lines</Chip>}
        {f.competitive && <Chip name="competitive" onRemove={() => setFlag("competitive", false)}>Competitive (not Safe)</Chip>}
        {active > 0 ? (
          <button type="button" onClick={clearFilters} className="ml-1 font-semibold text-ink underline underline-offset-2">
            Clear all
          </button>
        ) : (
          <span className="text-muted">No filters. Drag across a chart to select seats.</span>
        )}
      </div>
    </section>
  );
}

function SearchBox({ value }: { value: string }) {
  return (
    <div className="relative w-full sm:w-64">
      <label htmlFor="explorer-q" className="sr-only">
        Search seats, states or candidates
      </label>
      <svg aria-hidden viewBox="0 0 16 16" className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted">
        <circle cx="7" cy="7" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10.5 10.5 14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <input
        id="explorer-q"
        type="search"
        value={value}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search PA-07, a state or a name"
        autoComplete="off"
        className="h-8 w-full rounded-lg border border-line bg-surface pr-2 pl-8 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
      />
    </div>
  );
}

function StatePicker({ selected }: { selected: string[] }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const [find, setFind] = useState("");
  const list = useMemo(() => {
    const t = find.trim().toLowerCase();
    return t ? STATES.filter((s) => s.name.toLowerCase().includes(t) || s.postal.toLowerCase() === t) : STATES;
  }, [find]);
  const sorted = useMemo(() => [...list].sort((a, b) => a.name.localeCompare(b.name)), [list]);

  // Close on Escape or a click outside, like any popover.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onDown = (e: PointerEvent) => {
      if (el.open && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el.open) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    el.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      el.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <details ref={ref} className="group relative">
      <summary
        className={`flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg border px-2.5 text-sm whitespace-nowrap select-none [&::-webkit-details-marker]:hidden ${
          selected.length ? "border-ink text-ink" : "border-line text-ink-2 hover:text-ink"
        }`}
      >
        States
        {selected.length > 0 && (
          <span className="rounded-full bg-ink px-1.5 text-[10px] font-semibold text-surface tabular-nums">{selected.length}</span>
        )}
        <svg aria-hidden viewBox="0 0 10 6" className="size-2.5 transition-transform group-open:rotate-180">
          <path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </summary>
      <div className="absolute top-full left-0 z-30 mt-1 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-3 shadow-lg">
        <div className="flex items-center gap-2">
          <label htmlFor="explorer-state-find" className="sr-only">
            Find a state
          </label>
          <input
            id="explorer-state-find"
            value={find}
            onChange={(e) => setFind(e.target.value)}
            placeholder="Find a state"
            autoComplete="off"
            className="h-8 min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 text-sm text-ink placeholder:text-muted focus:border-ink focus:outline-none"
          />
          {selected.length > 0 && (
            <button type="button" onClick={() => setStates([])} className="text-xs font-semibold text-ink underline underline-offset-2">
              Clear
            </button>
          )}
        </div>
        <fieldset className="mt-2 max-h-64 overflow-y-auto">
          <legend className="sr-only">States</legend>
          <div className="grid grid-cols-2 gap-x-2">
            {sorted.map((s) => {
              const on = selected.includes(s.postal);
              return (
                <label
                  key={s.postal}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 text-sm text-ink hover:bg-surface-2"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => setStates(toggle(selected, s.postal))}
                    className="size-3.5 accent-[var(--ink)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  <span className="text-[11px] text-muted tabular-nums">{s.seats}</span>
                </label>
              );
            })}
            {sorted.length === 0 && <p className="col-span-2 px-1.5 py-2 text-sm text-ink-2">No state matches.</p>}
          </div>
        </fieldset>
      </div>
    </details>
  );
}

function Segmented<V extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: V;
  options: { value: V; label: string; dot?: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex h-8 items-center rounded-lg border border-line p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`inline-flex h-full items-center gap-1.5 rounded-md px-2.5 font-medium whitespace-nowrap ${
            value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"
          }`}
        >
          {o.dot && <span aria-hidden className="size-2 rounded-full" style={{ background: o.dot }} />}
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ pressed, onClick, children }: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium whitespace-nowrap transition-colors ${
        pressed ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:border-ink/40 hover:text-ink"
      }`}
    >
      <span
        aria-hidden
        className={`flex size-3 items-center justify-center rounded-sm border ${pressed ? "border-surface" : "border-current"}`}
      >
        {pressed && (
          <svg viewBox="0 0 10 10" className="size-2.5">
            <path d="M2 5.2 4.2 7.4 8 3" fill="none" stroke="currentColor" strokeWidth="1.6" />
          </svg>
        )}
      </span>
      {children}
    </button>
  );
}

function Chip({
  children,
  onRemove,
  swatch,
  strong,
  name,
}: {
  children: ReactNode;
  /** What the chip filters on, for the remove button's accessible name. */
  name: string;
  onRemove: () => void;
  swatch?: string;
  strong?: boolean;
}) {
  return (
    <span
      className={`inline-flex h-6 items-center gap-1 rounded-full border pr-0.5 pl-2 font-medium whitespace-nowrap ${
        strong ? "border-ink text-ink" : "border-line text-ink-2"
      }`}
    >
      {swatch && <span aria-hidden className="size-2 rounded-sm" style={{ background: swatch }} />}
      <span className="max-w-48 truncate">{children}</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove filter: ${name}`}
        className="flex size-5 items-center justify-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
      >
        <svg aria-hidden viewBox="0 0 10 10" className="size-2.5">
          <path d="M2 2l6 6M8 2 2 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </span>
  );
}

