// Tools the "Ask 218" analyst can call. Each one reads this site's own data and model, so
// every number in an answer comes from the same source as the dashboards.
import "server-only";

import type Anthropic from "@anthropic-ai/sdk";

import { house, meta, moneyFor, outsideFor, ratings, ratingsFor, senate, senateComposition } from "@/lib/data";
import type { HouseRace, SenateRace } from "@/lib/data/types";
import { fmtMargin } from "@/lib/format";
import {
  DEFAULT_PARAMS,
  houseOutlook,
  projectRace,
  senateOutlook,
  type ModelParams,
} from "@/lib/model/engine";
import { RATING_ORDER } from "@/lib/ratings";

export const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: "search_races",
    description:
      "Find House or Senate races matching filters and return them with the model's expected margin and win probability under the user's current scenario. Use it for any question about which races, how many, or rankings.",
    input_schema: {
      type: "object",
      properties: {
        chamber: { type: "string", enum: ["house", "senate"] },
        state: { type: "string", description: "Two-letter postal code, e.g. PA" },
        ratings: { type: "array", items: { type: "string", enum: RATING_ORDER }, description: "Consensus ratings to include" },
        open_seat_only: { type: "boolean" },
        new_lines_only: { type: "boolean", description: "House only: districts in states with new 2026 maps" },
        text: { type: "string", description: "Match a race id, state name, incumbent or candidate name" },
        sort_by: { type: "string", enum: ["closest", "most_democratic", "most_republican", "lean"] },
        limit: { type: "integer", minimum: 1, maximum: 40 },
      },
      required: ["chamber"],
      additionalProperties: false,
    },
  },
  {
    name: "get_race",
    description:
      "Everything about one race: presidential results, lean, incumbent and status, candidates, every forecaster's rating with its date, money and outside spending, and the model's view.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string", description: "Race id: PA-07, AK-AL for at-large, or TX-SEN for a Senate race" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "chamber_outlook",
    description:
      "The model's overall outlook for the House or Senate: chance of a Democratic majority, expected seats with an 80% range, the tipping-point seat, the finish line and the most likely flips. Optionally at a different national environment.",
    input_schema: {
      type: "object",
      properties: {
        chamber: { type: "string", enum: ["house", "senate"] },
        national_environment: {
          type: "number",
          description: "Democratic minus Republican national vote margin in points. Omit to use the user's current setting.",
        },
      },
      required: ["chamber"],
      additionalProperties: false,
    },
  },
  {
    name: "forecaster_summary",
    description:
      "How the 10 published forecasters compare: each one's implied seat counts by rating category and how much more Democratic or Republican their ratings run than the consensus.",
    input_schema: {
      type: "object",
      properties: { chamber: { type: "string", enum: ["house", "senate"] } },
      required: ["chamber"],
      additionalProperties: false,
    },
  },
];

export interface ToolContext {
  params: ModelParams;
}

const round = (n: number, d = 1) => Number(n.toFixed(d));

function compact(race: HouseRace | SenateRace, params: ModelParams) {
  const p = projectRace(race, params);
  return {
    id: race.id,
    incumbent: race.incumbent || null,
    incumbent_party: race.incumbentParty || null,
    incumbent_running: race.incumbentRunning,
    held_by: "heldBy" in race ? race.heldBy : race.incumbentParty,
    dem: race.dem || null,
    rep: race.rep || null,
    lean: fmtMargin(race.lean),
    pres_2024: fmtMargin(race.pres24),
    consensus_rating: race.rating,
    forecasters_rating: race.ratingCount,
    model_expected_margin: fmtMargin(p.margin),
    model_chance_non_republican_wins: round(p.pWin * 100, 0),
    special_case: race.special || null,
  };
}

function searchRaces(input: Record<string, unknown>, ctx: ToolContext) {
  const chamber = input.chamber === "senate" ? "senate" : "house";
  let rows: (HouseRace | SenateRace)[] = chamber === "senate" ? [...senate] : [...house];
  if (typeof input.state === "string" && input.state) rows = rows.filter((r) => r.state === input.state!.toString().toUpperCase());
  if (Array.isArray(input.ratings) && input.ratings.length) rows = rows.filter((r) => (input.ratings as string[]).includes(r.rating));
  if (input.open_seat_only === true) rows = rows.filter((r) => r.openSeat);
  if (input.new_lines_only === true) rows = rows.filter((r) => "newLines" in r && r.newLines);
  if (typeof input.text === "string" && input.text.trim()) {
    const q = input.text.toLowerCase();
    rows = rows.filter((r) => [r.id, r.stateName, r.incumbent, r.dem, r.rep, r.others].join(" ").toLowerCase().includes(q));
  }
  const projected = rows.map((r) => ({ r, p: projectRace(r, ctx.params) }));
  const sort = input.sort_by;
  if (sort === "closest") projected.sort((a, b) => Math.abs(a.p.pWin - 0.5) - Math.abs(b.p.pWin - 0.5));
  else if (sort === "most_democratic") projected.sort((a, b) => b.p.margin - a.p.margin);
  else if (sort === "most_republican") projected.sort((a, b) => a.p.margin - b.p.margin);
  else if (sort === "lean") projected.sort((a, b) => b.r.lean - a.r.lean);
  const limit = Math.min(40, Math.max(1, Number(input.limit) || 15));
  return {
    total_matching: projected.length,
    scenario_national_environment: fmtMargin(ctx.params.env),
    races: projected.slice(0, limit).map(({ r }) => compact(r, ctx.params)),
  };
}

