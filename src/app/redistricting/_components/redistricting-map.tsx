"use client";

import { useMemo, useState } from "react";

import { LegendItem } from "@/components/charts/chart-frame";
import { HexMap } from "@/components/charts/hex-map";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { Card, SectionTitle } from "@/components/ui/primitives";
import { REDRAWN_2026 } from "@/lib/data/states";
import type { HexMap as HexMapData, HouseRace, RatingLabel } from "@/lib/data/types";
import { fmtMargin, fmtProb } from "@/lib/format";
import type { RaceProjection } from "@/lib/model/engine";
import { RATING_COLOR, RATING_ORDER, ratingFromProb } from "@/lib/ratings";
import { houseHref, stateHref } from "@/lib/routes";
import type { Basis, DistrictInfo } from "../_lib/derive";
import { Segmented } from "./segmented";

const TO_D = "var(--dem)";
const TO_R = "var(--rep)";

type View = "nine" | "nation";
const VIEWS = [
  { value: "nation", label: "All 435" },
  { value: "nine", label: "Nine states only" },
] as const;

export function RedistrictingMap({
  hexmap,
  house,
  districts,
  projections,
  basis,
}: {
  hexmap: HexMapData;
  house: HouseRace[];
  districts: DistrictInfo[];
  projections: Map<string, RaceProjection>;
  basis: Basis;
}) {
  const { href, params } = useScenario();
  const [view, setView] = useState<View>("nation");

  const byId = useMemo(() => new Map(house.map((r) => [r.id, r])), [house]);
  const infoById = useMemo(() => new Map(districts.map((d) => [d.id, d])), [districts]);
  const redrawnIds = useMemo(() => new Set(districts.map((d) => d.id)), [districts]);
  const flipIds = useMemo(() => new Set(districts.filter((d) => d.flip).map((d) => d.id)), [districts]);

  const map = useMemo<HexMapData>(() => {
    if (view === "nation") return hexmap;
    const states = new Set(REDRAWN_2026);
    return {
      ...hexmap,
      districts: hexmap.districts.filter((d) => states.has(d.state)),
      states: hexmap.states.filter((s) => states.has(s.state)),
    };
  }, [hexmap, view]);

  const category = (id: string): RatingLabel | null => {
    const p = projections.get(id);
    if (p) return ratingFromProb(p.pWin);
    return byId.get(id)?.rating ?? null;
  };

  const fill = (id: string): string => {
    const info = infoById.get(id);
    if (info?.flip === "toD") return TO_D;
    if (info?.flip === "toR") return TO_R;
    const c = category(id);
    return c ? RATING_COLOR[c] : "var(--r-toss)";
  };

  const flipsToD = districts.filter((d) => d.flip === "toD").length;
  const flipsToR = districts.filter((d) => d.flip === "toR").length;
  const leanLabel = basis === "pres" ? "2024 vote" : "lean";

  return (
    <Card>
      <SectionTitle
        title="Where the lines changed hands on paper"
        description={
          <>
            Outlined seats are notional flips: the party that holds the seat differs from the side its new lines lean to (by{" "}
            {basis === "pres" ? "the 2024 presidential result" : "lean at a tied national vote"}). Other seats show the model&apos;s
            category at {fmtMargin(params.env)}. Click a district to open it.
          </>
        }
        action={<Segmented label="Map extent" value={view} options={VIEWS} onChange={setView} />}
      />
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        <LegendItem color={TO_D} label={`Held by R, new lines lean D (${flipsToD})`} />
        <LegendItem color={TO_R} label={`Held by D, new lines lean R (${flipsToR})`} />
        <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
          <span>Others, model:</span>
          {RATING_ORDER.map((r) => (
            <span key={r} className="inline-flex items-center gap-1">
              <span aria-hidden className="size-2.5 rounded-sm" style={{ background: RATING_COLOR[r] }} />
              {r}
            </span>
          ))}
        </span>
      </div>
      <HexMap
        map={map}
        ariaLabel={`Hex map of ${view === "nine" ? "the nine redrawn states" : "all 435 districts with the nine redrawn states highlighted"}. ${flipsToD} seats held by Republicans now lean Democratic and ${flipsToR} held by Democrats now lean Republican.`}
        fill={fill}
        highlight={view === "nation" ? redrawnIds : null}
        selected={flipIds}
        hrefFor={(id) => href(houseHref(id))}
        stateHref={(st) => href(stateHref(st))}
        maxHeight={view === "nine" ? 520 : undefined}
        tooltip={(id) => {
          const race = byId.get(id);
          if (!race) return id;
          const info = infoById.get(id);
          const p = projections.get(id);
          return (
            <>
              <TipTitle>
                {id} · {race.stateName}
              </TipTitle>
              {info?.flip && (
                <div className="mb-1 font-medium text-ink">
                  Notional flip: held by {info.flip === "toD" ? "Republicans" : "Democrats"}, new lines lean{" "}
                  {info.flip === "toD" ? "Democratic" : "Republican"}
                </div>
              )}
              {!info && <div className="mb-1 text-ink-2">Lines unchanged for 2026</div>}
              <TipRow label="Held by" value={race.heldBy ? `${race.heldBy}${race.heldByMember ? ` (${race.heldByMember})` : ""}` : "—"} />
              <TipRow label="2024 vote, new lines" value={fmtMargin(race.pres24)} />
              {info?.oldPres24 != null && <TipRow label="2024 vote, old lines" value={fmtMargin(info.oldPres24)} />}
              <TipRow label="District lean" value={fmtMargin(race.lean)} />
              {p && <TipRow color="var(--dem)" label="Democrats win" value={fmtProb(p.pWin)} />}
              {info && <TipRow label={`Leans by ${leanLabel}`} value={info.newSide ?? "Even"} />}
            </>
          );
        }}
      />
      <p className="mt-2 text-[11px] text-muted">
        Equal-area map: every district is the same size. Congressional District Hexmap by Daniel Donner for{" "}
        <a href="https://the-db.co/maps" className="underline">
          The Downballot
        </a>{" "}
        (CC BY 4.0).
      </p>
    </Card>
  );
}
