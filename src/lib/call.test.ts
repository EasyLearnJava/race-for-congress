import { describe, expect, it } from "vitest";

import {
  MAJORITY,
  baselinePick,
  buildDeck,
  callHeadline,
  decodePicks,
  encodePicks,
  longId,
  picksQuery,
  seatsNeeded,
  shortId,
  tally,
  type CallRace,
  type Choice,
} from "./call";

const race = (id: string, rating: CallRace["rating"], ratingScore: number, heldBy: CallRace["heldBy"] = "R", special: CallRace["special"] = ""): CallRace => ({
  id,
  rating,
  ratingScore,
  heldBy,
  special,
});

// 435 seats: 210 Safe D, 200 Safe R, and a 25-seat deck (10 Lean D, 5 Tossup, 10 Lean R).
function chamber(): CallRace[] {
  const races: CallRace[] = [];
  for (let i = 0; i < 210; i++) races.push(race(`DD-${String(i).padStart(2, "0")}`, "Safe D", 3, "D"));
  for (let i = 0; i < 200; i++) races.push(race(`RR-${String(i).padStart(2, "0")}`, "Safe R", -3, "R"));
  for (let i = 0; i < 10; i++) races.push(race(`LD-${String(i).padStart(2, "0")}`, "Lean D", 1, "R"));
  for (let i = 0; i < 5; i++) races.push(race(`TU-${String(i).padStart(2, "0")}`, "Tossup", 0, i % 2 ? "D" : "R"));
  for (let i = 0; i < 10; i++) races.push(race(`LR-${String(i).padStart(2, "0")}`, "Lean R", -1, "D"));
  return races;
}

describe("deck", () => {
  it("holds Lean and Toss-up seats, closest first, ties by id", () => {
    const deck = buildDeck([race("PA-07", "Lean D", 1), race("AZ-01", "Tossup", 0), race("NY-17", "Lean R", -0.5), race("CA-01", "Safe D", 3)]);
    expect(deck.map((r) => r.id)).toEqual(["AZ-01", "NY-17", "PA-07"]);
  });

  it("leaves out seats the ballot decides even when rated close", () => {
    expect(buildDeck([race("CA-40", "Tossup", 0, "R", "same_party_R")])).toEqual([]);
  });

  it("is symmetric: mirroring every rating mirrors the order", () => {
    const races = [race("AA-01", "Lean D", 1), race("BB-01", "Lean R", -1), race("CC-01", "Tossup", 0)];
    const mirrored = races.map((r) => ({ ...r, ratingScore: -r.ratingScore, rating: (r.rating === "Lean D" ? "Lean R" : r.rating === "Lean R" ? "Lean D" : r.rating) as CallRace["rating"] }));
    expect(buildDeck(races).map((r) => r.id)).toEqual(buildDeck(mirrored).map((r) => r.id));
  });
});

describe("baselinePick", () => {
  it("uses the ballot first, then the rating side", () => {
    expect(baselinePick(race("X-01", "Safe R", -3, "R", "no_republican"))).toBe("D");
    expect(baselinePick(race("X-01", "Likely D", 2))).toBe("D");
    expect(baselinePick(race("X-01", "Likely R", -2))).toBe("R");
    expect(baselinePick(race("X-01", "Tossup", 0))).toBe("T");
  });
});

describe("tally", () => {
  it("leaves deck seats open until called", () => {
    const t = tally(chamber(), new Map());
    expect(t).toMatchObject({ D: 210, R: 200, T: 0, open: 25, winner: null });
    expect(seatsNeeded(chamber())).toEqual({ D: 8, R: 18, deck: 25 });
  });

  it("counts picks, toss-ups and gains against who holds each seat", () => {
    const picks = new Map<string, Choice>([
      ["LD-00", "D"], // held R: a D gain
      ["LR-00", "R"], // held D: an R gain
      ["TU-00", "T"],
      ["DD-00", "R"], // a Safe seat the user overrides
    ]);
    const t = tally(chamber(), picks);
    expect(t).toMatchObject({ D: 210, R: 202, T: 1, open: 22, gainsD: 1, gainsR: 2 });
    expect(t.D + t.R + t.T + t.open).toBe(435);
  });

  it("names a winner at exactly 218, for either party, with the same template", () => {
    const races = chamber();
    const allD = new Map<string, Choice>(buildDeck(races).slice(0, 8).map((r) => [r.id, "D"]));
    const d = tally(races, allD);
    expect(d.D).toBe(MAJORITY);
    expect(d.winner).toBe("D");
    expect(callHeadline(d)).toBe("Democrats win 218 seats, exactly the 218 needed.");

    const mirrored = races.map((r) => ({ ...r, rating: (r.rating.endsWith("D") ? r.rating.replace("D", "R") : r.rating.endsWith("R") ? r.rating.replace(/R$/, "D") : r.rating) as CallRace["rating"] }));
    const allR = new Map<string, Choice>([...allD].map(([id]) => [id, "R"]));
    const r = tally(mirrored, allR);
    expect(callHeadline(r)).toBe(callHeadline(d).replace("Democrats", "Republicans"));
  });

  it("describes a House with no majority", () => {
    expect(callHeadline(tally(chamber(), new Map()))).toBe("No majority yet: Democrats 210, Republicans 200, 25 seats undecided.");
  });
});

describe("URL encoding", () => {
  it("round-trips ids", () => {
    expect(shortId("AZ-01")).toBe("az01");
    expect(longId("akal")).toBe("AK-AL");
  });

  it("round-trips picks and drops unknown or malformed ids", () => {
    const picks = new Map<string, Choice>([
      ["PA-07", "R"],
      ["AZ-01", "D"],
      ["NY-17", "T"],
    ]);
    const encoded = encodePicks(picks);
    expect(encoded).toEqual({ d: "az01", t: "ny17", r: "pa07" });
    const valid = new Set(["PA-07", "AZ-01", "NY-17"]);
    const decoded = decodePicks((k) => ({ ...encoded, d: "az01.zz99.<script>" })[k], valid);
    expect([...decoded].sort()).toEqual([...picks].sort());
  });

  it("builds a stable query string", () => {
    const picks = new Map<string, Choice>([
      ["PA-07", "D"],
      ["AZ-01", "D"],
    ]);
    expect(picksQuery(picks, { shared: "1" })).toBe("d=az01.pa07&shared=1");
  });
});
