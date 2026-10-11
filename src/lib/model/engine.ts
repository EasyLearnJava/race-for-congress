// The forecast engine. Pure and deterministic: the same inputs always give the same output.
//
// Each race gets an expected margin (Democratic minus Republican, in points):
//   fundamentals = district lean + national environment + incumbency
//   expert view  = margin implied by the median published rating, shifted by how far the
//                  chosen environment is from the one the ratings were made in
//   expected     = blend of the two (races nobody rates use fundamentals only)
// Uncertainty has two parts: one national error shared by every race (polls miss together)
// and each race's own error. Seat-count probabilities integrate over the national error on a
// grid; within each grid point races are independent, so the count follows a Poisson-binomial
// distribution computed exactly by dynamic programming. No random sampling.

export interface ModelParams {
  /** National environment: Democratic minus Republican share of the national vote, points. */
  env: number;
  /** Environment the published ratings reflect (the current generic-ballot average). */
  baselineEnv: number;
  /** 0 = fundamentals only, 1 = expert ratings only. */
  expertWeight: number;
  /** Personal vote of an incumbent running again, points. */
  incumbency: number;
  /** Standard deviation of the national error shared by all races, points. */
  sigmaNational: number;
  /** Standard deviation of each race's own error, points. */
  sigmaRace: number;
}

export const DEFAULT_PARAMS = {
  expertWeight: 0.5,
  incumbency: 2,
  sigmaNational: 3,
  sigmaRace: 4.5,
} as const;

/** The fields of a race the model reads (House and Senate races both satisfy it). */
export interface ModelRace {
  id: string;
  lean: number;
  incumbentRunning: boolean;
  incumbentParty: string;
  special: string;
  ratingScore: number;
  ratingCount: number;
}

export type Side = "D" | "R" | "I";

export interface RaceProjection {
  id: string;
  /** Expected margin for the race's non-Republican side (positive) vs the Republican (negative). */
  margin: number;
  /** Probability the non-Republican side wins. */
  pWin: number;
  /** Who the positive side of the margin is: a Democrat, or an independent where no Democrat runs. */
  challenger: "D" | "I";
  favored: Side;
  /** Outcome fixed by the ballot (one party's candidates only). */
  forced: boolean;
}

// Median published rating score -> implied margin, interpolated between anchors.
const RATING_ANCHORS: [score: number, margin: number][] = [
  [-3, -18],
  [-2, -9],
  [-1, -4],
  [0, 0],
  [1, 4],
  [2, 9],
  [3, 18],
];

export function impliedMargin(score: number): number {
  const s = Math.max(-3, Math.min(3, score));
  for (let i = 1; i < RATING_ANCHORS.length; i++) {
    const [s1, m1] = RATING_ANCHORS[i];
    if (s <= s1) {
      const [s0, m0] = RATING_ANCHORS[i - 1];
      return m0 + ((s - s0) / (s1 - s0)) * (m1 - m0);
    }
  }
  return RATING_ANCHORS[RATING_ANCHORS.length - 1][1];
}

/** Races decided by who is on the ballot: only one party's candidates (or only one party at all). */
export function forcedWinner(race: ModelRace): "D" | "R" | null {
  switch (race.special) {
    case "same_party_D":
    case "no_republican":
      return "D";
    case "same_party_R":
    case "no_democrat":
      return "R";
    default:
      return null;
  }
}

export function challengerOf(race: ModelRace): "D" | "I" {
  return race.special === "independent_vs_R" ? "I" : "D";
}

export function fundamentalsMargin(race: ModelRace, p: ModelParams): number {
  let incumbency = 0;
  if (race.incumbentRunning && race.incumbentParty === "D") incumbency = p.incumbency;
  if (race.incumbentRunning && race.incumbentParty === "R") incumbency = -p.incumbency;
  return race.lean + p.env + incumbency;
}

export function expertMargin(race: ModelRace, p: ModelParams): number {
  return impliedMargin(race.ratingScore) + (p.env - p.baselineEnv);
}

export function expectedMargin(race: ModelRace, p: ModelParams): number {
  const forced = forcedWinner(race);
  if (forced) return forced === "D" ? 100 : -100;
  const fundamentals = fundamentalsMargin(race, p);
  if (!race.ratingCount) return fundamentals;
  return p.expertWeight * expertMargin(race, p) + (1 - p.expertWeight) * fundamentals;
}

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 via erf; |error| < 1.5e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function totalSigma(p: ModelParams): number {
  return Math.hypot(p.sigmaNational, p.sigmaRace);
}

export function winProbability(margin: number, p: ModelParams): number {
  if (Math.abs(margin) >= 100) return margin > 0 ? 1 : 0;
  const sigma = totalSigma(p);
  if (sigma === 0) return margin > 0 ? 1 : margin < 0 ? 0 : 0.5;
  return normalCdf(margin / sigma);
}

