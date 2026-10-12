import { describe, expect, it } from "vitest";

import { checkSummary, numbersIn } from "./checks.mjs";
import { buildFacts, factsHash, margin, money, swapFacts, swapText } from "./facts.mjs";
import { SUMMARY_SCHEMA, writeRequest } from "./prompts.mjs";

const RACE = {
  id: "PA-07",
  stateName: "Pennsylvania",
  district: 7,
  pres24: -3.2,
  incumbent: "Ryan Mackenzie",
  incumbentParty: "R",
  incumbentRunning: true,
  firstElected: "2024",
  heldBy: "R",
  heldByMember: "Ryan Mackenzie",
  dem: "Bob Brooks",
  rep: "Ryan Mackenzie",
  others: "",
  special: "",
  rankedChoice: false,
  newLines: false,
  rating: "Lean D",
  ratingScore: 1,
  ratingCount: 10,
  cook: "Lean D",
  ie: "Tossup",
  sabato: "Lean D",
};
const CTX = {
  chamber: "House",
  ratings: [
    ...Array(6).fill({ rating: "Lean D" }),
    ...Array(2).fill({ rating: "Likely D" }),
    ...Array(2).fill({ rating: "Tossup" }),
  ],
  money: [
    { party: "D", receipts: 2_400_000, cashOnHand: 1_000_000, coverageEnd: "2026-06-30" },
    { party: "R", receipts: 4_400_000, cashOnHand: 2_900_000, coverageEnd: "2026-06-30" },
  ],
  outside: { proDem: 3_600_000, proRep: 5_200_000, total: 8_800_000, latest: "2026-10-09" },
  dataAsOf: "2026-10-11",
};
const facts = buildFacts(RACE, CTX);

const GOOD = {
  summary:
    "Republican Ryan Mackenzie, first elected in 2024, faces Democrat Bob Brooks in Pennsylvania's 7th district. The Republican presidential candidate carried the district by 3.2 points in 2024 (R+3.2), while forecasters rate the race Lean Democratic, the median of 10 forecasters.",
  what_decides:
    "Whether the district's R+3.2 presidential vote or the forecasters' Lean Democratic rating proves the better guide, with $5.2 million in outside spending helping Republicans.",
};

describe("fact sheet", () => {
  it("formats margins and money the way summaries quote them", () => {
    expect(margin(-3.2)).toBe("R+3.2");
    expect(margin(0.04)).toBe("Even");
    expect(money(2_400_000)).toBe("$2.4 million");
    expect(money(850_400)).toBe("$850,000");
    expect(money(0)).toBeNull();
  });

  it("describes the race from the data", () => {
    expect(facts.name).toBe("Pennsylvania's 7th district");
    expect(facts.president_2024).toBe("The Republican presidential candidate won here by 3.2 points in 2024 (R+3.2).");
    expect(facts.forecasters.consensus).toBe("Lean Democratic (median of 10 forecasters)");
    expect(facts.forecasters.spread).toBe("6 Lean Democratic, 2 Likely Democratic, 2 Toss-up");
    expect(facts.campaign_money.republican_nominee_raised).toBe("$4.4 million");
  });

  it("hashes deterministically", () => {
    expect(factsHash(buildFacts(RACE, CTX))).toBe(factsHash(facts));
    expect(factsHash(buildFacts({ ...RACE, rating: "Tossup" }, CTX))).not.toBe(factsHash(facts));
    // A new build date alone must not make every summary stale.
    expect(factsHash(buildFacts(RACE, { ...CTX, dataAsOf: "2026-10-12" }))).toBe(factsHash(facts));
  });
});

