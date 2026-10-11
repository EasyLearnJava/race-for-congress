import type { Metadata } from "next";

import { genericBallot, house, meta, ratings, senate, senateComposition } from "@/lib/data";
import type { HouseRace, SenateRace } from "@/lib/data/types";
import { Simulator } from "./_components/simulator";
import type { Composition, Environment, PollRow, SimRace } from "./_components/types";

export const metadata: Metadata = {
  title: "Scenario lab",
  description:
    "Set the national vote, the weight on forecaster ratings, incumbency and uncertainty, and see what happens to control of the House and Senate in 2026.",
};

const base = (r: HouseRace | SenateRace) => ({
  id: r.id,
  lean: r.lean,
  incumbentRunning: r.incumbentRunning,
  incumbentParty: r.incumbentParty,
  special: r.special,
  ratingScore: r.ratingScore,
  ratingCount: r.ratingCount,
  state: r.state,
  stateName: r.stateName,
  rep: r.rep,
  incumbent: r.incumbent,
  rating: r.rating,
});

function independentName(r: SenateRace): string {
  const entry = r.others.split(";").find((o) => o.includes("Independent"));
  return entry ? entry.replace(/\s*\(.*\)\s*$/, "").trim() : "";
}

export default function SimulatorPage() {
  const houseRaces: SimRace[] = house.map((r) => ({ ...base(r), chamber: "house", heldBy: r.heldBy, left: r.dem }));
  const senateRaces: SimRace[] = senate.map((r) => ({
    ...base(r),
    chamber: "senate",
    heldBy: r.incumbentParty,
    left: r.special === "independent_vs_R" ? independentName(r) : r.dem,
  }));
  const { source: compositionSource, ...composition } = senateComposition();
  const env = meta.environment;
  const environment: Environment | null = env
    ? { margin: env.margin, asOf: env.as_of, nSources: env.n_sources, sources: env.sources }
    : null;
  const polls: PollRow[] = genericBallot.map((p) => ({
    source: p.source,
    dates: p.dates,
    updated: p.updated,
    dem: p.dem,
    rep: p.rep,
    margin: p.margin,
  }));

  return (
    <Simulator
      house={houseRaces}
      senate={senateRaces}
      composition={composition satisfies Composition}
      compositionDerived={compositionSource === "derived"}
      environment={environment}
      polls={polls}
      generated={meta.generated}
      ratingSources={[...new Set(ratings.map((r) => r.source))].sort()}
    />
  );
}
