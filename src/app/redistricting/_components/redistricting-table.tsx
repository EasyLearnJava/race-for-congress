"use client";

import Link from "next/link";
import { useMemo } from "react";

import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, RatingChip, SectionTitle } from "@/components/ui/primitives";
import { STATE_BY_POSTAL } from "@/lib/data/states";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { partyColor } from "@/lib/ratings";
import { explorerHref, houseHref } from "@/lib/routes";
import { CLOSE_LEAN, type Basis, type DistrictInfo } from "../_lib/derive";
import { Segmented } from "./segmented";

export type Show = "all" | "flips" | "close";
const SHOWS = [
  { value: "all", label: "All listed" },
  { value: "flips", label: "Notional flips" },
  { value: "close", label: "Close seats" },
] as const;

interface Row {
  d: DistrictInfo;
  p: RaceProjection | undefined;
}

export function RedistrictingTable({
  districts,
  projections,
  hasOld,
  basis,
  states,
  state,
  onState,
  show,
  onShow,
}: {
  districts: DistrictInfo[];
  projections: Map<string, RaceProjection>;
  hasOld: boolean;
  basis: Basis;
  /** Redrawn states, for the picker. */
  states: readonly string[];
  state: string | null;
  onState: (state: string | null) => void;
  show: Show;
  onShow: (show: Show) => void;
}) {
  const { href } = useScenario();

  const rows = useMemo<Row[]>(
    () =>
      districts
        .filter((d) => d.flip || d.close)
        .filter((d) => (show === "flips" ? d.flip : show === "close" ? d.close : true))
        .filter((d) => !state || d.state === state)
        // Flips first, then the closest seats.
        .sort((a, b) => Number(!a.flip) - Number(!b.flip) || Math.abs(a.race.lean) - Math.abs(b.race.lean))
        .map((d) => ({ d, p: projections.get(d.id) })),
    [districts, projections, show, state],
  );

  const columns = useMemo<Column<Row>[]>(() => {
    const cols: Column<Row>[] = [
      {
        key: "seat",
        header: "Seat",
        value: (r) => r.d.id,
        cell: (r) => (
          <span>
            {r.d.id}
            <span className="ml-1.5 text-xs font-normal text-ink-2">{r.d.race.stateName}</span>
          </span>
        ),
      },
      {
        key: "why",
        header: "Listed for",
        value: (r) => [r.d.flip ? `Flip ${r.d.flip === "toD" ? "to D" : "to R"}` : "", r.d.close ? "Close" : ""].filter(Boolean).join("; "),
        cell: (r) => (
          <span className="inline-flex gap-1">
            {r.d.flip && <Badge tone="info">{r.d.flip === "toD" ? "R-held, leans D" : "D-held, leans R"}</Badge>}
            {r.d.close && <Badge>Close</Badge>}
          </span>
        ),
      },
      {
        key: "held",
        header: "Held by",
        value: (r) => r.d.race.heldBy,
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: partyColor(r.d.race.heldBy) }} />
            {r.d.race.heldBy || "—"}
            {r.d.race.heldByMember && <span className="max-w-36 truncate text-xs text-ink-2">{r.d.race.heldByMember}</span>}
          </span>
        ),
      },
      {
        key: "incumbent",
        header: "Running",
        hideOnMobile: true,
        value: (r) => (r.d.race.incumbent ? `${r.d.race.incumbent}${r.d.race.incumbentRunning ? "" : " (not running)"}` : "Open seat"),
        cell: (r) => (
          <span className="block max-w-44 truncate text-ink-2" title={`${r.d.race.dem || "—"} vs ${r.d.race.rep || "—"}`}>
            {r.d.race.incumbent ? (
              <>
                {r.d.race.incumbent} ({r.d.race.incumbentParty || "?"}){r.d.race.incumbentRunning ? "" : ", not running"}
              </>
            ) : (
              "Open seat"
            )}
          </span>
        ),
      },
      {
        key: "pres24",
        header: "2024 vote",
        align: "right",
        value: (r) => r.d.race.pres24,
        cell: (r) => fmtMargin(r.d.race.pres24),
      },
      {
        key: "lean",
        header: "Lean",
        align: "right",
        value: (r) => r.d.race.lean,
        cell: (r) => fmtMargin(r.d.race.lean),
      },
    ];
    if (hasOld) {
      cols.push(
        {
          key: "old",
          header: "Old lines, 2024 vote",
          align: "right",
          hideOnMobile: true,
          value: (r) => r.d.oldPres24,
          cell: (r) => fmtMargin(r.d.oldPres24),
        },
        {
          key: "shift",
          header: "Shift",
          align: "right",
          hideOnMobile: true,
          value: (r) => r.d.shift,
          cell: (r) => (r.d.shift == null ? "—" : fmtMargin(r.d.shift)),
        },
      );
    }
    cols.push(
      {
        key: "expected",
        header: "Expected margin",
        align: "right",
        value: (r) => (r.p ? Math.round(r.p.margin * 10) / 10 : null),
        cell: (r) =>
          r.p ? (
            <span className="inline-flex items-center gap-2">
              {fmtMargin(r.p.margin)}
              <MarginBar value={r.p.margin} max={15} width={56} height={12} />
            </span>
          ) : (
            "—"
          ),
      },
      {
        key: "chance",
        header: "Chance D",
        value: (r) => (r.p ? Math.round(r.p.pWin * 1000) / 1000 : null),
        cell: (r) =>
          r.p ? (
            <span className="inline-flex items-center gap-2">
              <ProbBar p={r.p.pWin} width={64} height={12} />
              {fmtProb(r.p.pWin)}
            </span>
          ) : (
            "—"
          ),
      },
      {
        key: "rating",
        header: "Forecasters",
        value: (r) => r.d.race.rating,
        cell: (r) => <RatingChip rating={r.d.race.rating} size="xs" />,
      },
    );
    return cols;
  }, [hasOld]);

  const ids = rows.map((r) => r.d.id);

  return (
    <section aria-labelledby="redistricting-seats" className="mt-6">
      <SectionTitle
        title={<span id="redistricting-seats">Seats to watch on the new lines</span>}
        description={
          <>
            Districts in the nine states where the notional holder and the new lines disagree (by{" "}
            {basis === "pres" ? "the 2024 presidential result" : "lean"}), plus every new seat within {CLOSE_LEAN} points of the
            national vote. Expected margin and chance are the model at your settings.
          </>
        }
        action={
          ids.length > 0 && (
            <Link href={href(explorerHref(ids))} className="link-more text-sm">
              Open these {ids.length} seats in the explorer
            </Link>
          )
        }
      />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Segmented label="Show" value={show} options={SHOWS} onChange={onShow} />
        <label className="inline-flex items-center gap-2 text-xs text-ink-2">
          State
          <select
            value={state ?? ""}
            onChange={(e) => onState(e.target.value || null)}
            className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
          >
            <option value="">All nine</option>
            {states.map((s) => (
              <option key={s} value={s}>
                {STATE_BY_POSTAL[s]?.name ?? s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <DataTable
        rows={rows}
        columns={columns}
        rowKey={(r) => r.d.id}
        rowHref={(r) => href(houseHref(r.d.id))}
        csvName="redistricting-seats-to-watch"
        emptyMessage="No seats match. Try another state or show all listed seats."
        caption={
          <>
            <span className="font-semibold text-ink tabular-nums">{rows.length}</span> seats
            {state ? ` in ${STATE_BY_POSTAL[state]?.name ?? state}` : " in the nine states"}
          </>
        }
      />
    </section>
  );
}
