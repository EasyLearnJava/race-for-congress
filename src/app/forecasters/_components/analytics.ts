// Pure computations behind the forecaster page. No React, no data imports: the server page
// passes the rows in, the client component calls these inside useMemo.
import type { Rating, RatingLabel } from "@/lib/data/types";
import type { ModelRace } from "@/lib/model/engine";
import { RATING_ORDER, ratingFromScore } from "@/lib/ratings";

export type Chamber = "house" | "senate";

/** The slice of a race this page needs (also enough for the model hooks). */
export interface RaceLite extends ModelRace {
  state: string;
  stateName: string;
  /** Consensus: the median published rating. */
  rating: RatingLabel;
}

export const SHORT_NAME: Record<string, string> = {
  "Cook Political Report": "Cook",
  "Decision Desk HQ": "DDHQ",
  "Fifty Plus One": "Fifty Plus One",
  "Fox News": "Fox News",
  "Inside Elections": "Inside Elections",
  RealClearPolitics: "RCP",
  "Sabato's Crystal Ball": "Sabato",
  "Silver Bulletin": "Silver Bulletin",
  "Split Ticket": "Split Ticket",
  "The Economist": "Economist",
};

export const shortName = (source: string) => SHORT_NAME[source] ?? source;

const RATING_SET = new Set<string>(RATING_ORDER);

/**
 * The seven-step category of one published rating. Ratings outside the seven (Inside
 * Elections' "Tilt") fall into the category of their score, with the site's consensus thresholds.
 */
export function categoryOf(rating: string, score: number): RatingLabel {
  return RATING_SET.has(rating) ? (rating as RatingLabel) : ratingFromScore(score);
}

/** A score on the -3..3 scale as a rating word, for tooltips and axes. */
export function scoreLabel(score: number): string {
  const s = Math.abs(score);
  if (s < 0.25) return "Tossup";
  const side = score > 0 ? "D" : "R";
  if (s < 0.75) return `Tilt ${side}`;
  if (s < 1.5) return `Lean ${side}`;
  if (s < 2.5) return `Likely ${side}`;
  return `Safe ${side}`;
}

/** Days between two ISO calendar dates (b - a). Parses fixed strings only, never "now". */
export function daysBetween(a: string, b: string): number {
  const ta = Date.parse(`${a.slice(0, 10)}T00:00:00Z`);
  const tb = Date.parse(`${b.slice(0, 10)}T00:00:00Z`);
  if (!Number.isFinite(ta) || !Number.isFinite(tb)) return NaN;
  return Math.round((tb - ta) / 86_400_000);
}

const emptyCounts = (): Record<RatingLabel, number> =>
  Object.fromEntries(RATING_ORDER.map((r) => [r, 0])) as Record<RatingLabel, number>;
const emptyIds = (): Record<RatingLabel, string[]> =>
  Object.fromEntries(RATING_ORDER.map((r) => [r, [] as string[]])) as Record<RatingLabel, string[]>;

/** Category for a race nobody in particular rated: Safe for the party its lean favors. */
export function unratedCategory(race: RaceLite): RatingLabel {
  if (race.lean > 0) return "Safe D";
  if (race.lean < 0) return "Safe R";
  return race.rating;
}

export interface ForecasterStat {
  source: string;
  short: string;
  /** Races this forecaster rates in the chamber. */
  rated: number;
  /** Average of (score - consensus score) over rated races; positive = more Democratic. */
  effect: number | null;
  /** Rated races scored more Democratic / more Republican than the consensus. */
  moreD: number;
  moreR: number;
  /** Share of rated races whose category equals the consensus category. */
  matchConsensus: number | null;
  latest: string;
  /** Days between this forecaster's latest update and the newest update in the dataset. */
  daysBehind: number | null;
  /** Implied category counts over every race in the chamber (unrated races count as Safe). */
  counts: Record<RatingLabel, number>;
  idsBy: Record<RatingLabel, string[]>;
}

export interface PairStat {
  both: number;
  same: number;
  share: number | null;
}

export interface ContestedRace {
  race: RaceLite;
  spread: number;
  ratings: Rating[];
}

export interface ChamberAnalysis {
  forecasters: ForecasterStat[];
  /** raceId -> source -> rating. */
  byRace: Map<string, Map<string, Rating>>;
  ratedRaces: number;
  newest: { date: string; sources: string[] } | null;
  oldest: { date: string; sources: string[] } | null;
  unanimous: string[];
  /** Rated races where every rating sits within one step of every other. */
  withinOne: string[];
  pair: (a: string, b: string) => PairStat;
  contested: ContestedRace[];
  /** Consensus category counts over every race, for comparison rows. */
  consensusCounts: Record<RatingLabel, number>;
  consensusIds: Record<RatingLabel, string[]>;
}

