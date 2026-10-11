"use client";

// "Seats that decide it": the 30 House races closest to an even chance in this scenario, as a
// table (chance, expected margin, flip point) and as a strip of flip points against the current
// national vote, so it is clear how far the vote has to move to change each one.
import Link from "next/link";
import { useMemo } from "react";

import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { DotStrip, dotStripHeight, type DotStripRow } from "@/components/charts/dot-strip";
import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RatingChip, SectionTitle } from "@/components/ui/primitives";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import { partyColor } from "@/lib/ratings";
import { explorerHref, houseHref } from "@/lib/routes";
import type { SimRace } from "./types";

const COUNT = 30;
const ROW_HEIGHT = 18;
const DOMAIN: [number, number] = [-15, 15];

interface Row {
  rank: number;
  race: SimRace;
  p: RaceProjection;
  flip: number;
}

export function DecidingSeats({ house, projections }: { house: SimRace[]; projections: RaceProjection[] }) {
  const { href } = useScenario();
  const params = useModelParams();

  const rows = useMemo<Row[]>(() => {
    const byId = new Map(house.map((r) => [r.id, r]));
    return projections
      .filter((p) => !p.forced)
      .sort((a, b) => Math.abs(a.pWin - 0.5) - Math.abs(b.pWin - 0.5))
      .slice(0, COUNT)
      .map((p, i) => ({ rank: i + 1, race: byId.get(p.id)!, p, flip: params.env - p.margin }));
  }, [house, projections, params.env]);

  const columns = useMemo<Column<Row>[]>(
    () => [
      {
        key: "seat",
        header: "Seat",
        value: (r) => r.race.id,
        cell: (r) => (
          <span>
            {r.race.id} <span className="font-normal text-ink-2">{r.race.stateName}</span>
          </span>
        ),
      },
      {
        key: "held",
        header: "Held by",
        value: (r) => r.race.heldBy,
        cell: (r) => (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: partyColor(r.race.heldBy) }} />
            {r.race.heldBy || "—"}
          </span>
        ),
      },
      {
        key: "candidates",
        header: "Candidates (D vs R)",
        value: (r) => `${r.race.left || "—"} vs ${r.race.rep || "—"}`,
        cell: (r) => (
          <span className="block max-w-56 truncate text-ink-2" title={`${r.race.left} vs ${r.race.rep}`}>
            {r.race.left || "—"} vs {r.race.rep || "—"}
          </span>
        ),
        hideOnMobile: true,
      },
      {
        key: "chance",
        header: "Chance D",
        value: (r) => Number(r.p.pWin.toFixed(4)),
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            <ProbBar p={r.p.pWin} width={64} height={12} />
            <span className="w-9 text-right">{fmtProb(r.p.pWin)}</span>
          </span>
        ),
      },
      {
        key: "margin",
        header: "Expected margin",
        align: "right",
        value: (r) => Number(r.p.margin.toFixed(2)),
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            {fmtMargin(r.p.margin)}
            <MarginBar value={r.p.margin} max={6} width={56} height={12} />
          </span>
        ),
      },
      {
        key: "flip",
        header: "Flip point",
        align: "right",
        value: (r) => Number(r.flip.toFixed(2)),
        cell: (r) => fmtMargin(r.flip),
      },
      {
        key: "rating",
        header: "Forecasters",
        value: (r) => r.race.rating,
        cell: (r) => <RatingChip rating={r.race.rating} size="xs" />,
        hideOnMobile: true,
      },
      { key: "rank", header: "Rank", align: "right", value: (r) => r.rank, hideOnMobile: true },
    ],
    [],
  );

  const strip = useMemo<DotStripRow[]>(
    () =>
      [...rows]
        .sort((a, b) => b.flip - a.flip)
        .map((r) => ({
          key: r.race.id,
          label: r.race.id,
          href: href(houseHref(r.race.id)),
          dots: [
            {
              key: "flip",
              value: r.flip,
              color: r.p.margin >= 0 ? "var(--dem)" : "var(--rep)",
              label: `Flip point (${r.p.margin >= 0 ? "Democrat" : "Republican"} favored now)`,
            },
          ],
          marker: { value: params.env, label: "Current national vote" },
        })),
    [rows, href, params.env],
  );

  const ids = rows.map((r) => r.race.id);

  return (
    <section aria-labelledby="deciding-title" className="mt-8">
      <SectionTitle
        title={<span id="deciding-title">Seats that decide it</span>}
        description={`The ${COUNT} House races closest to an even chance at a national vote of ${fmtMargin(params.env)}. The flip point is the national vote at which a race's expected margin crosses zero.`}
        action={
          <Link href={href(explorerHref(ids))} className="text-xs font-semibold underline underline-offset-2">
            Open these {COUNT} in the explorer
          </Link>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="min-w-0 xl:col-span-3">
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(r) => r.race.id}
            rowHref={(r) => href(houseHref(r.race.id))}
            initialSort={{ key: "rank", dir: "asc" }}
            csvName="simulator-deciding-seats"
            maxHeight={620}
            caption={
              <>
                <span className="font-semibold text-ink tabular-nums">{rows.length}</span> closest seats, most even first
              </>
            }
          />
        </div>
        <ChartFrame
          className="min-w-0 xl:col-span-2"
          title="How far the national vote must move"
          subtitle="Each dot is a seat's flip point; the tick is the current national vote. Dots left of the tick are seats where Democrats are favored now, dots to the right Republicans; the gap is how far the vote must move."
          height={dotStripHeight(strip, ROW_HEIGHT)}
          csvName="simulator-flip-points"
          source={`Model at ${fmtMargin(params.env)}. Flip point = national vote minus expected margin.`}
          legend={
            <>
              <LegendItem color="var(--dem)" label="Democrat favored now" shape="dot" />
              <LegendItem color="var(--rep)" label="Republican favored now" shape="dot" />
            </>
          }
          table={{
            columns: [
              { key: "seat", label: "Seat" },
              { key: "flip", label: "Flip point", align: "right", format: (v) => fmtMargin(Number(v)) },
              { key: "distance", label: "Points away", align: "right", format: (v) => Number(v).toFixed(1) },
            ],
            rows: rows.map((r) => ({ seat: r.race.id, flip: Number(r.flip.toFixed(2)), distance: Math.abs(r.p.margin) })),
          }}
        >
          {(width) => (
            <DotStrip
              width={width}
              rows={strip}
              domain={DOMAIN}
              rowHeight={ROW_HEIGHT}
              format={(v) => fmtMargin(v)}
              ticks={[-15, -10, -5, 0, 5, 10, 15].map((v) => ({ value: v, label: fmtMargin(v, 0) }))}
              ariaLabel={`Flip points of the ${rows.length} closest House seats against the current national vote of ${fmtMargin(params.env)}`}
            />
          )}
        </ChartFrame>
      </div>
    </section>
  );
}