function getRace(input: Record<string, unknown>, ctx: ToolContext) {
  const id = String(input.id ?? "").toUpperCase().trim();
  const isSenate = id.endsWith("-SEN");
  const race = isSenate ? senate.find((r) => r.id === id) : house.find((r) => r.id === id);
  if (!race) return { error: `No race with id ${id}. House ids look like PA-07 or AK-AL; Senate ids like TX-SEN.` };
  const p = projectRace(race, ctx.params);
  return {
    ...compact(race, ctx.params),
    state: race.stateName,
    others_on_ballot: race.others || null,
    incumbent_status: race.incumbentStatus || null,
    pres_2024_votes: { harris: race.harris24, trump: race.trump24, total: race.total24 },
    ...("pres20" in race ? { pres_2020: race.pres20 == null ? null : fmtMargin(race.pres20), new_lines_2026: race.newLines, notional_holder: race.heldByMember } : {}),
    flip_point_national_environment: p.forced ? null : fmtMargin(ctx.params.env - p.margin),
    forecaster_ratings: ratingsFor(isSenate ? "senate" : "house", race.id).map((r) => ({ source: r.source, rating: r.rating, as_of: r.asOf })),
    money: moneyFor(race.id).map((m) => ({ candidate: m.candidate, party: m.party, receipts: m.receipts, cash_on_hand: m.cashOnHand, through: m.coverageEnd })),
    outside_spending: outsideFor(race.id) ?? null,
  };
}

function chamberOutlook(input: Record<string, unknown>, ctx: ToolContext) {
  const env = typeof input.national_environment === "number" ? input.national_environment : ctx.params.env;
  const params = { ...ctx.params, env };
  if (input.chamber === "senate") {
    const c = senateComposition();
    const o = senateOutlook(senate, params, c);
    return {
      national_environment: fmtMargin(env),
      chance_democratic_control: round(o.pDemControl * 100, 0),
      chance_republican_control: round(o.pRepControl * 100, 0),
      expected_seats: { democratic_caucus: round(o.expectedDem), republican: round(o.expectedRep), independent: round(o.expectedInd) },
      seats_not_up: { democratic_caucus: c.holdoverDem, republican: c.holdoverRep },
      rule: "With a Republican vice president, Democrats need 51 seats and Republicans 50.",
    };
  }
  const o = houseOutlook(house, params);
  const flips = o.projections
    .map((p) => ({ p, race: house.find((r) => r.id === p.id)! }))
    .filter(({ p, race }) => p.favored !== race.heldBy)
    .sort((a, b) => Math.abs(b.p.pWin - 0.5) - Math.abs(a.p.pWin - 0.5));
  return {
    national_environment: fmtMargin(env),
    chance_democratic_majority: round(o.pDemMajority * 100, 0),
    expected_democratic_seats: round(o.expectedDem),
    range_80_percent: [o.low, o.high],
    seats_for_majority: 218,
    tipping_point_seat: o.tipping ? { id: o.tipping.id, expected_margin: fmtMargin(o.tipping.margin) } : null,
    finish_line: o.finishLine == null ? null : fmtMargin(o.finishLine),
    expected_flips: flips.slice(0, 12).map(({ p, race }) => ({ id: p.id, from: race.heldBy, to: p.favored, chance: round(Math.max(p.pWin, 1 - p.pWin) * 100, 0) })),
  };
}

function forecasterSummary(input: Record<string, unknown>) {
  const chamber = input.chamber === "senate" ? "senate" : "house";
  const races = chamber === "senate" ? senate : house;
  const consensus = new Map(races.map((r) => [r.id, r.ratingScore]));
  const bySource = new Map<string, { counts: Record<string, number>; diff: number; n: number; asOf: string }>();
  for (const r of ratings.filter((x) => x.chamber === chamber)) {
    const s = bySource.get(r.source) ?? { counts: {}, diff: 0, n: 0, asOf: r.asOf };
    s.counts[r.rating] = (s.counts[r.rating] ?? 0) + 1;
    s.diff += r.score - (consensus.get(r.raceId) ?? 0);
    s.n += 1;
    if (r.asOf > s.asOf) s.asOf = r.asOf;
    bySource.set(r.source, s);
  }
  return {
    chamber,
    note: "Counts cover races each forecaster lists as competitive; unlisted races count as safe. A positive lean_vs_consensus means more Democratic-leaning ratings than the median.",
    forecasters: [...bySource.entries()].map(([source, s]) => ({
      source,
      ratings_by_category: s.counts,
      lean_vs_consensus: round(s.diff / Math.max(1, s.n), 2),
      latest_update: s.asOf,
    })),
  };
}

export function runTool(name: string, input: unknown, ctx: ToolContext): unknown {
  const args = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  switch (name) {
    case "search_races":
      return searchRaces(args, ctx);
    case "get_race":
      return getRace(args, ctx);
    case "chamber_outlook":
      return chamberOutlook(args, ctx);
    case "forecaster_summary":
      return forecasterSummary(args);
    default:
      return { error: `Unknown tool ${name}` };
  }
}

export function scenarioFrom(raw: unknown): ModelParams {
  const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
  const baseline = meta.environment?.margin ?? 0;
  return {
    env: num(s.env, baseline, -25, 25),
    baselineEnv: baseline,
    expertWeight: num(s.expertWeight, DEFAULT_PARAMS.expertWeight, 0, 1),
    incumbency: num(s.incumbency, DEFAULT_PARAMS.incumbency, 0, 10),
    sigmaNational: num(s.sigmaNational, DEFAULT_PARAMS.sigmaNational, 0, 10),
    sigmaRace: num(s.sigmaRace, DEFAULT_PARAMS.sigmaRace, 0, 15),
  };
}