export function projectRace(race: ModelRace, p: ModelParams): RaceProjection {
  const margin = expectedMargin(race, p);
  const pWin = winProbability(margin, p);
  const challenger = challengerOf(race);
  return {
    id: race.id,
    margin,
    pWin,
    challenger,
    favored: pWin >= 0.5 ? challenger : "R",
    forced: Math.abs(margin) >= 100,
  };
}

export function projectRaces(races: ModelRace[], p: ModelParams): RaceProjection[] {
  return races.map((r) => projectRace(r, p));
}

export interface SeatDistribution {
  /** pmf[k] = probability the counted side wins exactly k of these races. */
  pmf: number[];
  expected: number;
}

/**
 * Distribution of how many races a side wins. `count` decides which winners are counted:
 * "D" counts Democratic wins only; "nonR" counts every win by a non-Republican.
 */
export function seatDistribution(
  races: ModelRace[],
  p: ModelParams,
  count: "D" | "nonR" = "D",
  gridPoints = 61,
): SeatDistribution {
  const projections = projectRaces(races, p);
  let fixedWins = 0;
  const open: number[] = []; // expected margins of races still in play for the counted side
  for (const proj of projections) {
    const counts = count === "nonR" || proj.challenger === "D";
    if (!counts) continue;
    if (proj.forced) {
      if (proj.margin > 0) fixedWins += 1;
    } else {
      open.push(proj.margin);
    }
  }

  const n = open.length;
  const total = new Float64Array(n + 1);
  const points = p.sigmaNational > 0 ? gridPoints : 1;
  const zMax = 4;
  let weightSum = 0;
  const pmf = new Float64Array(n + 1);

  for (let g = 0; g < points; g++) {
    const z = points === 1 ? 0 : -zMax + (2 * zMax * g) / (points - 1);
    const weight = Math.exp(-0.5 * z * z);
    const shift = z * p.sigmaNational;
    pmf.fill(0);
    pmf[0] = 1;
    for (let i = 0; i < n; i++) {
      const m = open[i] + shift;
      const q = p.sigmaRace > 0 ? normalCdf(m / p.sigmaRace) : m > 0 ? 1 : m < 0 ? 0 : 0.5;
      for (let k = i + 1; k >= 1; k--) pmf[k] = pmf[k] * (1 - q) + pmf[k - 1] * q;
      pmf[0] *= 1 - q;
    }
    for (let k = 0; k <= n; k++) total[k] += weight * pmf[k];
    weightSum += weight;
  }

  const out = new Array<number>(n + fixedWins + 1).fill(0);
  let expected = 0;
  for (let k = 0; k <= n; k++) {
    const prob = total[k] / weightSum;
    out[k + fixedWins] = prob;
    expected += (k + fixedWins) * prob;
  }
  return { pmf: out, expected };
}

export function probAtLeast(dist: SeatDistribution, k: number): number {
  let s = 0;
  for (let i = Math.max(0, k); i < dist.pmf.length; i++) s += dist.pmf[i];
  return Math.min(1, s);
}

export function quantile(dist: SeatDistribution, q: number): number {
  let s = 0;
  for (let k = 0; k < dist.pmf.length; k++) {
    s += dist.pmf[k];
    if (s >= q) return k;
  }
  return dist.pmf.length - 1;
}

/** Seats won if every race went exactly as expected (no error): the uniform-swing count. */
export function expectedWinners(projections: RaceProjection[], side: "D" | "nonR" = "D"): number {
  return projections.filter((r) => r.margin > 0 && (side === "nonR" || r.challenger === "D")).length;
}

/**
 * The tipping-point race: rank races from most to least Democratic; the one that would give
 * Democrats the majority-th seat. Its margin is how far Democrats are from a bare majority.
 */
export function tippingPoint(projections: RaceProjection[], majority: number): RaceProjection | undefined {
  const ranked = projections.filter((r) => r.challenger === "D").sort((a, b) => b.margin - a.margin);
  return ranked[majority - 1];
}

/**
 * The finish line: the national environment at which Democrats are expected to win exactly a
 * bare majority. Every expected margin moves one-for-one with the environment, so it is the
 * current environment minus the tipping-point margin.
 */
export function finishLine(races: ModelRace[], p: ModelParams, majority: number): number | undefined {
  const tp = tippingPoint(projectRaces(races, p), majority);
  if (!tp || tp.forced) return undefined;
  return p.env - tp.margin;
}

