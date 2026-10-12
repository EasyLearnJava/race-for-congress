// The fact sheet for one race: the only thing the model sees when it writes a summary.
// Numbers are pre-formatted exactly as a summary may quote them, so the number check in
// checks.mjs can require every number in a summary to appear here. Pure: no I/O.
import { createHash } from "node:crypto";

const PARTY = { D: "Democratic", R: "Republican", I: "Independent", L: "Libertarian", G: "Green" };
const RATING_WORD = { D: "Democratic", R: "Republican" };

const SPECIAL = {
  same_party_D: "Both general-election candidates are Democrats (top-two primary), so a Democrat will hold the seat.",
  same_party_R: "Both general-election candidates are Republicans (top-two primary), so a Republican will hold the seat.",
  no_republican: "No Republican is on the general-election ballot.",
  no_democrat: "No Democrat is on the general-election ballot.",
  independent_vs_R: "An independent candidate, not a Democrat, is the main opponent of the Republican.",
  candidates_unknown: "The general-election candidates are not settled yet.",
};

function ordinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/** "D+3.2" / "R+3.2" / "Even": the site's margin format (Democratic minus Republican). */
export function margin(m) {
  const r = Number(Math.abs(m).toFixed(1));
  if (r === 0) return "Even";
  return `${m > 0 ? "D" : "R"}+${r.toFixed(1)}`;
}

/** "$2.3 million" / "$850,000": money as a summary should quote it. */
export function money(n) {
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} million`;
  return `$${(Math.round(n / 1000) * 1000).toLocaleString("en-US")}`;
}

/** A rating label in words: "Lean D" -> "Lean Democratic", "Tossup" -> "Toss-up". */
export function ratingWords(rating) {
  if (!rating) return null;
  if (rating === "Tossup") return "Toss-up";
  const side = RATING_WORD[rating.slice(-1)];
  return side ? `${rating.slice(0, -2)} ${side}` : rating;
}

function presidential(pres24) {
  const r = Number(Math.abs(pres24).toFixed(1));
  if (r === 0) return "The 2024 presidential race was tied here.";
  // By party, not by name: the party swap must never rewrite a candidate's surname.
  return `The ${pres24 > 0 ? "Democratic" : "Republican"} presidential candidate won here by ${r.toFixed(1)} points in 2024 (${margin(pres24)}).`;
}

function forecasters(race, ratings) {
  if (!race.ratingCount) return { consensus: "Not rated: no forecaster lists this race as competitive" };
  const counts = new Map();
  for (const r of ratings) counts.set(r.rating, (counts.get(r.rating) ?? 0) + 1);
  const spread = [...counts].sort((a, b) => b[1] - a[1]).map(([label, n]) => `${n} ${ratingWords(label)}`);
  return {
    consensus: `${ratingWords(race.rating)} (median of ${race.ratingCount} forecasters)`,
    spread: spread.join(", "),
    cook_political_report: ratingWords(race.cook) ?? "not rated",
    inside_elections: ratingWords(race.ie) ?? "not rated",
    sabatos_crystal_ball: ratingWords(race.sabato) ?? "not rated",
  };
}

function campaignMoney(rows) {
  const by = (party) => rows.filter((m) => m.party === party && m.receipts != null);
  const sum = (list, key) => list.reduce((s, m) => s + (m[key] ?? 0), 0);
  const d = by("D");
  const r = by("R");
  if (!d.length && !r.length) return null;
  const asOf = rows.reduce((x, m) => (m.coverageEnd > x ? m.coverageEnd : x), "");
  return {
    as_of: asOf,
    democratic_nominee_raised: d.length ? money(sum(d, "receipts")) : "no FEC report matched",
    republican_nominee_raised: r.length ? money(sum(r, "receipts")) : "no FEC report matched",
    democratic_nominee_cash_on_hand: d.length ? money(sum(d, "cashOnHand")) : null,
    republican_nominee_cash_on_hand: r.length ? money(sum(r, "cashOnHand")) : null,
  };
}

function outsideMoney(row) {
  if (!row || !(row.total > 0)) return null;
  return {
    as_of: row.latest,
    helping_democrats: money(row.proDem) ?? "none reported",
    helping_republicans: money(row.proRep) ?? "none reported",
  };
}

function holder(race, chamber) {
  if (race.incumbent) {
    const party = PARTY[race.incumbentParty] ?? race.incumbentParty;
    const since = race.firstElected ? `, first elected in ${race.firstElected}` : "";
    return `${race.incumbent} (${party})${since}, ${race.incumbentRunning ? "is running again" : "is not running"}`;
  }
  if (chamber === "House" && race.heldByMember) return `Open seat, held by ${race.heldByMember} (${PARTY[race.heldBy] ?? race.heldBy})`;
  return "Open seat";
}

/**
 * Build the fact sheet for a race.
 * @param {object} race a row of src/generated/house.json or senate.json
 * @param {{ chamber: "House" | "Senate", ratings: object[], money: object[], outside: object | undefined, dataAsOf: string }} ctx
 */
export function buildFacts(race, ctx) {
  const house = ctx.chamber === "House";
  const facts = {
    race: race.id,
    chamber: ctx.chamber,
    name: house ? (race.id.endsWith("-AL") ? `${race.stateName} at-large district` : `${race.stateName}'s ${ordinal(race.district)} district`) : `${race.stateName} Senate${race.specialElection ? " (special election)" : ""}`,
    election_day: "November 3, 2026",
    current_holder: holder(race, ctx.chamber),
    democratic_candidate: race.dem || "none",
    republican_candidate: race.rep || "none",
    other_candidates: race.others || "none",
    president_2024: presidential(race.pres24),
    forecasters: forecasters(race, ctx.ratings),
    campaign_money: campaignMoney(ctx.money),
    outside_spending: outsideMoney(ctx.outside),
    data_as_of: ctx.dataAsOf,
  };
  if (house && race.newLines) facts.new_lines = `This district was redrawn for 2026.${race.redistrictedFrom ? ` It mostly replaces ${race.redistrictedFrom}.` : ""}`;
  if (race.special && SPECIAL[race.special]) facts.special_case = SPECIAL[race.special];
  if (race.rankedChoice) facts.ranked_choice = "This race uses ranked-choice voting.";
  return facts;
}

