"use client";

// The explorer's table: every filtered seat, sorted by closeness unless the URL names a sort.
import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { Badge, RatingChip } from "@/components/ui/primitives";
import { DataTable, type Column } from "@/components/ui/data-table";
import { fmtMargin, fmtProb } from "@/lib/format";
import { partyColor } from "@/lib/ratings";
import { houseHref } from "@/lib/routes";
import { setSort, type SortDir } from "./filters";
import type { ExplorerRow } from "./types";

const SORTS: { key: string; label: string; dir: SortDir }[] = [
  { key: "", label: "Closest first", dir: "asc" },
  { key: "chance", label: "Chance D, high to low", dir: "desc" },
  { key: "margin", label: "Expected margin, D first", dir: "desc" },
  { key: "lean", label: "Lean, D first", dir: "desc" },
  { key: "lean-r", label: "Lean, R first", dir: "asc" },
  { key: "seat", label: "Seat, A to Z", dir: "asc" },
];

const pChance = (r: ExplorerRow) => (r.p.forced ? (r.p.margin > 0 ? 1 : 0) : r.p.pWin);

function incumbentText(r: ExplorerRow["race"]): string {
  if (!r.incumbent) return "None";
  const party = r.incumbentParty ? ` (${r.incumbentParty})` : "";
  return `${r.incumbent}${party}${r.incumbentRunning ? "" : ", not running"}`;
}

export function RaceTable({ rows, sort, dir }: { rows: ExplorerRow[]; sort: string | null; dir: SortDir }) {
  const { href } = useScenario();

  const columns: Column<ExplorerRow>[] = [
    {
      key: "seat",
      header: "Seat",
      value: (r) => r.race.id,
      cell: (r) => (
        <span className="inline-flex flex-col leading-tight">
          <span className="font-semibold">{r.race.id}</span>
          <span className="text-[11px] font-normal text-ink-2">{r.race.stateName}</span>
        </span>
      ),
    },
    {
      key: "held",
      header: "Held by",
      value: (r) => r.race.heldBy || null,
      cell: (r) =>
        r.race.heldBy ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: partyColor(r.race.heldBy) }} />
            {r.race.heldBy}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "incumbent",
      header: "Incumbent",
      value: (r) => incumbentText(r.race),
      cell: (r) =>
        r.race.incumbent ? (
          <span className="block max-w-44 truncate" title={incumbentText(r.race)}>
            {r.race.incumbent}
            {r.race.incumbentParty && <span className="text-ink-2"> ({r.race.incumbentParty})</span>}
            {!r.race.incumbentRunning && <span className="ml-1 text-[11px] text-ink-2">not running</span>}
          </span>
        ) : (
          <span className="text-muted">None</span>
        ),
    },
    {
      key: "candidates",
      header: "Candidates (D vs R)",
      value: (r) => `${r.race.dem || "No Democrat"} vs ${r.race.rep || "No Republican"}`,
      sortable: false,
      cell: (r) => (
        <span className="block max-w-56 truncate text-ink-2" title={`${r.race.dem || "No Democrat"} vs ${r.race.rep || "No Republican"}`}>
          <span className="text-ink">{r.race.dem || "—"}</span> vs <span className="text-ink">{r.race.rep || "—"}</span>
        </span>
      ),
    },
    {
      key: "lean",
      header: "Lean",
      align: "right",
      value: (r) => r.race.lean,
      cell: (r) => fmtMargin(r.race.lean),
    },
    {
      key: "pres24",
      header: "2024 pres.",
      align: "right",
      hideOnMobile: true,
      value: (r) => r.race.pres24,
      cell: (r) => fmtMargin(r.race.pres24),
    },
    {
      key: "margin",
      header: "Expected margin",
      align: "right",
      value: (r) => Number(r.p.margin.toFixed(2)),
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          {fmtMargin(r.p.margin)}
          <MarginBar value={r.p.margin} max={20} width={56} height={12} challenger={r.p.challenger} />
        </span>
      ),
    },
    {
      key: "chance",
      header: "Chance D",
      align: "right",
      value: (r) => Number(pChance(r).toFixed(4)),
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <ProbBar p={pChance(r)} width={64} height={12} challenger={r.p.challenger} />
          <span className="w-9 text-right">{fmtProb(pChance(r))}</span>
        </span>
      ),
    },
    {
      key: "consensus",
      header: "Consensus",
      value: (r) => r.race.rating,
      cell: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <RatingChip rating={r.race.rating} size="xs" />
          {r.race.ratingCount === 0 && <span className="text-[10px] text-muted">unrated*</span>}
        </span>
      ),
    },
    { key: "cook", header: "Cook", hideOnMobile: true, value: (r) => r.race.cook || null, cell: (r) => <Small>{r.race.cook}</Small> },
    { key: "ie", header: "IE", hideOnMobile: true, value: (r) => r.race.ie || null, cell: (r) => <Small>{r.race.ie}</Small> },
    {
      key: "sabato",
      header: "Sabato",
      hideOnMobile: true,
      value: (r) => r.race.sabato || null,
      cell: (r) => <Small>{r.race.sabato}</Small>,
    },
    {
      key: "newLines",
      header: "New lines",
      align: "center",
      value: (r) => (r.race.newLines ? "Yes" : "No"),
      cell: (r) => (r.race.newLines ? <Badge>New</Badge> : <span className="text-muted">—</span>),
    },
  ];

  // The URL may name a sort (sort + dir); "lean-r" is the select's shortcut for lean ascending.
  const urlSort = sort === "lean-r" ? "lean" : sort;
  const initialSort = urlSort && columns.some((c) => c.key === urlSort) ? { key: urlSort, dir } : undefined;
  const sortValue = sort === "lean" && dir === "asc" ? "lean-r" : (SORTS.find((s) => s.key === (sort ?? ""))?.key ?? "");

  return (
    <DataTable
      // Remount when the URL sort changes so DataTable picks up the new initial sort.
      key={`${urlSort ?? "close"}-${dir}`}
      rows={rows}
      columns={columns}
      rowKey={(r) => r.race.id}
      rowHref={(r) => href(houseHref(r.race.id))}
      initialSort={initialSort}
      csvName="house-race-explorer"
      maxHeight={720}
      caption={
        <>
          <span className="font-semibold text-ink tabular-nums">{rows.length}</span> {rows.length === 1 ? "seat" : "seats"}
          <span className="hidden sm:inline">. Click a row to open the district.</span>
        </>
      }
      toolbar={
        <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
          <span className="hidden sm:inline">Sort</span>
          <select
            value={sortValue}
            onChange={(e) => {
              const s = SORTS.find((x) => x.key === e.target.value) ?? SORTS[0];
              if (!s.key) setSort(null, "desc");
              else if (s.key === "lean-r") setSort("lean", "asc");
              else setSort(s.key, s.dir);
            }}
            className="h-7 rounded-md border border-line bg-surface px-1.5 text-xs text-ink"
            aria-label="Sort seats"
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      }
      emptyMessage="No seats match these filters."
    />
  );
}

function Small({ children }: { children: string }) {
  return children ? <span className="text-xs text-ink-2">{children}</span> : <span className="text-xs text-muted">—</span>;
}
