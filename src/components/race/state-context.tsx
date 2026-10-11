"use client";

import Link from "next/link";
import { useMemo } from "react";

import { LegendItem } from "@/components/charts/chart-frame";
import { HexMap } from "@/components/charts/hex-map";
import { MarginBar, ProbBar } from "@/components/charts/sparkline";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Card, RatingChip, SectionTitle } from "@/components/ui/primitives";
import type { HexMap as HexMapData, HouseRace } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { useProjections } from "@/lib/model/use-outlook";
import { RATING_COLOR, RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { houseHref, senateHref, stateHref } from "@/lib/routes";
import type { SenateLink } from "./types";

const HEX_CREDIT = (
  <>
    Equal-area map: every district is the same size. Congressional District Hexmap by Daniel Donner for{" "}
    <a href="https://the-db.co/maps" className="underline">
      The Downballot
    </a>{" "}
    (CC BY 4.0).
  </>
);

function holderText(r: HouseRace) {
  if (r.incumbent) return `${r.incumbent} (${r.incumbentParty || "?"})${r.incumbentRunning ? "" : ", not running"}`;
  return r.heldByMember ? `Open seat, held by ${r.heldByMember} (${r.heldBy || "?"})` : "Open seat";
}

/** The state's House districts colored by the model, this race outlined. */
export function StateMapCard({
  stateName,
  postal,
  map,
  races,
  projections,
  selectedId,
  className = "",
}: {
  stateName: string;
  postal: string;
  map: HexMapData;
  races: HouseRace[];
  projections: Map<string, RaceProjection>;
  selectedId?: string;
  className?: string;
}) {
  const { href, params } = useScenario();
  const byId = useMemo(() => new Map(races.map((r) => [r.id, r])), [races]);
  const selected = useMemo(() => (selectedId ? new Set([selectedId]) : null), [selectedId]);
  const category = (id: string) => {
    const p = projections.get(id);
    const r = byId.get(id);
    return p ? ratingFromProb(p.pWin) : (r?.rating ?? "Tossup");
  };
  const counts = RATING_ORDER.map((label) => ({ label, n: races.filter((r) => category(r.id) === label).length })).filter((c) => c.n > 0);
  const single = races.length === 1;

  return (
    <Card className={className}>
      <SectionTitle
        title={`${stateName}'s House ${single ? "seat" : `${races.length} districts`}`}
        description={`Colored by the model at a national vote of ${fmtMargin(params.env)}.${selectedId && !single ? ` ${selectedId} is outlined.` : ""} Click a district to open it.`}
        action={
          <Link href={href(stateHref(postal))} className="text-xs font-semibold underline underline-offset-2">
            {stateName} overview
          </Link>
        }
      />
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
        {counts.map((c) => (
          <LegendItem key={c.label} color={RATING_COLOR[c.label]} label={`${c.label} ${c.n}`} />
        ))}
      </div>
      <div className="mx-auto max-w-xl">
        <HexMap
          map={map}
          ariaLabel={`Map of ${stateName}'s House districts colored by the model's rating${selectedId ? `, with ${selectedId} outlined` : ""}`}
          fill={(id) => (byId.has(id) ? RATING_COLOR[category(id)] : "none")}
          hrefFor={(id) => href(houseHref(id))}
          stateHref={(st) => href(stateHref(st))}
          selected={selected}
          districtLabels
          showStateLabels={false}
          maxHeight={420}
          tooltip={(id) => {
            const r = byId.get(id);
            const p = projections.get(id);
            if (!r) return <TipTitle>{id}</TipTitle>;
            return (
              <>
                <TipTitle>
                  {id} · {r.stateName}
                </TipTitle>
                <div className="mb-1 text-ink-2">{holderText(r)}</div>
                {p && <TipRow color="var(--dem)" label={p.challenger === "I" ? "Independent wins" : "Democrat wins"} value={fmtProb(p.pWin)} />}
                {p && <TipRow label="Expected margin" value={fmtMargin(p.margin)} />}
                <TipRow label="Forecasters" value={r.ratingCount ? r.rating : "Not rated"} />
                <TipRow label="District lean" value={fmtMargin(r.lean)} />
              </>
            );
          }}
        />
      </div>
      <p className="mt-2 text-[11px] leading-4 text-muted">{HEX_CREDIT}</p>
    </Card>
  );
}

/** Six seats that lean most like this one, among the seats forecasters rate. */
export function SimilarSeats({ race, similar, className = "" }: { race: HouseRace; similar: HouseRace[]; className?: string }) {
  const { href } = useScenario();
  const projections = useProjections(similar);
  return (
    <Card className={className}>
      <SectionTitle
        title="Similar seats"
        description={`Rated seats with the closest lean to ${race.id} (${fmtMargin(race.lean)}).`}
        action={
          similar.length > 0 ? (
            <Link href={href(`/house?ids=${[race.id, ...similar.map((s) => s.id)].join(",")}`)} className="text-xs font-semibold underline underline-offset-2">
              Compare
            </Link>
          ) : undefined
        }
      />
      {similar.length === 0 ? (
        <p className="text-sm text-ink-2">No rated seats to compare with.</p>
      ) : (
        <ul className="divide-y divide-line">
          {similar.map((s) => {
            const p = projections.get(s.id);
            return (
              <li key={s.id}>
                <Link href={href(houseHref(s.id))} className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 hover:bg-surface-2">
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-ink">
                      {s.id} <span className="font-normal text-ink-2">· {s.stateName}</span>
                    </span>
                    <span className="block truncate text-xs text-ink-2">
                      Lean {fmtMargin(s.lean)}
                      {p ? ` · Democrat ${fmtProb(p.pWin)}` : ""}
                    </span>
                  </span>
                  <RatingChip rating={s.rating} size="xs" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/** Also on the ballot: the state's Senate race, linked from district pages. */
export function SenateLinkCard({ senate }: { senate: SenateLink }) {
  const { href } = useScenario();
  return (
    <Link href={href(senateHref(senate.state))} className="block rounded-xl border border-line bg-surface p-4 transition-colors hover:bg-surface-2">
      <div className="text-xs font-medium text-ink-2">Also on the ballot</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-ink">
          {senate.stateName} Senate{senate.specialElection ? " (special)" : ""}
        </span>
        <RatingChip rating={senate.rating} size="xs" />
      </div>
      <div className="mt-1 text-xs text-ink-2">Open the Senate race page</div>
    </Link>
  );
}

/** Senate pages: every House race in the state, with the model's numbers in this scenario. */
export function HouseRacesTable({
  stateName,
  races,
  projections,
}: {
  stateName: string;
  races: HouseRace[];
  projections: Map<string, RaceProjection>;
}) {
  const { href } = useScenario();
  const columns: Column<HouseRace>[] = [
    { key: "id", header: "District", value: (r) => r.id },
    { key: "held", header: "Held by", value: (r) => r.heldBy || "", align: "center" },
    {
      key: "candidates",
      header: "D vs R",
      value: (r) => `${r.dem || "—"} vs ${r.rep || "—"}`,
      cell: (r) => (
        <span className="block max-w-56 truncate text-ink-2" title={`${r.dem || "—"} vs ${r.rep || "—"}`}>
          {r.dem || "—"} vs {r.rep || "—"}
        </span>
      ),
      hideOnMobile: true,
    },
    { key: "lean", header: "Lean", value: (r) => r.lean, cell: (r) => fmtMargin(r.lean), align: "right", hideOnMobile: true },
    {
      key: "margin",
      header: "Expected",
      value: (r) => projections.get(r.id)?.margin ?? null,
      cell: (r) => {
        const p = projections.get(r.id);
        return p ? (
          <span className="inline-flex items-center gap-2">
            {fmtMargin(p.margin)}
            <MarginBar value={p.margin} max={15} width={56} height={12} />
          </span>
        ) : (
          "—"
        );
      },
      align: "right",
    },
    {
      key: "chance",
      header: "Chance D",
      value: (r) => projections.get(r.id)?.pWin ?? null,
      cell: (r) => {
        const p = projections.get(r.id);
        return p ? (
          <span className="inline-flex items-center gap-2">
            <ProbBar p={p.pWin} width={56} height={12} />
            {fmtProb(p.pWin)}
          </span>
        ) : (
          "—"
        );
      },
      align: "right",
    },
    {
      key: "rating",
      header: "Forecasters",
      value: (r) => (r.ratingCount ? r.rating : "Not rated"),
      cell: (r) => (r.ratingCount ? <RatingChip rating={r.rating} size="xs" /> : <span className="text-xs text-muted">Not rated</span>),
    },
  ];
  return (
    <div>
      <SectionTitle title={`House races in ${stateName}`} description="Rows open each district. Model numbers follow the scenario." />
      <DataTable
        rows={races}
        columns={columns}
        rowKey={(r) => r.id}
        rowHref={(r) => href(houseHref(r.id))}
        csvName={`${stateName.toLowerCase().replace(/\s+/g, "-")}-house-races`}
        initialSort={{ key: "margin", dir: "desc" }}
        caption={
          <>
            <span className="font-semibold text-ink tabular-nums">{races.length}</span> {races.length === 1 ? "district" : "districts"}
          </>
        }
      />
    </div>
  );
}
