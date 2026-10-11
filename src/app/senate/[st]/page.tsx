import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { senateRaceData } from "@/components/race/load";
import { RacePage } from "@/components/race/race-page";
import { matchupShort, raceShortName } from "@/components/race/race-utils";
import { senate, senateInState } from "@/lib/data";

type Props = { params: Promise<{ st: string }> };

export function generateStaticParams() {
  return senate.map((r) => ({ st: r.state.toLowerCase() }));
}

function raceFor(st: string) {
  // Only the canonical lowercase two-letter path is a page (/senate/tx).
  if (!/^[a-z]{2}$/.test(st)) return undefined;
  return senateInState(st);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { st } = await params;
  const race = raceFor(st);
  if (!race) return { title: "Senate race not found" };
  const matchup = matchupShort(race);
  return {
    title: matchup ? `${raceShortName(race)}: ${matchup}` : raceShortName(race),
    description: `The 2026 ${raceShortName(race)} race: candidates, forecasters' ratings, the model's chance at any national vote, money and the state's House races.`,
  };
}

export default async function SenateRacePage({ params }: Props) {
  const { st } = await params;
  const race = raceFor(st);
  if (!race) notFound();
  return <RacePage data={senateRaceData(race)} />;
}
