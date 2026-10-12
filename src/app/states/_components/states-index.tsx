"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Segmented } from "@/components/ui/segmented";
import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { MarginBar } from "@/components/charts/sparkline";
import { StateTileMap, tileMapHeight } from "@/components/charts/tile-map";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Badge, Card, Empty, PageHeader, RatingChip, Stat } from "@/components/ui/primitives";
import { HOUSE_SEATS, REDRAWN_2026, STATES } from "@/lib/data/states";
import type { RatingLabel } from "@/lib/data/types";
import { fmtDate, fmtMargin, fmtProb, signed } from "@/lib/format";
import { useProjections } from "@/lib/model/use-outlook";
import { RATING_COLOR, isCompetitive } from "@/lib/ratings";
import { senateHref, stateHref } from "@/lib/routes";
import { useQueryParam } from "@/lib/url-state";
import {
  NET_BUCKETS,
  expectedSeats,
  fmtNet,
  fmtNetLong,
  fmtNetShort,
  heldCounts,
  netBucket,
  netColor,
  type StateIndexRace,
  type StateIndexSenate,
} from "./shared";

interface StateRow {
  postal: string;
  name: string;
  seats: number;
  heldD: number;
  heldR: number;
  heldOther: number;
  expD: number;
  expR: number;
  net: number;
  competitive: number;
  tossups: number;
  newMap: boolean;
  senate: { rating: RatingLabel; pWin: number; challenger: "D" | "I"; special: boolean } | null;
}

type ColorBy = "net" | "competitive";
type Show = "all" | "changing" | "senate" | "newmap" | "tossups";

const SHOW_OPTIONS: { key: Show; label: string }[] = [
  { key: "all", label: "All states" },
  { key: "changing", label: "Seats expected to change" },
  { key: "tossups", label: "Has toss-ups" },
  { key: "senate", label: "Senate race" },
  { key: "newmap", label: "New map" },
];

const parseColorBy = (raw: string): ColorBy | undefined => (raw === "net" || raw === "competitive" ? raw : undefined);
const parseShow = (raw: string): Show | undefined => (SHOW_OPTIONS.some((o) => o.key === raw) ? (raw as Show) : undefined);

const MAX_TILE = 56;
const MAP_HEIGHT = tileMapHeight(320, MAX_TILE);

/** Sequential steps for the count of competitive seats. */
function competitiveFill(n: number): string | null {
  if (n <= 0) return null;
  if (n === 1) return "var(--m-1)";
  if (n === 2) return "var(--m-2)";
  if (n <= 4) return "var(--m-3)";
  if (n <= 7) return "var(--m-4)";
  if (n <= 11) return "var(--m-5)";
  return "var(--m-6)";
}

const COMPETITIVE_LEGEND = [
  { color: "var(--m-1)", label: "1" },
  { color: "var(--m-2)", label: "2" },
  { color: "var(--m-3)", label: "3–4" },
  { color: "var(--m-4)", label: "5–7" },
  { color: "var(--m-5)", label: "8–11" },
  { color: "var(--m-6)", label: "12+" },
];

function matches(row: StateRow, show: Show): boolean {
  switch (show) {
    case "changing":
      return Math.round(row.net) !== 0;
    case "senate":
      return row.senate != null;
    case "newmap":
      return row.newMap;
    case "tossups":
      return row.tossups > 0;
    default:
      return true;
  }
}

