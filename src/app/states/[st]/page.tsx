import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import {
  hexmapForState,
  houseInState,
  meta,
  oldLines,
  redistricting,
  redistrictingCurve,
  redistrictingDistricts,
  senate,
} from "@/lib/data";
import { REDRAWN_2026, STATES, STATE_BY_POSTAL } from "@/lib/data/states";
import { StateDashboard } from "../_components/state-dashboard";
import { StateSkeleton } from "../_components/state-skeleton";

type Props = { params: Promise<{ st: string }> };

export function generateStaticParams() {
  return STATES.map((s) => ({ st: s.postal.toLowerCase() }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { st } = await params;
  const info = STATE_BY_POSTAL[st.toUpperCase()];
  if (!info) return { title: "State not found" };
  const races = houseInState(info.postal);
  const hasSenate = senate.some((r) => r.state === info.postal);
  return {
    title: `${info.name}: House delegation and Senate race`,
    description: `${info.name}'s ${races.length} House ${races.length === 1 ? "seat" : "seats"}${hasSenate ? " and its 2026 Senate race" : ""}: who holds them now, the forecasters' ratings and a live scenario model.`,
  };
}

// The params read sits inside Suspense so the route's shared App Shell stays URL-independent;
// every state is prerendered by generateStaticParams, so real visits get the full page.
export default function StatePage({ params }: Props) {
  return (
    <Suspense fallback={<StateSkeleton />}>
      <StateContent params={params} />
    </Suspense>
  );
}

async function StateContent({ params }: Props) {
  const { st } = await params;
  // Canonical URLs are lowercase (see src/lib/routes.ts); anything else is not a page.
  if (st !== st.toLowerCase()) notFound();
  const info = STATE_BY_POSTAL[st.toUpperCase()];
  if (!info) notFound();

  const postal = info.postal;
  const inState = (row: { state?: unknown }) => String(row.state ?? "").toUpperCase() === postal;
  const redrawn = REDRAWN_2026.includes(postal);
  const races = houseInState(postal);

  return (
    <StateDashboard
      postal={postal}
      name={info.name}
      races={races}
      senate={senate.filter((r) => r.state === postal)}
      hexmap={hexmapForState(postal)}
      redrawn={redrawn}
      oldLines={redrawn ? oldLines.filter(inState) : []}
      redistrictingSummary={redrawn ? (redistricting.find(inState) ?? null) : null}
      redistrictingDistricts={redrawn ? redistrictingDistricts.filter(inState) : []}
      redistrictingCurve={redrawn ? redistrictingCurve.filter(inState) : []}
      generated={meta.generated}
      hexmapCredit={meta.sources.downballot_hexmap?.name ?? "Congressional District Hexmap by Daniel Donner for The Downballot"}
    />
  );
}
