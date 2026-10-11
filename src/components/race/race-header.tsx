"use client";

import Link from "next/link";

import { useScenario } from "@/components/scenario/scenario";
import { Badge, PageHeader, RatingChip } from "@/components/ui/primitives";
import { partyName } from "@/lib/format";
import { stateHref } from "@/lib/routes";
import { firstSentence, raceLongName, raceShortName, type AnyRace } from "./race-utils";

function incumbentLine(race: AnyRace): string {
  const party = race.incumbentParty ? ` (${race.incumbentParty})` : "";
  const status = race.incumbentStatus ? firstSentence(race.incumbentStatus) : "";
  if (race.incumbent && race.incumbentRunning && !race.openSeat) {
    const since = "firstElected" in race && race.firstElected ? `, first elected ${race.firstElected}` : "";
    return `Incumbent: ${race.incumbent}${party}${since}, running again.`;
  }
  const holder = race.incumbent || ("heldByMember" in race ? race.heldByMember : "");
  const holderParty = race.incumbent ? party : "heldBy" in race && race.heldBy ? ` (${race.heldBy})` : party;
  if (holder) return `Open seat: ${holder}${holderParty} is not running.${status && !/running$/i.test(status) ? ` ${status}.` : ""}`;
  return "Open seat: no incumbent is running.";
}

export function RaceHeader({ race, chamber }: { race: AnyRace; chamber: "house" | "senate" }) {
  const { href } = useScenario();
  const house = "district" in race ? race : null;

  const breadcrumbs =
    chamber === "house"
      ? [
          { label: "Overview", href: href("/") },
          { label: race.stateName, href: href(stateHref(race.state)) },
          { label: race.id },
        ]
      : [
          { label: "Overview", href: href("/") },
          { label: "Senate", href: href("/senate") },
          { label: race.stateName },
        ];

  const notional =
    house && house.heldBy && house.heldBy !== race.incumbentParty
      ? ` Notionally held by ${partyName(house.heldBy).toLowerCase() === "none" ? "no party" : `the ${partyName(house.heldBy)} Party`} on the 2026 lines.`
      : "";
  const otherInc = house?.otherIncumbents ? ` Other sitting members linked to this seat: ${house.otherIncumbents}.` : "";

  return (
    <PageHeader
      breadcrumbs={breadcrumbs}
      eyebrow={chamber === "house" ? `House race · ${race.id}` : `Senate race · ${race.state}${"specialElection" in race && race.specialElection ? " · Special election" : ""}`}
      title={chamber === "house" ? raceLongName(race) : raceShortName(race)}
      actions={
        <div className="flex flex-wrap items-center gap-1.5 pb-1">
          {race.ratingCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
              Forecasters <RatingChip rating={race.rating} />
            </span>
          ) : (
            <Badge>Not rated competitive</Badge>
          )}
          {house?.newLines && (
            <Link href={href("/redistricting")} className="rounded-full hover:opacity-80">
              <Badge tone="info">New 2026 lines</Badge>
            </Link>
          )}
          {race.openSeat && <Badge tone="info">Open seat</Badge>}
          {race.rankedChoice && <Badge tone="info">Ranked-choice</Badge>}
          {"specialElection" in race && race.specialElection && <Badge tone="info">Special election</Badge>}
        </div>
      }
      description={`${incumbentLine(race)}${notional}${otherInc}`}
    />
  );
}