export function analyzeChamber(ratings: readonly Rating[], races: readonly RaceLite[], sources: readonly string[]): ChamberAnalysis {
  const raceById = new Map(races.map((r) => [r.id, r]));
  const byRace = new Map<string, Map<string, Rating>>();
  const bySource = new Map<string, Rating[]>();
  for (const r of ratings) {
    if (!raceById.has(r.raceId)) continue;
    let m = byRace.get(r.raceId);
    if (!m) byRace.set(r.raceId, (m = new Map()));
    m.set(r.source, r);
    let list = bySource.get(r.source);
    if (!list) bySource.set(r.source, (list = []));
    list.push(r);
  }

  // Freshness extremes over the forecasters' latest updates.
  const latestBy = new Map<string, string>();
  for (const [source, list] of bySource) latestBy.set(source, list.reduce((m, r) => (r.asOf > m ? r.asOf : m), ""));
  const dates = [...latestBy.values()].filter(Boolean).sort();
  const newestDate = dates.at(-1) ?? null;
  const oldestDate = dates[0] ?? null;
  const whoOn = (d: string) => [...latestBy].filter(([, v]) => v === d).map(([s]) => s);

  const forecasters: ForecasterStat[] = sources.map((source) => {
    const list = bySource.get(source) ?? [];
    const mine = new Map(list.map((r) => [r.raceId, r]));
    let diff = 0;
    let moreD = 0;
    let moreR = 0;
    let match = 0;
    for (const r of list) {
      const race = raceById.get(r.raceId)!;
      const d = r.score - race.ratingScore;
      diff += d;
      if (d > 0) moreD++;
      else if (d < 0) moreR++;
      if (categoryOf(r.rating, r.score) === race.rating) match++;
    }
    const counts = emptyCounts();
    const idsBy = emptyIds();
    for (const race of races) {
      const r = mine.get(race.id);
      const cat = r ? categoryOf(r.rating, r.score) : unratedCategory(race);
      counts[cat]++;
      idsBy[cat].push(race.id);
    }
    const latest = latestBy.get(source) ?? "";
    return {
      source,
      short: shortName(source),
      rated: list.length,
      effect: list.length ? diff / list.length : null,
      moreD,
      moreR,
      matchConsensus: list.length ? match / list.length : null,
      latest,
      daysBehind: latest && newestDate ? daysBetween(latest, newestDate) : null,
      counts,
      idsBy,
    };
  });

  const unanimous: string[] = [];
  const withinOne: string[] = [];
  const contestedAll: ContestedRace[] = [];
  for (const [raceId, m] of byRace) {
    const list = [...m.values()];
    if (list.length < 2) continue;
    const scores = list.map((r) => r.score);
    const spread = Math.max(...scores) - Math.min(...scores);
    if (new Set(list.map((r) => r.rating)).size === 1) unanimous.push(raceId);
    if (spread <= 1) withinOne.push(raceId);
    contestedAll.push({ race: raceById.get(raceId)!, spread, ratings: list });
  }
  contestedAll.sort(
    (a, b) =>
      b.spread - a.spread ||
      Math.abs(a.race.ratingScore) - Math.abs(b.race.ratingScore) ||
      a.race.id.localeCompare(b.race.id, undefined, { numeric: true }),
  );

  // Agreement for every pair, computed once: share of races both rate with the identical rating.
  const pairs = new Map<string, PairStat>();
  const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  for (let i = 0; i < sources.length; i++) {
    for (let j = i; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      let both = 0;
      let same = 0;
      for (const m of byRace.values()) {
        const ra = m.get(a);
        const rb = m.get(b);
        if (!ra || !rb) continue;
        both++;
        if (ra.rating === rb.rating) same++;
      }
      pairs.set(pairKey(a, b), { both, same, share: both ? same / both : null });
    }
  }
  const pair = (a: string, b: string): PairStat => pairs.get(pairKey(a, b)) ?? { both: 0, same: 0, share: null };

  const consensusCounts = emptyCounts();
  const consensusIds = emptyIds();
  for (const race of races) {
    const cat = race.ratingCount > 0 ? race.rating : unratedCategory(race);
    consensusCounts[cat]++;
    consensusIds[cat].push(race.id);
  }

  return {
    forecasters,
    byRace,
    ratedRaces: byRace.size,
    newest: newestDate ? { date: newestDate, sources: whoOn(newestDate) } : null,
    oldest: oldestDate ? { date: oldestDate, sources: whoOn(oldestDate) } : null,
    unanimous,
    withinOne,
    pair,
    contested: contestedAll.filter((c) => c.spread > 0).slice(0, 15),
    consensusCounts,
    consensusIds,
  };
}

/** Races both forecasters rate where their ratings differ, most different first. */
export function differences(byRace: Map<string, Map<string, Rating>>, a: string, b: string): { raceId: string; a: Rating; b: Rating }[] {
  const out: { raceId: string; a: Rating; b: Rating }[] = [];
  for (const [raceId, m] of byRace) {
    const ra = m.get(a);
    const rb = m.get(b);
    if (ra && rb && ra.rating !== rb.rating) out.push({ raceId, a: ra, b: rb });
  }
  return out.sort(
    (x, y) => Math.abs(y.a.score - y.b.score) - Math.abs(x.a.score - x.b.score) || x.raceId.localeCompare(y.raceId, undefined, { numeric: true }),
  );
}

/** Democratic-side seats in a set of category counts (Safe/Likely/Lean D). */
export function demSide(counts: Record<RatingLabel, number>): number {
  return counts["Safe D"] + counts["Likely D"] + counts["Lean D"];
}

export function repSide(counts: Record<RatingLabel, number>): number {
  return counts["Safe R"] + counts["Likely R"] + counts["Lean R"];
}
