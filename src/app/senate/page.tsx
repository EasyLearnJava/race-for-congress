import type { Metadata } from "next";

import { meta, money, outside, ratings, senate, senateComposition } from "@/lib/data";
import { SenateDashboard } from "./_components/senate-dashboard";

export const metadata: Metadata = {
  title: "Senate",
  description:
    "Control of the Senate in 2026: chance of control, expected seats, every race on a state map, the seat distribution and how it moves with the national vote.",
};

export default function SenatePage() {
  const composition = senateComposition();
  const senateRatings = ratings.filter((r) => r.chamber === "senate");
  const forecasters = [...new Set(senateRatings.map((r) => r.source))].sort();
  const ratingsAsOf = senateRatings.reduce((latest, r) => (r.asOf > latest ? r.asOf : latest), "");

  return (
    <SenateDashboard
      senate={senate}
      composition={composition}
      generated={meta.generated}
      environment={meta.environment ?? null}
      forecasters={forecasters}
      ratingsAsOf={ratingsAsOf || null}
      money={money.filter((m) => m.chamber === "senate")}
      outside={outside.filter((o) => o.chamber === "senate")}
    />
  );
}