/** The environment in which Democrats are expected (no national error) to win `target` seats. */
export function envForSeats(races: ModelRace[], p: ModelParams, target: number): number {
  let lo = -40;
  let hi = 40;
  const at = (env: number) => seatDistribution(races, { ...p, env, sigmaNational: 0 }, "D", 1).expected;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (at(mid) < target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * Chance the counted side wins at least `threshold` races, for each national environment in
 * `envs`. Fast: computes the no-national-error chance g(x) once on a fine grid of national
 * shifts, then averages g over the national error for each requested environment.
 */
export function thresholdCurve(
  races: ModelRace[],
  p: ModelParams,
  threshold: number,
  envs: number[],
  count: "D" | "nonR" = "D",
): { env: number; p: number; expected: number }[] {
  if (!envs.length) return [];
  const sn = p.sigmaNational;
  const lo = Math.min(...envs) - 4 * sn - 1;
  const hi = Math.max(...envs) + 4 * sn + 1;
  const step = 0.5;
  const grid: { x: number; g: number; e: number }[] = [];
  for (let x = lo; x <= hi + 1e-9; x += step) {
    const dist = seatDistribution(races, { ...p, env: x, sigmaNational: 0 }, count, 1);
    grid.push({ x, g: probAtLeast(dist, threshold), e: dist.expected });
  }
  const at = (x: number, key: "g" | "e") => {
    const t = (x - lo) / step;
    const i = Math.max(0, Math.min(grid.length - 2, Math.floor(t)));
    const f = Math.min(1, Math.max(0, t - i));
    return grid[i][key] * (1 - f) + grid[i + 1][key] * f;
  };
  const nodes = sn > 0 ? 41 : 1;
  return envs.map((env) => {
    let sum = 0;
    let exp = 0;
    let wsum = 0;
    for (let k = 0; k < nodes; k++) {
      const z = nodes === 1 ? 0 : -4 + (8 * k) / (nodes - 1);
      const w = Math.exp(-0.5 * z * z);
      sum += w * at(env + z * sn, "g");
      exp += w * at(env + z * sn, "e");
      wsum += w;
    }
    return { env, p: sum / wsum, expected: exp / wsum };
  });
}

export interface ChamberOutlook {
  dist: SeatDistribution;
  projections: RaceProjection[];
  expectedDem: number;
  pDemMajority: number;
  median: number;
  low: number; // 10th percentile
  high: number; // 90th percentile
  tipping?: RaceProjection;
  finishLine?: number;
}

export function houseOutlook(races: ModelRace[], p: ModelParams, majority = 218): ChamberOutlook {
  const projections = projectRaces(races, p);
  const dist = seatDistribution(races, p, "D");
  return {
    dist,
    projections,
    expectedDem: dist.expected,
    pDemMajority: probAtLeast(dist, majority),
    median: quantile(dist, 0.5),
    low: quantile(dist, 0.1),
    high: quantile(dist, 0.9),
    tipping: tippingPoint(projections, majority),
    finishLine: finishLine(races, p, majority),
  };
}

export interface SenateComposition {
  /** Seats not up this year, by caucus. Independents who caucus with Democrats count as D. */
  holdoverDem: number;
  holdoverRep: number;
  holdoverOther: number;
  vicePresidentParty: "D" | "R";
}

export interface SenateOutlook {
  demSeats: SeatDistribution; // total Democratic-caucus seats (holdovers + wins)
  projections: RaceProjection[];
  expectedDem: number;
  expectedRep: number;
  expectedInd: number;
  pDemControl: number;
  pRepControl: number;
}

export function senateOutlook(races: ModelRace[], p: ModelParams, c: SenateComposition): SenateOutlook {
  const projections = projectRaces(races, p);
  const dem = seatDistribution(races, p, "D");
  const nonRep = seatDistribution(races, p, "nonR");
  const up = races.length;
  const demThreshold = c.vicePresidentParty === "D" ? 50 : 51;
  const repThreshold = c.vicePresidentParty === "R" ? 50 : 51;
  // Republicans win every race the non-Republican side does not.
  const maxNonRepWins = up - (repThreshold - c.holdoverRep);
  let pRep = 0;
  for (let k = 0; k <= Math.min(maxNonRepWins, nonRep.pmf.length - 1); k++) pRep += nonRep.pmf[k];
  const demSeats: SeatDistribution = {
    pmf: [...new Array<number>(c.holdoverDem).fill(0), ...dem.pmf],
    expected: c.holdoverDem + dem.expected,
  };
  return {
    demSeats,
    projections,
    expectedDem: demSeats.expected,
    expectedRep: c.holdoverRep + up - nonRep.expected,
    expectedInd: c.holdoverOther + nonRep.expected - dem.expected,
    pDemControl: probAtLeast(demSeats, demThreshold),
    pRepControl: maxNonRepWins < 0 ? 0 : Math.min(1, pRep),
  };
}
