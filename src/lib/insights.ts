// Plain-English findings generated from the data and the current scenario. Rule-based and
// deterministic: every sentence is computed, nothing is written by hand or by a language model.
import type { HouseRace } from "./data/types";
import { HOUSE_MAJORITY } from "./data/states";
import { fmtMargin, fmtProb } from "./format";
import { explorerHref, houseHref } from "./routes";
import type { ChamberOutlook, ModelParams, RaceProjection } from "./model/engine";
import { fundamentalsMargin, expertMargin } from "./model/engine";

export interface Insight {
  key: string;
  title: string;
  body: string;
  /** Link to the races behind the finding. */
  href?: string;
  linkLabel?: string;
}

export function heldCounts(races: HouseRace[]) {
  const counts = { D: 0, R: 0, other: 0 };
  for (const r of races) {
    if (r.heldBy === "D") counts.D += 1;
    else if (r.heldBy === "R") counts.R += 1;
    else counts.other += 1;
  }
  return counts;
}

/** Seats expected to change hands: the favored side differs from the notional holder. */
export function expectedFlips(races: HouseRace[], projections: Map<string, RaceProjection>) {
  const toDem: { race: HouseRace; p: RaceProjection }[] = [];
  const toRep: { race: HouseRace; p: RaceProjection }[] = [];
  for (const race of races) {
    const p = projections.get(race.id);
    if (!p) continue;
    if (p.favored === "D" && race.heldBy !== "D") toDem.push({ race, p });
    if (p.favored === "R" && race.heldBy !== "R") toRep.push({ race, p });
  }
  toDem.sort((a, b) => b.p.pWin - a.p.pWin);
  toRep.sort((a, b) => a.p.pWin - b.p.pWin);
  return { toDem, toRep };
}

export function houseInsights(races: HouseRace[], outlook: ChamberOutlook, params: ModelParams): Insight[] {
  const projections = new Map(outlook.projections.map((p) => [p.id, p]));
  const held = heldCounts(races);
  const needed = HOUSE_MAJORITY - held.D;
  const out: Insight[] = [];

  out.push({
    key: "majority",
    title: needed > 0 ? `Democrats need a net gain of ${needed}` : `Republicans need a net gain of ${HOUSE_MAJORITY - held.R}`,
    body: `Democrats notionally hold ${held.D} seats and Republicans ${held.R}${held.other ? ` (${held.other} held by others)` : ""} on the 2026 lines. In this scenario Democrats are expected to win ${outlook.expectedDem.toFixed(0)} seats, with an 80% range of ${outlook.low} to ${outlook.high}.`,
  });

  if (outlook.tipping) {
    const tp = races.find((r) => r.id === outlook.tipping!.id);
    out.push({
      key: "tipping",
      title: `The tipping point: ${outlook.tipping.id}`,
      body: `The 218th most Democratic seat is ${outlook.tipping.id}${tp?.incumbent ? ` (${tp.incumbent})` : ""}, where the model expects ${fmtMargin(outlook.tipping.margin)}. ${
        outlook.finishLine != null
          ? `Democrats are expected to win the majority whenever the national vote is better for them than ${fmtMargin(outlook.finishLine)}.`
          : ""
      }`,
      href: houseHref(outlook.tipping.id),
      linkLabel: `Open ${outlook.tipping.id}`,
    });
  }

  const { toDem, toRep } = expectedFlips(races, projections);
  if (toDem.length || toRep.length) {
    const top = [...toDem.slice(0, 3).map((f) => f.race.id), ...toRep.slice(0, 3).map((f) => f.race.id)];
    out.push({
      key: "flips",
      title: `${toDem.length} seats lean to Democrats, ${toRep.length} to Republicans`,
      body: `Seats where the favored party differs from the party holding them today. Most likely Democratic gains: ${
        toDem.slice(0, 3).map((f) => `${f.race.id} (${fmtProb(f.p.pWin)})`).join(", ") || "none"
      }. Most likely Republican gains: ${toRep.slice(0, 3).map((f) => `${f.race.id} (${fmtProb(1 - f.p.pWin)})`).join(", ") || "none"}.`,
      href: explorerHref(top),
      linkLabel: "See these seats",
    });
  }

  const tossups = outlook.projections.filter((p) => !p.forced && p.pWin > 0.4 && p.pWin < 0.6);
  out.push({
    key: "tossups",
    title: `${tossups.length} seats are coin flips`,
    body: `Races where neither side has better than a 60% chance in this scenario. ${
      tossups.length ? `They include ${tossups.slice(0, 5).map((t) => t.id).join(", ")}.` : ""
    }`,
    href: explorerHref(tossups.map((t) => t.id)),
    linkLabel: "Explore the coin flips",
  });

  const openInPlay = races.filter((r) => r.openSeat && r.ratingCount > 0 && r.rating !== "Safe D" && r.rating !== "Safe R");
  out.push({
    key: "open",
    title: `${openInPlay.length} competitive seats have no incumbent running`,
    body: `Open seats are where upsets are likeliest. ${openInPlay.filter((r) => r.newLines).length} of them are in states with new maps.`,
    href: "/house?open=1&competitive=1",
    linkLabel: "Show open battlegrounds",
  });

  const gaps = races
    .filter((r) => r.ratingCount > 0)
    .map((r) => ({ r, gap: expertMargin(r, params) - fundamentalsMargin(r, params) }))
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, 3);
  if (gaps.length) {
    out.push({
      key: "experts-vs-fundamentals",
      title: "Where forecasters and fundamentals disagree most",
      body: gaps
        .map(({ r, gap }) => `${r.id}: ratings are ${Math.abs(gap).toFixed(0)} points more ${gap > 0 ? "Democratic" : "Republican"} than the district's lean`)
        .join("; ")
        .concat(". Usually a strong incumbent or candidate."),
      href: explorerHref(gaps.map((g) => g.r.id)),
      linkLabel: "Compare them",
    });
  }
  return out;
}
