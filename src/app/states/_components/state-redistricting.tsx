"use client";

// The redistricting section of a state page: shown only for states voting on new lines in 2026.
// Every optional table (old lines, the state summary, per-district changes, seat curves) may be
// empty while the pipeline catches up; each part then says what is missing instead of guessing.
import Link from "next/link";
import { useMemo } from "react";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { LineChart } from "@/components/charts/line-chart";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Empty, SectionTitle } from "@/components/ui/primitives";
import type { HouseRace, OldLinesRow, Row } from "@/lib/data/types";
import { fmtMargin, signed } from "@/lib/format";
import { RATING_COLOR, partyColor } from "@/lib/ratings";
import { houseHref } from "@/lib/routes";
import { num, str } from "./shared";

const D_FILL = RATING_COLOR["Likely D"];
const R_FILL = RATING_COLOR["Likely R"];
const CURVE_HEIGHT = 240;

interface DistrictChange {
  id: string;
  district: number | null;
  oldMember: string;
  heldBy: string;
  oldMargin: number | null;
  newMargin: number | null;
  shift: number | null;
  flip: string;
}

export function StateRedistricting({
  name,
  postal,
  races,
  expectedDem,
  oldLines,
  summary,
  districts,
  curve,
}: {
  name: string;
  postal: string;
  races: HouseRace[];
  expectedDem: number;
  oldLines: OldLinesRow[];
  summary: Row | null;
  districts: Row[];
  curve: Row[];
}) {
  const { params, href } = useScenario();
  const n = races.length;

  const delegation = useMemo(() => {
    const newCarriedD = races.filter((r) => r.pres24 > 0).length;
    const newCarriedR = races.filter((r) => r.pres24 < 0).length;
    let oldCarriedD: number | null = null;
    let oldCarriedR: number | null = null;
    let wonD: number | null = null;
    let wonR: number | null = null;
    if (oldLines.length) {
      oldCarriedD = oldLines.filter((r) => r.pres24 > 0).length;
      oldCarriedR = oldLines.filter((r) => r.pres24 < 0).length;
      wonD = oldLines.filter((r) => r.heldBy === "D").length;
      wonR = oldLines.filter((r) => r.heldBy === "R").length;
    } else if (summary) {
      oldCarriedD = num(summary, "old_lean_D_seats");
      oldCarriedR = num(summary, "old_lean_R_seats");
      wonD = num(summary, "held_D_2024");
      wonR = num(summary, "held_R_2024");
    }
    return { newCarriedD, newCarriedR, oldCarriedD, oldCarriedR, wonD, wonR };
  }, [races, oldLines, summary]);

  const hasOld = delegation.oldCarriedD != null && delegation.oldCarriedR != null;

  const bars = useMemo<BarRow[]>(() => {
    const seg = (key: string, d: number, r: number, dLabel: string, rLabel: string) => [
      { key: `${key}-d`, label: dLabel, value: d, color: D_FILL },
      { key: `${key}-r`, label: rLabel, value: r, color: R_FILL },
    ];
    const rows: BarRow[] = [];
    if (hasOld) {
      rows.push({
        key: "old",
        label: "2024 lines",
        sublabel: "carried by Harris | Trump",
        segments: seg("old", delegation.oldCarriedD!, delegation.oldCarriedR!, "Carried by Harris", "Carried by Trump"),
      });
    }
    rows.push({
      key: "new",
      label: "2026 lines",
      sublabel: "carried by Harris | Trump",
      segments: seg("new", delegation.newCarriedD, delegation.newCarriedR, "Carried by Harris", "Carried by Trump"),
    });
    if (delegation.wonD != null && delegation.wonR != null) {
      rows.push({
        key: "won",
        label: "Won in 2024",
        sublabel: "House seats, old lines",
        segments: seg("won", delegation.wonD, delegation.wonR, "Democrats won", "Republicans won"),
      });
    }
    rows.push({
      key: "expected",
      label: "Expected in 2026",
      sublabel: "this scenario",
      segments: seg("exp", Number(expectedDem.toFixed(1)), Number((n - expectedDem).toFixed(1)), "Democrats expected", "Republicans expected"),
    });
    return rows;
  }, [delegation, hasOld, expectedDem, n]);

  const changes = useMemo<DistrictChange[]>(
    () =>
      districts.map((row) => ({
        id: str(row, "race_id"),
        district: num(row, "district"),
        oldMember: str(row, "old_member"),
        heldBy: str(row, "held_by"),
        oldMargin: num(row, "old_pres24_margin"),
        newMargin: num(row, "new_pres24_margin"),
        shift: num(row, "margin_shift"),
        flip: str(row, "flip"),
      })),
    [districts],
  );

  const curvePoints = useMemo(
    () =>
      curve
        .map((row) => ({ env: num(row, "environment"), old: num(row, "old_D_seats"), now: num(row, "new_D_seats") }))
        .filter((p): p is { env: number; old: number | null; now: number | null } => p.env != null)
        .sort((a, b) => a.env - b.env),
    [curve],
  );

  const evenOld = num(summary, "old_even_D_seats");
  const evenNew = num(summary, "new_even_D_seats");

  const changeColumns: Column<DistrictChange>[] = [
    { key: "id", header: "District", value: (r) => r.id },
    {
      key: "heldBy",
      header: "Held by",
      value: (r) => r.heldBy || null,
      cell: (r) =>
        r.heldBy ? (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: partyColor(r.heldBy) }} />
            {r.heldBy}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "oldMember",
      header: "Member (2024 lines)",
      value: (r) => r.oldMember || null,
      cell: (r) => <span className="block max-w-44 truncate">{r.oldMember || "—"}</span>,
      hideOnMobile: true,
    },
    { key: "oldMargin", header: "2024 pres., old lines", align: "right", value: (r) => r.oldMargin, cell: (r) => fmtMargin(r.oldMargin) },
    { key: "newMargin", header: "2024 pres., new lines", align: "right", value: (r) => r.newMargin, cell: (r) => fmtMargin(r.newMargin) },
    {
      key: "shift",
      header: "Shift",
      align: "right",
      value: (r) => r.shift,
      cell: (r) => (r.shift == null ? "—" : `${signed(r.shift)} pts`),
    },
    {
      key: "flip",
      header: "Carried by",
      value: (r) => (r.flip === "to_D" ? "Now Harris" : r.flip === "to_R" ? "Now Trump" : "Same"),
      cell: (r) =>
        r.flip === "to_D" ? (
          <span className="text-xs font-medium text-ink">Trump → Harris</span>
        ) : r.flip === "to_R" ? (
          <span className="text-xs font-medium text-ink">Harris → Trump</span>
        ) : (
          <span className="text-xs text-muted">Same</span>
        ),
    },
  ];

  return (
    <section aria-labelledby="redistricting-title" className="mt-8">
      <SectionTitle
        title={<span id="redistricting-title">The new map</span>}
        description={`${name} votes on new congressional lines in 2026. The comparisons hold the 2024 presidential vote fixed, so any change comes from the lines alone.`}
        action={
          <Link href={href("/redistricting")} className="link-more text-sm">
            How much the new maps moved the race
          </Link>
        }
      />
      {evenOld != null && evenNew != null && (
        <p className="-mt-1 mb-3 text-sm text-ink-2">
          At an even national vote, the old lines favored Democrats in <span className="font-semibold text-ink tabular-nums">{evenOld}</span> of{" "}
          {n} seats; the new lines favor them in <span className="font-semibold text-ink tabular-nums">{evenNew}</span> ({signed(evenNew - evenOld, 0)}).
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ChartFrame
          title="Old delegation and new"
          subtitle={
            hasOld
              ? "Seats each presidential candidate carried on the 2024 and 2026 lines, the seats each party won in 2024, and the expected result in this scenario."
              : "Seats each presidential candidate carried on the 2026 lines and the expected result in this scenario. The 2024 lines are not loaded yet."
          }
          height={barChartHeight(bars.length, 40)}
          csvName={`${postal.toLowerCase()}-old-vs-new-delegation`}
          source={`Source: 2024 presidential results by district on both maps, The Downballot; model at a national vote of ${fmtMargin(params.env)}.`}
          legend={
            <>
              <LegendItem color={D_FILL} label="Democratic side" />
              <LegendItem color={R_FILL} label="Republican side" />
            </>
          }
          table={{
            columns: [
              { key: "label", label: "Measure" },
              { key: "dem", label: "Democratic side", align: "right" },
              { key: "rep", label: "Republican side", align: "right" },
            ],
            rows: bars.map((b) => ({ label: `${b.label} (${b.sublabel})`, dem: b.segments?.[0]?.value ?? null, rep: b.segments?.[1]?.value ?? null })),
          }}
        >
          {(width) => (
            <BarChart
              rows={bars}
              width={width}
              rowHeight={40}
              max={n}
              format={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
              valueLabel="Seats"
              ariaLabel={`${name}'s House delegation on the old and new lines`}
            />
          )}
        </ChartFrame>

        {curvePoints.length ? (
          <ChartFrame
            title="Seats Democrats carry, old map and new"
            subtitle="Seats where Democrats would lead at each national vote if every district moved with it (uniform swing)."
            height={CURVE_HEIGHT}
            csvName={`${postal.toLowerCase()}-redistricting-curve`}
            source="Source: 2024 presidential results by district on both maps, The Downballot; uniform swing."
            legend={
              <>
                <LegendItem shape="line" color="var(--muted)" label="2024 lines" />
                <LegendItem shape="line" color="var(--dem)" label="2026 lines" />
              </>
            }
            table={{
              columns: [
                { key: "env", label: "National vote", format: (v) => fmtMargin(Number(v)) },
                { key: "old", label: "D seats, 2024 lines", align: "right" },
                { key: "now", label: "D seats, 2026 lines", align: "right" },
              ],
              rows: curvePoints.map((p) => ({ env: p.env, old: p.old, now: p.now })),
            }}
          >
            {(width) => (
              <LineChart
                width={width}
                height={CURVE_HEIGHT}
                series={[
                  { key: "old", label: "2024 lines", color: "var(--muted)", points: curvePoints.map((p) => [p.env, p.old] as const) },
                  { key: "new", label: "2026 lines", color: "var(--dem)", points: curvePoints.map((p) => [p.env, p.now] as const) },
                ]}
                yDomain={[0, n]}
                xFormat={(v) => fmtMargin(v)}
                xTickFormat={(v) => fmtMargin(v, 0)}
                yFormat={(v) => String(Math.round(v))}
                yTickFormat={(v) => (Number.isInteger(v) ? String(v) : v.toFixed(1))}
                xLabel="National vote"
                yLabel="Democratic seats"
                refLines={[{ x: params.env, label: "Now", strong: true }]}
                ariaLabel={`Seats Democrats would carry in ${name} on the old and new maps across national votes`}
              />
            )}
          </ChartFrame>
        ) : hasOld ? (
          <Empty title="Seat curves by national vote are not loaded yet">
            Once the redistricting tables are in the dataset, this shows how many seats Democrats would carry on each map at every national vote.
          </Empty>
        ) : (
          <Empty title="The 2024 district lines are not loaded yet">
            The old-versus-new comparison for {name} appears here once results on the 2024 lines are in the dataset. Everything else on this
            page uses the new 2026 lines.
          </Empty>
        )}
      </div>

      {changes.length > 0 && (
        <div className="mt-6">
          <DataTable
            rows={changes}
            columns={changeColumns}
            rowKey={(r) => r.id}
            rowHref={(r) => href(houseHref(r.id))}
            initialSort={{ key: "shift", dir: "desc" }}
            csvName={`${postal.toLowerCase()}-district-changes`}
            maxHeight={480}
            caption={
              <>
                How each district&apos;s 2024 presidential margin changed with the new lines (same district number on both maps).{" "}
                <span className="font-semibold text-ink tabular-nums">{changes.filter((c) => c.flip).length}</span> changed hands at the top of the
                ticket.
              </>
            }
          />
        </div>
      )}
    </section>
  );
}
