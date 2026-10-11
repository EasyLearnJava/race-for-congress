"use client";

// A state's districts with the same columns as the /house explorer table, closest first.
import Link from "next/link";
import { useMemo } from "react";

import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, RatingChip } from "@/components/ui/primitives";
import type { HouseRace, SpecialCase } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { partyColor } from "@/lib/ratings";
import { houseHref } from "@/lib/routes";

interface Row {
  race: HouseRace;
  p: RaceProjection;
}

const chance = (p: RaceProjection) => (p.forced ? (p.margin > 0 ? 1 : 0) : p.pWin);

function incumbentText(r: HouseRace): string {
  if (!r.incumbent) return "None";
  const party = r.incumbentParty ? ` (${r.incumbentParty})` : "";
  return `${r.incumbent}${party}${r.incumbentRunning ? "" : ", not running"}`;
}

const SPECIAL_NOTE: Record<Exclude<SpecialCase, "">, string> = {
  same_party_D: "Two Democrats advance to the general election, so the seat stays Democratic whoever wins.",
  same_party_R: "Two Republicans advance to the general election, so the seat stays Republican whoever wins.",
  no_democrat: "No Democrat is on the ballot, so the model counts the seat as Republican.",
  no_republican: "No Republican is on the ballot, so the model counts the seat as Democratic.",
  independent_vs_R: "An independent, with no Democrat on the ballot, faces the Republican; chances are for the independent.",
  candidates_unknown: "The nominees are not settled yet; the model uses the district's lean and ratings.",
};

function Small({ children }: { children: string }) {
  return children ? <span className="text-xs text-ink-2">{children}</span> : <span className="text-xs text-muted">—</span>;
}

export function StateDistrictTable({
  name,
  postal,
  races,
  projections,
}: {
  name: string;
  postal: string;
  races: HouseRace[];
  projections: Map<string, RaceProjection>;
}) {
  const { href } = useScenario();

  // Closest first (|p - 0.5|), like the explorer's default.
  const rows = useMemo<Row[]>(
    () =>
      races
        .flatMap((race) => {
          const p = projections.get(race.id);
          return p ? [{ race, p }] : [];
        })
        .sort((a, b) => Math.abs(chance(a.p) - 0.5) - Math.abs(chance(b.p) - 0.5) || a.race.district - b.race.district),
    [races, projections],
  );

  const specials = useMemo(() => {
    const seen = new Map<Exclude<SpecialCase, "">, string[]>();
    for (const r of races) {
      if (!r.special) continue;
      seen.set(r.special, [...(seen.get(r.special) ?? []), r.id]);
    }
    return [...seen.entries()];
  }, [races]);

  const unrated = races.filter((r) => r.ratingCount === 0).length;

  const columns: Column<Row>[] = [
    {
      key: "seat",
      header: "Seat",
      value: (r) => r.race.id,
      cell: (r) => (
        <span className="inline-flex flex-col leading-tight">
          <span className="font-semibold">{r.race.id}</span>
          <span className="text-[11px] font-normal text-ink-2">{r.race.district ? `District ${r.race.district}` : "At-large"}</span>
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
    { key: "lean", header: "Lean", align: "right", value: (r) => r.race.lean, cell: (r) => fmtMargin(r.race.lean) },
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
          <MarginBar value={r.p.margin} max={20} challenger={r.p.challenger} width={56} height={12} />
        </span>
      ),
    },
    {
      key: "chance",
      header: "Chance D",
      align: "right",
      value: (r) => Number(chance(r.p).toFixed(4)),
      cell: (r) => (
        <span className="inline-flex items-center justify-end gap-2">
          <ProbBar p={chance(r.p)} challenger={r.p.challenger} width={64} height={12} />
          <span className="w-9 text-right">{fmtProb(chance(r.p))}</span>
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
    { key: "sabato", header: "Sabato", hideOnMobile: true, value: (r) => r.race.sabato || null, cell: (r) => <Small>{r.race.sabato}</Small> },
    {
      key: "newLines",
      header: "New lines",
      align: "center",
      value: (r) => (r.race.newLines ? "Yes" : "No"),
      cell: (r) => (r.race.newLines ? <Badge>New</Badge> : <span className="text-muted">—</span>),
    },
  ];

  return (
    <div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.race.id}
        rowHref={(r) => href(houseHref(r.race.id))}
        csvName={`${postal.toLowerCase()}-districts`}
        maxHeight={720}
        caption={
          <>
            <span className="font-semibold text-ink tabular-nums">{rows.length}</span> {name} {rows.length === 1 ? "seat" : "seats"}, closest
            first<span className="hidden sm:inline">. Click a row to open the district.</span>
          </>
        }
        toolbar={
          <Link href={href(`/house?state=${postal}`)} className="rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink">
            Open in explorer
          </Link>
        }
      />
      <div className="mt-2 space-y-1 text-xs leading-5 text-ink-2">
        <p>
          Lean is the district&apos;s 2024 presidential margin minus the national margin. Expected margin and chance follow your scenario; the
          consensus is the median of 10 published forecasters. Held by is the party holding the district&apos;s predecessor seat.
        </p>
        {unrated > 0 && (
          <p>
            * {unrated} of {races.length} {unrated === 1 ? "seat is" : "seats are"} not listed as competitive by any forecaster; the model
            uses fundamentals only there.
          </p>
        )}
        {specials.map(([kind, ids]) => (
          <p key={kind}>
            <span className="font-medium text-ink">{ids.join(", ")}:</span> {SPECIAL_NOTE[kind]}
          </p>
        ))}
      </div>
    </div>
  );
}
