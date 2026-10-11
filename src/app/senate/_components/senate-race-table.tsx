"use client";

// Every Senate race in one sortable, exportable table. Rows open the race page. The model
// category chips above it filter the rows and are kept in the URL (`cat`), so the seat bar,
// the state map and a shared link can all land on the same view.
import { useMemo } from "react";

import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, RatingChip } from "@/components/ui/primitives";
import type { RatingLabel, SenateRace } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { RATING_COLOR, RATING_ORDER, partyColor } from "@/lib/ratings";
import { senateHref } from "@/lib/routes";
import { challengerName, favoredText, modelCategory, sideMargin } from "./senate-shared";

interface Row {
  race: SenateRace;
  p: RaceProjection;
  category: RatingLabel;
}

function Dot({ party }: { party: string }) {
  return <span aria-hidden className="inline-block size-2 shrink-0 rounded-full" style={{ background: partyColor(party) }} />;
}

export function SenateRaceTable({
  senate,
  projections,
  categories,
  onCategories,
}: {
  senate: SenateRace[];
  projections: Map<string, RaceProjection>;
  categories: RatingLabel[];
  onCategories: (next: RatingLabel[] | null) => void;
}) {
  const { href } = useScenario();

  const all = useMemo<Row[]>(
    () =>
      senate
        .map((race) => {
          const p = projections.get(race.id)!;
          return { race, p, category: modelCategory(p, race) };
        })
        .filter((r) => r.p)
        // Closest races first: distance of the chance from a coin flip.
        .sort((a, b) => Math.abs(a.p.pWin - 0.5) - Math.abs(b.p.pWin - 0.5) || a.race.stateName.localeCompare(b.race.stateName)),
    [senate, projections],
  );

  const counts = useMemo(() => {
    const m = new Map<RatingLabel, number>();
    for (const r of all) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [all]);

  const rows = categories.length ? all.filter((r) => categories.includes(r.category)) : all;

  const toggle = (c: RatingLabel) => {
    const next = categories.includes(c) ? categories.filter((x) => x !== c) : [...categories, c];
    onCategories(next.length ? RATING_ORDER.filter((x) => next.includes(x)) : null);
  };

  const columns: Column<Row>[] = [
    {
      key: "state",
      header: "State",
      value: (r) => r.race.stateName,
      cell: (r) => r.race.stateName,
    },
    {
      key: "incumbent",
      header: "Incumbent",
      value: (r) => r.race.incumbent,
      cell: (r) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <Dot party={r.race.incumbentParty} />
            <span className="max-w-40 truncate" title={r.race.incumbent}>
              {r.race.incumbent || "—"}
            </span>
            <span className="text-xs text-ink-2">({r.race.incumbentParty || "?"})</span>
          </div>
          <div className="max-w-52 truncate text-[11px] text-muted" title={r.race.incumbentStatus}>
            {r.race.incumbentRunning ? r.race.incumbentStatus || "Running" : `Not running · ${r.race.incumbentStatus}`}
          </div>
        </div>
      ),
    },
    {
      key: "candidates",
      header: "Candidates",
      value: (r) => `${challengerName(r.race, r.p.challenger)} vs ${r.race.rep || "No Republican"}`,
      sortable: false,
      cell: (r) => {
        const left = challengerName(r.race, r.p.challenger);
        const right = r.race.rep || "No Republican";
        return (
          <span className="inline-flex max-w-64 items-center gap-1.5 text-ink-2" title={`${left} vs ${right}`}>
            <Dot party={r.p.challenger} />
            <span className="truncate text-ink">{left}</span>
            <span className="shrink-0 text-xs text-muted">vs</span>
            <Dot party="R" />
            <span className="truncate text-ink">{right}</span>
          </span>
        );
      },
    },
    {
      key: "lean",
      header: "Lean",
      align: "right",
      value: (r) => r.race.lean,
      cell: (r) => fmtMargin(r.race.lean),
      hideOnMobile: true,
    },
    {
      key: "margin",
      header: "Expected margin",
      align: "right",
      value: (r) => r.p.margin,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {sideMargin(r.p)}
          {!r.p.forced && <MarginBar value={r.p.margin} max={20} width={56} height={12} />}
        </span>
      ),
    },
    {
      key: "chance",
      header: "Chance",
      align: "right",
      value: (r) => r.p.pWin,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.p.challenger === "D" ? (
            <ProbBar p={r.p.pWin} width={64} height={12} />
          ) : (
            <span className="inline-block w-16 text-left text-[11px] text-muted" title={`Independent ${fmtProb(r.p.pWin)}`}>
              Independent
            </span>
          )}
          <span className="w-14 text-right">{favoredText(r.p)}</span>
        </span>
      ),
    },
    {
      key: "model",
      header: "Model",
      value: (r) => RATING_ORDER.indexOf(r.category),
      cell: (r) => <RatingChip rating={r.category} size="xs" />,
    },
    {
      key: "consensus",
      header: "Consensus",
      value: (r) => -r.race.ratingScore,
      cell: (r) => <RatingChip rating={r.race.rating} size="xs" />,
    },
    { key: "cook", header: "Cook", value: (r) => r.race.cook, cell: (r) => <span className="text-xs text-ink-2">{r.race.cook || "—"}</span>, hideOnMobile: true },
    { key: "ie", header: "Inside Elections", value: (r) => r.race.ie, cell: (r) => <span className="text-xs text-ink-2">{r.race.ie || "—"}</span>, hideOnMobile: true },
    { key: "sabato", header: "Sabato", value: (r) => r.race.sabato, cell: (r) => <span className="text-xs text-ink-2">{r.race.sabato || "—"}</span>, hideOnMobile: true },
    {
      key: "notes",
      header: "Notes",
      sortable: false,
      hideOnMobile: true,
      value: (r) =>
        [r.race.openSeat || !r.race.incumbentRunning ? "Open seat" : "", r.race.specialElection ? "Special election" : "", r.race.rankedChoice ? "Ranked-choice" : "", r.p.challenger === "I" ? "Independent vs Republican" : ""]
          .filter(Boolean)
          .join("; "),
      cell: (r) => (
        <span className="flex gap-1">
          {(r.race.openSeat || !r.race.incumbentRunning) && <Badge>Open</Badge>}
          {r.race.specialElection && <Badge tone="info">Special</Badge>}
          {r.race.rankedChoice && <Badge>Ranked-choice</Badge>}
          {r.p.challenger === "I" && <Badge tone="info">Independent</Badge>}
        </span>
      ),
    },
  ];

  return (
    <div>
      <div role="group" aria-label="Filter races by model category" className="mb-3 flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          aria-pressed={categories.length === 0}
          onClick={() => onCategories(null)}
          className={`rounded-full border px-2.5 py-1 text-xs font-medium ${categories.length === 0 ? "border-ink bg-ink text-surface" : "border-line text-ink-2 hover:text-ink"}`}
        >
          All {all.length}
        </button>
        {RATING_ORDER.filter((c) => counts.get(c)).map((c) => {
          const on = categories.includes(c);
          return (
            <button
              key={c}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(c)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "border-ink bg-surface-2 text-ink" : "border-line text-ink-2 hover:text-ink"}`}
            >
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: RATING_COLOR[c] }} />
              {c}
              <span className="tabular-nums text-muted">{counts.get(c)}</span>
            </button>
          );
        })}
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.race.id}
        rowHref={(r) => href(senateHref(r.race.state))}
        csvName="senate-races"
        maxHeight={720}
        caption={
          <>
            <span className="font-semibold text-ink tabular-nums">{rows.length}</span> of {all.length} races
            {categories.length ? ` · model: ${categories.join(", ")}` : ""} · closest first
          </>
        }
        emptyMessage="No races in these categories in this scenario."
      />
    </div>
  );
}
