import { describe, expect, it } from "vitest";

import {
  DEFAULT_PARAMS,
  envForSeats,
  expectedMargin,
  expectedWinners,
  finishLine,
  forcedWinner,
  houseOutlook,
  impliedMargin,
  normalCdf,
  probAtLeast,
  projectRaces,
  seatDistribution,
  senateOutlook,
  thresholdCurve,
  winProbability,
  type ModelParams,
  type ModelRace,
} from "./engine";

const params: ModelParams = { ...DEFAULT_PARAMS, env: 0, baselineEnv: 0 };

function race(id: string, lean: number, extra: Partial<ModelRace> = {}): ModelRace {
  return { id, lean, incumbentRunning: false, incumbentParty: "", special: "", ratingScore: 0, ratingCount: 0, ...extra };
}

describe("building blocks", () => {
  it("normal CDF matches known values", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 7);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 5);
    expect(normalCdf(-1)).toBeCloseTo(0.158655, 5);
  });

  it("maps rating scores to margins through the anchors", () => {
    expect(impliedMargin(0)).toBe(0);
    expect(impliedMargin(1)).toBe(4);
    expect(impliedMargin(-2)).toBe(-9);
    expect(impliedMargin(1.5)).toBeCloseTo(6.5);
    expect(impliedMargin(5)).toBe(18);
  });

  it("fixes races where only one party is on the ballot", () => {
    expect(forcedWinner(race("a", 0, { special: "same_party_D" }))).toBe("D");
    expect(forcedWinner(race("b", 0, { special: "no_democrat" }))).toBe("R");
    expect(expectedMargin(race("c", -30, { special: "no_republican" }), params)).toBe(100);
    expect(winProbability(100, params)).toBe(1);
  });

  it("adds incumbency for the incumbent's party and blends expert ratings", () => {
    const inc = race("d", 1, { incumbentRunning: true, incumbentParty: "R" });
    expect(expectedMargin(inc, params)).toBeCloseTo(1 - DEFAULT_PARAMS.incumbency);
    const rated = race("e", 10, { ratingScore: -1, ratingCount: 10 });
    // half fundamentals (10) and half experts (Lean R = -4)
    expect(expectedMargin(rated, params)).toBeCloseTo(3);
    // both views move one-for-one with the environment
    expect(expectedMargin(rated, { ...params, env: 2 })).toBeCloseTo(5);
  });
});

describe("seat distribution", () => {
  const races = [race("a", 5), race("b", -5), race("c", 0), race("d", 12), race("e", -3)];

  it("is a probability distribution whose mean is the sum of win probabilities", () => {
    const dist = seatDistribution(races, params);
    const total = dist.pmf.reduce((s, x) => s + x, 0);
    expect(total).toBeCloseTo(1, 9);
    const marginal = projectRaces(races, params).reduce((s, r) => s + r.pWin, 0);
    expect(dist.expected).toBeCloseTo(marginal, 2);
  });

  it("is symmetric for mirrored races", () => {
    const dist = seatDistribution([race("a", 4), race("b", -4)], params);
    expect(dist.expected).toBeCloseTo(1, 6);
    expect(dist.pmf[0]).toBeCloseTo(dist.pmf[2], 9);
  });

  it("rises with the national environment", () => {
    const low = seatDistribution(races, { ...params, env: -3 }).expected;
    const high = seatDistribution(races, { ...params, env: 3 }).expected;
    expect(high).toBeGreaterThan(low);
  });

  it("counts forced wins as certain", () => {
    const dist = seatDistribution([race("a", 0, { special: "same_party_D" }), race("b", 0)], params);
    expect(dist.pmf[0]).toBe(0);
    expect(dist.expected).toBeCloseTo(1.5, 6);
  });

  it("is exact with no uncertainty", () => {
    const dist = seatDistribution(races, { ...params, sigmaNational: 0, sigmaRace: 0 });
    // a and d win for sure; c sits exactly at zero, so it is a coin flip
    expect(dist.pmf[2]).toBeCloseTo(0.5);
    expect(dist.pmf[3]).toBeCloseTo(0.5);
  });
});

describe("chamber summaries", () => {
  // 7 seats, majority 4, leans spread around zero
  const races = [-9, -6, -3, -1, 2, 5, 8].map((lean, i) => race(`R${i}`, lean));

  it("finds the tipping point and the finish line", () => {
    const outlook = houseOutlook(races, params, 4);
    expect(outlook.tipping?.id).toBe("R3"); // fourth most Democratic seat (lean -1)
    expect(outlook.finishLine).toBeCloseTo(1);
    const atLine = projectRaces(races, { ...params, env: (outlook.finishLine ?? 0) + 0.01 });
    expect(expectedWinners(atLine)).toBe(4);
    expect(finishLine(races, params, 4)).toBeCloseTo(1);
  });

  it("inverts expected seats back to an environment", () => {
    const env = envForSeats(races, params, 4);
    const expected = seatDistribution(races, { ...params, env, sigmaNational: 0 }, "D", 1).expected;
    expect(expected).toBeCloseTo(4, 3);
  });

  it("gives a majority probability between 0 and 1 that moves with the environment", () => {
    const weak = houseOutlook(races, { ...params, env: -5 }, 4).pDemMajority;
    const strong = houseOutlook(races, { ...params, env: 5 }, 4).pDemMajority;
    expect(weak).toBeLessThan(0.5);
    expect(strong).toBeGreaterThan(0.5);
    expect(probAtLeast(seatDistribution(races, params), 0)).toBeCloseTo(1, 9);
  });

  it("matches the full computation along the control curve", () => {
    const envs = [-4, -1, 0, 2, 5];
    const curve = thresholdCurve(races, params, 4, envs);
    for (const point of curve) {
      const exact = houseOutlook(races, { ...params, env: point.env }, 4);
      expect(point.p).toBeCloseTo(exact.pDemMajority, 2);
      expect(point.expected).toBeCloseTo(exact.expectedDem, 1);
    }
  });

  it("computes Senate control with holdovers, the VP tie-break and independents", () => {
    const up = [race("A", 10), race("B", -10), race("C", -2), race("D", -20, { special: "independent_vs_R" })];
    const comp = { holdoverDem: 48, holdoverRep: 47, holdoverOther: 0, vicePresidentParty: "R" as const };
    const outlook = senateOutlook(up, params, comp);
    // Democrats need 51 = holdovers 48 + all of A, B, C (D is an independent-vs-Republican race)
    expect(outlook.pDemControl).toBeGreaterThan(0);
    expect(outlook.pDemControl).toBeLessThan(0.5);
    expect(outlook.pRepControl).toBeGreaterThan(0.5);
    expect(outlook.expectedDem + outlook.expectedRep + outlook.expectedInd).toBeCloseTo(99, 6);
  });
});
