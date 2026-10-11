// Pure helpers shared by the race page components and the route files (metadata).
import type { HouseRace, Party, SenateRace } from "@/lib/data/types";
import { districtName, fmtMargin } from "@/lib/format";

export type AnyRace = HouseRace | SenateRace;

export interface Candidate {
  name: string;
  party: Party;
  /** Party name as written on the ballot ("Libertarian", "No Labels"). */
  partyLabel: string;
  incumbent: boolean;
}

const LABEL_TO_PARTY: Record<string, Party> = {
  Democratic: "D",
  Democrat: "D",
  Republican: "R",
  Independent: "I",
  Libertarian: "L",
  Green: "G",
};

/** "A / B" -> ["A", "B"]. */
export function splitNames(s: string): string[] {
  return s
    .split(" / ")
    .map((x) => x.trim())
    .filter(Boolean);
}

/** "Bill Hill (Independent); Jim McDermott (Libertarian)" -> [{ name, partyLabel, party }]. */
export function parseOthers(others: string): { name: string; partyLabel: string; party: Party }[] {
  return others
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((entry) => {
      const m = /^(.*?)\s*\(([^)]*)\)\s*$/.exec(entry);
      const name = m ? m[1] : entry;
      const partyLabel = m ? m[2] : "Other";
      return { name, partyLabel, party: LABEL_TO_PARTY[partyLabel] ?? "O" };
    });
}

const tokens = (name: string) =>
  name
    .toLowerCase()
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter((t) => t && !/^(jr|sr|ii|iii|iv)$/.test(t));

/** Loose match between a ballot name and the incumbent's name (first and last name agree). */
export function samePerson(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.length || !tb.length) return false;
  return ta[0] === tb[0] && ta[ta.length - 1] === tb[tb.length - 1];
}

export function candidatesOf(race: AnyRace): Candidate[] {
  const inc = race.incumbentRunning ? race.incumbent : "";
  const mark = (name: string) => samePerson(name, inc);
  return [
    ...splitNames(race.dem).map((name) => ({ name, party: "D" as Party, partyLabel: "Democratic", incumbent: mark(name) })),
    ...splitNames(race.rep).map((name) => ({ name, party: "R" as Party, partyLabel: "Republican", incumbent: mark(name) })),
    ...parseOthers(race.others).map((o) => ({ ...o, incumbent: mark(o.name) })),
  ];
}

/** The candidate on the positive side of the model's margin: the Democrat, or the independent where no Democrat runs. */
export function challengerName(race: AnyRace): string {
  if (race.special === "independent_vs_R") {
    const ind = parseOthers(race.others).find((o) => o.party === "I");
    return ind?.name ?? "";
  }
  return splitNames(race.dem)[0] ?? "";
}

export function lastName(name: string): string {
  const t = name
    .replace(/[.,]/g, "")
    .split(/\s+/)
    .filter((x) => x && !/^(Jr|Sr|II|III|IV)$/.test(x));
  return t[t.length - 1] ?? name;
}

/** "Brooks vs Mackenzie": the non-Republican side first (Democrats on the left), then the Republican. */
export function matchupShort(race: AnyRace): string {
  const left = challengerName(race);
  const right = splitNames(race.rep)[0] ?? "";
  if (race.special === "same_party_D" || race.special === "same_party_R") {
    const names = splitNames(race.special === "same_party_D" ? race.dem : race.rep);
    if (names.length >= 2) return `${lastName(names[0])} vs ${lastName(names[1])}`;
  }
  if (left && right) return `${lastName(left)} vs ${lastName(right)}`;
  return left ? lastName(left) : right ? lastName(right) : "";
}

/** Short page name: "PA-07" or "Texas Senate". */
export function raceShortName(race: AnyRace): string {
  if ("district" in race) return race.id;
  return `${race.stateName} Senate${race.specialElection ? " (special)" : ""}`;
}

export function raceLongName(race: AnyRace): string {
  if ("district" in race) return districtName(race.id, race.stateName);
  return `${race.stateName} Senate${race.specialElection ? " special election" : ""}`;
}

/** A margin for the race's positive side: "D+3.2", or "I+3.2" where an independent is the challenger. */
export function fmtSideMargin(margin: number, challenger: "D" | "I", digits = 1): string {
  const s = fmtMargin(margin, digits);
  return challenger === "I" ? s.replace(/^D\+/, "I+").replace(/^D unopposed/, "I unopposed") : s;
}

/** First sentence of a status note ("Incumbent retiring. Democratic hold." -> "Incumbent retiring"). */
export function firstSentence(s: string): string {
  const t = s.split(/\.\s/)[0].replace(/\.$/, "").trim();
  return t;
}

/** Plain-English note for races whose November ballot fixes the outcome or the matchup. */
export function specialNote(race: AnyRace): string | null {
  switch (race.special) {
    case "same_party_D":
      return "Both general-election candidates are Democrats, so the seat stays Democratic whoever wins.";
    case "same_party_R":
      return "Both general-election candidates are Republicans, so the seat stays Republican whoever wins.";
    case "no_republican":
      return "No Republican is on the November ballot, so the model treats the seat as decided for the Democratic side.";
    case "no_democrat":
      return "No Democrat is on the November ballot, so the model treats the seat as decided for the Republican side.";
    case "independent_vs_R": {
      const name = challengerName(race);
      return `No Democrat is running. ${name ? `${name}, an independent,` : "An independent"} is the main opponent of the Republican, and the model counts the independent as the challenger.`;
    }
    case "candidates_unknown":
      return "The nominees are not settled yet.";
    default:
      return null;
  }
}