export function StatesIndex({
  races,
  senate,
  generated,
}: {
  races: StateIndexRace[];
  senate: StateIndexSenate[];
  generated: string;
}) {
  const { params, href } = useScenario();
  const houseProj = useProjections(races);
  const senateProj = useProjections(senate);
  const [colorBy, setColorBy] = useQueryParam<ColorBy>("color", "net", parseColorBy);
  const [show, setShow] = useQueryParam<Show>("show", "all", parseShow);

  const rows = useMemo<StateRow[]>(() => {
    const byState = new Map<string, StateIndexRace[]>();
    for (const r of races) {
      const list = byState.get(r.state);
      if (list) list.push(r);
      else byState.set(r.state, [r]);
    }
    const senateByState = new Map(senate.map((s) => [s.state, s]));
    return STATES.map((st) => {
      const list = byState.get(st.postal) ?? [];
      const held = heldCounts(list);
      const exp = expectedSeats(list.map((r) => houseProj.get(r.id)));
      const sen = senateByState.get(st.postal);
      const sp = sen ? senateProj.get(sen.id) : undefined;
      return {
        postal: st.postal,
        name: st.name,
        seats: list.length || st.seats,
        heldD: held.dem,
        heldR: held.rep,
        heldOther: held.other,
        expD: exp.dem,
        expR: exp.rep,
        net: exp.dem - held.dem,
        competitive: list.filter((r) => isCompetitive(r.rating)).length,
        tossups: list.filter((r) => r.rating === "Tossup").length,
        newMap: REDRAWN_2026.includes(st.postal),
        senate: sen && sp ? { rating: sen.rating, pWin: sp.pWin, challenger: sp.challenger, special: sen.specialElection } : null,
      };
    });
  }, [races, senate, houseProj, senateProj]);

  const byPostal = useMemo(() => new Map(rows.map((r) => [r.postal, r])), [rows]);
  const visible = useMemo(() => rows.filter((r) => matches(r, show)), [rows, show]);
  const selected = useMemo(() => (show === "all" ? null : new Set(visible.map((r) => r.postal))), [visible, show]);

  const totals = useMemo(() => {
    const heldD = rows.reduce((s, r) => s + r.heldD, 0);
    const heldR = rows.reduce((s, r) => s + r.heldR, 0);
    const expD = rows.reduce((s, r) => s + r.expD, 0);
    const dGain = rows.filter((r) => Math.round(r.net) >= 1).sort((a, b) => b.net - a.net);
    const rGain = rows.filter((r) => Math.round(r.net) <= -1).sort((a, b) => a.net - b.net);
    return { heldD, heldR, expD, net: expD - heldD, dGain, rGain };
  }, [rows]);

  const changing = useMemo<BarRow[]>(
    () =>
      rows
        .filter((r) => Math.round(r.net) !== 0)
        .sort((a, b) => b.net - a.net)
        .map((r) => ({
          key: r.postal,
          label: r.name,
          sublabel: `${r.seats} ${r.seats === 1 ? "seat" : "seats"}`,
          value: Number(r.net.toFixed(2)),
          color: netColor(r.net),
          href: href(stateHref(r.postal)),
        })),
    [rows, href],
  );

  const fill = (postal: string): string | null => {
    const r = byPostal.get(postal);
    if (!r) return null;
    return colorBy === "net" ? netColor(r.net) : competitiveFill(r.competitive);
  };
  const label = (postal: string): string | null => {
    const r = byPostal.get(postal);
    if (!r) return null;
    if (colorBy === "net") return Math.round(r.net) === 0 ? null : fmtNet(r.net);
    return r.competitive > 0 ? String(r.competitive) : null;
  };

  const tooltip = (postal: string) => {
    const r = byPostal.get(postal);
    if (!r) return null;
    return (
      <>
        <TipTitle>{r.name}</TipTitle>
        <TipRow label="House seats" value={r.seats} />
        <TipRow label="Held now (D–R)" value={`${r.heldD}–${r.heldR}${r.heldOther ? ` (+${r.heldOther} other)` : ""}`} />
        <TipRow label="Expected (D–R)" value={`${r.expD.toFixed(1)}–${r.expR.toFixed(1)}`} />
        <TipRow color={netColor(r.net)} label="Net change" value={fmtNetLong(r.net)} />
        <TipRow label="Competitive seats" value={r.competitive} />
        <TipRow label="Senate" value={r.senate ? r.senate.rating : "No race"} />
        <div className="mt-1 text-[11px] text-muted">Click to open the state</div>
      </>
    );
  };

  const maxNet = Math.max(1, ...rows.map((r) => Math.abs(r.net)));

  const columns: Column<StateRow>[] = [
    {
      key: "state",
      header: "State",
      value: (r) => r.name,
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <span className="w-6 text-xs font-semibold text-ink-2">{r.postal}</span>
          {r.name}
        </span>
      ),
    },
    { key: "seats", header: "Seats", value: (r) => r.seats, align: "right" },
    { key: "heldD", header: "Held D", value: (r) => r.heldD, align: "right" },
    { key: "heldR", header: "Held R", value: (r) => r.heldR, align: "right" },
    {
      key: "expD",
      header: "Expected D",
      value: (r) => Number(r.expD.toFixed(1)),
      cell: (r) => r.expD.toFixed(1),
      align: "right",
    },
    {
      key: "net",
      header: "Net change",
      value: (r) => Number(r.net.toFixed(1)),
      cell: (r) => (
        <span className="inline-flex items-center gap-2">
          <MarginBar value={r.net} max={maxNet} width={52} height={12} />
          <span className="w-10 text-right">{signed(r.net)}</span>
        </span>
      ),
      align: "right",
    },
    { key: "competitive", header: "Competitive", value: (r) => r.competitive, align: "right" },
    { key: "tossups", header: "Toss-ups", value: (r) => r.tossups, align: "right" },
    {
      key: "senate",
      header: "Senate race",
      value: (r) => r.senate?.rating ?? "No race",
      cell: (r) =>
        r.senate ? (
          <span className="inline-flex items-center gap-1.5">
            <RatingChip rating={r.senate.rating} size="xs" />
            {r.senate.special && <span className="text-[10px] text-muted">special</span>}
          </span>
        ) : (
          <span className="text-xs text-muted">No race</span>
        ),
    },
    {
      key: "senateChance",
      header: "Senate, chance D",
      value: (r) => (r.senate ? Number(r.senate.pWin.toFixed(3)) : null),
      cell: (r) =>
        r.senate ? (
          <span>
            {fmtProb(r.senate.pWin)}
            {r.senate.challenger === "I" && <span className="ml-1 text-[10px] text-muted">Ind.</span>}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
      align: "right",
      hideOnMobile: true,
    },
    {
      key: "newMap",
      header: "Map",
      value: (r) => (r.newMap ? "New 2026 map" : ""),
      cell: (r) => (r.newMap ? <Badge tone="info">New map</Badge> : null),
    },
  ];

  const scenarioNote = `model at a national vote of ${fmtMargin(params.env)}`;

  return (
    <div className="pb-8">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: href("/") }, { label: "States" }]}
        eyebrow="Nation → state → district"
        title="Every state's House delegation"
        description={`How each delegation looks now, and how it is expected to look after November in this scenario (national vote ${fmtMargin(params.env)}). Click a state to see its districts and Senate race. Data updated ${fmtDate(generated)}.`}
      />

      <section aria-label="Headline numbers" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Expected net change"
          value={fmtNetShort(totals.net)}
          detail={`Expected ${Math.round(totals.expD)} D · ${HOUSE_SEATS - Math.round(totals.expD)} R, against ${totals.heldD}–${totals.heldR} held now`}
          accent={netColor(totals.net)}
          href={href("/house")}
        />
        <Stat
          label="States where Democrats gain"
          value={totals.dGain.length}
          detail={totals.dGain.length ? `Most: ${totals.dGain.slice(0, 3).map((r) => `${r.postal} ${fmtNet(r.net)}`).join(", ")}` : "No state gains a full seat"}
          accent="var(--dem)"
        />
        <Stat
          label="States where Republicans gain"
          value={totals.rGain.length}
          detail={totals.rGain.length ? `Most: ${totals.rGain.slice(0, 3).map((r) => `${r.postal} ${fmtNet(r.net)}`).join(", ")}` : "No state gains a full seat"}
          accent="var(--rep)"
        />
        <Stat
          label="States on new maps"
          value={REDRAWN_2026.length}
          detail={REDRAWN_2026.join(", ")}
          href={href("/redistricting")}
        />
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-5">
        <ChartFrame
          className="lg:col-span-3"
          title={colorBy === "net" ? "Expected net seat change for Democrats" : "Competitive House seats by state"}
          subtitle={
            colorBy === "net"
              ? "Expected Democratic seats in this scenario minus the seats Democrats hold now. Every state is the same size."
              : "Seats the forecasters' consensus does not rate Safe. Every state is the same size."
          }
          height={MAP_HEIGHT}
          csvName={colorBy === "net" ? "states-net-change" : "states-competitive-seats"}
          source={`Source: ratings from 10 forecasters via Wikipedia; 2024 presidential results by The Downballot; ${scenarioNote}.`}
          actions={
            <Segmented
              label="Color states by"
              size="xs"
              value={colorBy}
              onChange={(m) => setColorBy(m === "net" ? null : m)}
              options={[
                { value: "net", label: "Net change" },
                { value: "competitive", label: "Competitive" },
              ]}
            />
          }
          legend={
            colorBy === "net" ? (
              NET_BUCKETS.map((b) => (
                <LegendItem
                  key={b.key}
                  color={RATING_COLOR[b.color]}
                  label={`${b.label} (${rows.filter((r) => netBucket(r.net) === b.key).length})`}
                />
              ))
            ) : (
              <>
                <span>Competitive seats:</span>
                {COMPETITIVE_LEGEND.map((l) => (
                  <LegendItem key={l.label} color={l.color} label={l.label} />
                ))}
                <LegendItem color="var(--surface-2)" label="None" />
              </>
            )
          }
          table={{
            columns: [
              { key: "postal", label: "State" },
              { key: "name", label: "Name" },
              { key: "seats", label: "Seats", align: "right" },
              { key: "heldD", label: "Held D", align: "right" },
              { key: "heldR", label: "Held R", align: "right" },
              { key: "expD", label: "Expected D", align: "right", format: (v) => Number(v).toFixed(1) },
              { key: "net", label: "Net change for D", align: "right", format: (v) => signed(Number(v)) },
              { key: "competitive", label: "Competitive seats", align: "right" },
            ],
            rows: rows.map((r) => ({
              postal: r.postal,
              name: r.name,
              seats: r.seats,
              heldD: r.heldD,
              heldR: r.heldR,
              expD: Number(r.expD.toFixed(2)),
              net: Number(r.net.toFixed(2)),
              competitive: r.competitive,
            })),
          }}
        >
          {(width) => (
            <StateTileMap
              width={width}
              maxTile={MAX_TILE}
              fill={fill}
              label={label}
              tooltip={tooltip}
              hrefFor={(postal) => href(stateHref(postal))}
              selected={selected}
              ariaLabel={
                colorBy === "net"
                  ? `Tile map of the 50 states colored by expected net House seat change for Democrats. ${totals.dGain.length} states gain Democratic seats and ${totals.rGain.length} gain Republican seats.`
                  : "Tile map of the 50 states shaded by the number of competitive House seats."
              }
            />
          )}
        </ChartFrame>

        {changing.length ? (
          <ChartFrame
            className="lg:col-span-2"
            title="Where seats are expected to change hands"
            subtitle="States whose expected delegation differs from today's by at least a seat (rounded). Bars right: Democratic gains; left: Republican gains."
            height={barChartHeight(changing.length, 28)}
            csvName="states-expected-seat-change"
            source={`Source: ${scenarioNote}; seats held now from Wikipedia.`}
            table={{
              columns: [
                { key: "label", label: "State" },
                { key: "value", label: "Net change for D", align: "right", format: (v) => signed(Number(v)) },
              ],
              rows: changing.map((r) => ({ label: r.label, value: r.value })),
            }}
          >
            {(width) => (
              <BarChart
                rows={changing}
                width={width}
                rowHeight={28}
                format={(v) => signed(v)}
                tickFormat={(v) => signed(v, 0)}
                valueLabel="Expected net change for Democrats"
                clickHint="Click to open the state"
                ariaLabel={`Expected net House seat change for Democrats in ${changing.length} states`}
              />
            )}
          </ChartFrame>
        ) : (
          <div className="lg:col-span-2">
            <Empty title="No delegation is expected to change by a full seat">
              At a national vote of {fmtMargin(params.env)}, every state&apos;s expected delegation rounds to the seats each party holds now.
            </Empty>
          </div>
        )}
      </div>

      <div className="mt-6">
        <DataTable
          rows={visible}
          columns={columns}
          rowKey={(r) => r.postal}
          rowHref={(r) => href(stateHref(r.postal))}
          initialSort={{ key: "state", dir: "asc" }}
          csvName="states"
          maxHeight={720}
          caption={
            <span>
              <span className="font-semibold text-ink tabular-nums">{visible.length}</span> of 50 states · expected seats in this scenario
            </span>
          }
          toolbar={
            <label className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              <span className="sr-only sm:not-sr-only">Show</span>
              <select
                value={show}
                onChange={(e) => setShow(e.target.value === "all" ? null : (e.target.value as Show))}
                className="rounded-md border border-line bg-surface px-2 py-1 text-xs text-ink"
              >
                {SHOW_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
          }
          emptyMessage="No state matches this filter in the current scenario."
        />
        <p className="mt-2 text-xs leading-5 text-ink-2">
          Expected seats add up each district&apos;s chance of electing a Democrat, so they can be fractional. Net change compares them with
          the party holding each seat&apos;s predecessor district now (the notional holder). Competitive means the forecasters&apos; consensus is
          not Safe. Senate ratings are the forecasters&apos; consensus; the chance column is this model.{" "}
          {show !== "all" && "Outlined tiles on the map match the table filter. "}
          <Link href={href("/methodology")} className="font-medium underline underline-offset-2">
            How the model works
          </Link>
          {" · "}
          <Link href={href("/senate")} className="font-medium underline underline-offset-2">
            Senate dashboard
          </Link>
        </p>
      </div>

      <Card className="mt-6">
        <h2 className="text-base font-semibold text-ink">Senate races by state</h2>
        <p className="mt-0.5 text-sm text-ink-2">{senate.length} seats are up in 2026. Each links to its race page.</p>
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {rows
            .filter((r) => r.senate)
            .map((r) => (
              <li key={r.postal}>
                <Link
                  href={href(senateHref(r.postal))}
                  className="flex items-center justify-between gap-2 rounded-lg border border-line px-2.5 py-2 text-sm hover:bg-surface-2"
                >
                  <span className="truncate font-medium">{r.name}</span>
                  <span className="shrink-0 text-xs text-ink-2 tabular-nums">{fmtProb(r.senate!.pWin)}</span>
                </Link>
              </li>
            ))}
        </ul>
        <p className="mt-2 text-[11px] text-muted">Chance the Democrat (or independent, where no Democrat runs) wins, in this scenario.</p>
      </Card>
    </div>
  );
}
