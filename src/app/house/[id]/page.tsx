import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { houseRaceData } from "@/components/race/load";
import { RacePage } from "@/components/race/race-page";
import { matchupShort, raceLongName } from "@/components/race/race-utils";
import { getHouseRace, house } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };

export function generateStaticParams() {
  return house.map((r) => ({ id: r.id.toLowerCase() }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const race = getHouseRace(id);
  if (!race) return { title: "District not found" };
  const matchup = matchupShort(race);
  return {
    title: matchup ? `${race.id}: ${matchup}` : race.id,
    description: `${raceLongName(race)} in the 2026 House elections: candidates, all 10 forecasters' ratings, the model's chance at any national vote, money and similar seats.`,
  };
}

export default async function HouseRacePage({ params }: Props) {
  const { id } = await params;
  const race = getHouseRace(id);
  if (!race || id !== race.id.toLowerCase()) notFound();
  return <RacePage data={houseRaceData(race)} />;
}