/**
 * Stable hash of a fact sheet: a summary is stale when its race's facts change. The build date
 * is left out, or the nightly refresh would mark every summary stale every day.
 */
export function factsHash(facts) {
  return createHash("sha256").update(JSON.stringify({ ...facts, data_as_of: undefined })).digest("hex").slice(0, 16);
}

/** Lean and Toss-up races: a person reviews every one before it is published. */
export function isCompetitive(race) {
  return ["Lean D", "Tossup", "Lean R"].includes(race.rating);
}

/**
 * Fact sheets for every race, from the generated datasets (shared by the summary script and
 * build-data.mjs, which uses the hashes to mark published summaries stale).
 * @param {{ house: object[], senate: object[], ratings: object[], money: object[], outside: object[], generated: string }} data
 */
export function allFacts(data) {
  const out = [];
  for (const [chamber, key, rows] of [["House", "house", data.house], ["Senate", "senate", data.senate]]) {
    for (const race of rows) {
      const facts = buildFacts(race, {
        chamber,
        ratings: data.ratings.filter((r) => r.chamber === key && r.raceId === race.id),
        money: data.money.filter((m) => m.raceId === race.id),
        outside: data.outside.find((o) => o.raceId === race.id),
        dataAsOf: data.generated,
      });
      out.push({ id: race.id, competitive: isCompetitive(race), facts, hash: factsHash(facts) });
    }
  }
  return out;
}

// Party swap: the same race with the parties exchanged, for the symmetry test. Swapping and
// then swapping the summary's words back should give a summary with the same tone.
// One-way table: "Republican" has two counterparts, and the fact sheet uses party names as
// adjectives ("the Republican presidential candidate"), so it maps to "Democratic".
const SWAP = new Map([
  ["Democratic", "Republican"],
  ["Democrat", "Republican"],
  ["Democrats", "Republicans"],
  ["Republican", "Democratic"],
  ["Republicans", "Democrats"],
  ["D+", "R+"],
  ["R+", "D+"],
  ["Lean D", "Lean R"],
  ["Lean R", "Lean D"],
  ["Likely D", "Likely R"],
  ["Likely R", "Likely D"],
  ["Safe D", "Safe R"],
  ["Safe R", "Safe D"],
]);
// Whole words only ("Lean D" must not match inside "Lean Democratic"), longest first, one
// pass, so a swapped word is never swapped back.
const SWAP_PATTERN = new RegExp(
  `(?<![A-Za-z])(?:${[...SWAP.keys()].sort((x, y) => y.length - x.length).map((k) => k.replace(/[+]/g, "\\+")).join("|")})(?![A-Za-z])`,
  "g",
);

/** Exchange every party word in a string ("Democrat" <-> "Republican", "D+" <-> "R+", ...). */
export function swapText(text) {
  if (typeof text !== "string") return text;
  return text.replace(SWAP_PATTERN, (m) => SWAP.get(m));
}

function swapDeep(value) {
  if (typeof value === "string") return swapText(value);
  if (Array.isArray(value)) return value.map(swapDeep);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, swapDeep(v)]));
  return value;
}

/** The race with the parties exchanged. Candidate names move with their side. */
export function swapFacts(facts) {
  const out = swapDeep(facts);
  out.democratic_candidate = facts.republican_candidate;
  out.republican_candidate = facts.democratic_candidate;
  for (const block of ["campaign_money", "outside_spending"]) {
    const b = facts[block];
    if (!b) continue;
    const swapped = { ...out[block] };
    for (const [d, r] of [
      ["democratic_nominee_raised", "republican_nominee_raised"],
      ["democratic_nominee_cash_on_hand", "republican_nominee_cash_on_hand"],
      ["helping_democrats", "helping_republicans"],
    ]) {
      if (d in b) {
        swapped[d] = b[r];
        swapped[r] = b[d];
      }
    }
    out[block] = swapped;
  }
  return out;
}