describe("party swap", () => {
  it("swaps whole party words only, in one pass", () => {
    expect(swapText("Lean Democratic, R+3.2, Democrats and Republicans")).toBe("Lean Republican, D+3.2, Republicans and Democrats");
    expect(swapText("Lean D or Safe R")).toBe("Lean R or Safe D");
    expect(swapText("Chris Henry (Progressive); Democratic-Farmer-Labor")).toBe("Chris Henry (Progressive); Republican-Farmer-Labor");
  });

  it("moves candidates and money with their side", () => {
    const s = swapFacts(facts);
    expect(s.democratic_candidate).toBe("Ryan Mackenzie");
    expect(s.republican_candidate).toBe("Bob Brooks");
    expect(s.current_holder).toBe("Ryan Mackenzie (Democratic), first elected in 2024, is running again");
    expect(s.president_2024).toBe("The Democratic presidential candidate won here by 3.2 points in 2024 (D+3.2).");
    expect(s.forecasters.consensus).toBe("Lean Republican (median of 10 forecasters)");
    expect(s.campaign_money.democratic_nominee_raised).toBe("$4.4 million");
    expect(s.outside_spending.helping_republicans).toBe("$3.6 million");
  });

  it("is its own inverse on the facts that matter", () => {
    const twice = swapFacts(swapFacts(facts));
    expect(twice.forecasters).toEqual(facts.forecasters);
    expect(twice.campaign_money).toEqual(facts.campaign_money);
    expect(twice.president_2024).toBe(facts.president_2024);
  });
});

describe("checks", () => {
  it("passes a grounded, neutral summary", () => {
    expect(checkSummary(GOOD, facts)).toEqual([]);
  });

  it("finds numbers that are not in the data", () => {
    expect(numbersIn("$2.40 million, 1,200 votes, R+3.2")).toEqual(["2.4", "1200", "3.2"]);
    const bad = { ...GOOD, summary: GOOD.summary.replace("3.2 points", "4.1 points") };
    expect(checkSummary(bad, facts).join(" ")).toMatch(/numbers not in the data: 4\.1/);
  });

  it("flags loaded words and predictions for either party", () => {
    for (const phrase of ["the embattled Republican", "the radical Democrat", "Brooks will win", "voters should back Mackenzie"]) {
      const bad = { ...GOOD, summary: `${GOOD.summary} Note ${phrase} here.` };
      expect(checkSummary(bad, facts).length).toBeGreaterThan(0);
    }
  });

  it("allows a flagged word when the data itself uses it", () => {
    const withParty = buildFacts({ ...RACE, others: "Chris Henry (Progressive)" }, CTX);
    const text = { ...GOOD, summary: `${GOOD.summary} Chris Henry of the Progressive Party is also on the ballot.` };
    expect(checkSummary(text, withParty)).toEqual([]);
  });

  it("requires both major candidates to be named", () => {
    const bad = { ...GOOD, summary: GOOD.summary.replace("faces Democrat Bob Brooks", "seeks a second term") };
    expect(checkSummary(bad, facts).join(" ")).toMatch(/democratic candidate/);
  });

  it("enforces lengths and plain text", () => {
    expect(checkSummary({ ...GOOD, what_decides: "Turnout." }, facts).join(" ")).toMatch(/what_decides is 1 words/);
    expect(checkSummary({ ...GOOD, summary: `**${GOOD.summary}**` }, facts).join(" ")).toMatch(/markdown/);
    expect(checkSummary({ summary: 3 }, facts)).toEqual(["output does not match the schema"]);
  });
});

describe("requests", () => {
  it("asks for schema-constrained JSON from claude-opus-5-5 with a valid custom_id", () => {
    const r = writeRequest("PA-07", facts);
    expect(r.custom_id).toMatch(/^[a-zA-Z0-9_-]{1,64}$/);
    expect(r.params.model).toBe("claude-opus-5-5");
    expect(r.params.output_config.format).toEqual({ type: "json_schema", schema: SUMMARY_SCHEMA });
    expect(r.params).not.toHaveProperty("fallbacks"); // rejected by the Batches API
    expect(r.params.messages[0].content).toContain('"race": "PA-07"');
  });
});
