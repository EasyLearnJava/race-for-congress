import type { Metadata } from "next";

import { house, meta, money, outside, senate, spenders } from "@/lib/data";
import type { HouseRace, MoneyRow, SenateRace, Source } from "@/lib/data/types";
import { districtName } from "@/lib/format";
import { MoneyDashboard } from "./_components/money-dashboard";
import type { CandidateMoney, Coverage, MoneyRace, SideMoney, SpenderRace, SpenderSummary } from "./_components/types";

export const metadata: Metadata = {
  title: "Campaign money",
  description:
    "Where campaign and outside money is going in the 2026 House and Senate races: candidate fundraising, independent expenditures, the largest outside spenders, and money compared with the model.",
};

/** Largest outside spenders sent to the page; the full list is a download on /data. */
const MAX_SPENDERS = 200;

type AnyRace = (HouseRace & { chamber: "house" }) | (SenateRace & { chamber: "senate" });

function sumOrNull(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v != null && Number.isFinite(v));
  return present.length ? present.reduce((a, b) => a + b, 0) : null;
}

function side(rows: MoneyRow[]): SideMoney | null {
  if (rows.length === 0) return null;
  return {
    names: rows.map((r) => r.candidate).join(" / "),
    raised: sumOrNull(rows.map((r) => r.receipts)),
    spent: sumOrNull(rows.map((r) => r.disbursements)),
    cash: sumOrNull(rows.map((r) => r.cashOnHand)),
  };
}

function maxDate(dates: string[]): string {
  return dates.filter(Boolean).reduce((a, b) => (b > a ? b : a), "");
}

function minDate(dates: string[]): string {
  return dates.filter(Boolean).reduce((a, b) => (a === "" || b < a ? b : a), "");
}

/** General-election nominees the FEC step tries to match (same rule as pipeline/fec.py nominees()). */
function countNominees(races: AnyRace[]): number {
  let n = 0;
  for (const r of races) {
    const dems = r.dem.split(" / ").filter((s) => s.trim());
    const reps = r.rep.split(" / ").filter((s) => s.trim());
    n += dems.length + reps.length;
    for (const item of r.others.split("; ").filter((s) => s.trim())) {
      const party = /\(([^()]*)\)\s*$/.exec(item)?.[1] ?? "";
      if (/independent/i.test(party) || dems.length === 0 || reps.length === 0) n += 1;
    }
  }
  return n;
}

function sourceLine(key: string, fallback: string): string {
  const s = meta.sources?.[key] as (Source & { as_of?: string }) | undefined;
  if (!s?.name) return fallback;
  const when = s.as_of || s.retrieved;
  return when ? `${s.name}, as of ${when}` : s.name;
}

export default function MoneyPage() {
  const allRaces: AnyRace[] = [
    ...house.map((r) => ({ ...r, chamber: "house" as const })),
    ...senate.map((r) => ({ ...r, chamber: "senate" as const })),
  ];
  const raceById = new Map(allRaces.map((r) => [r.id, r]));

  // Candidate money, grouped by race and side.
  const moneyByRace = new Map<string, MoneyRow[]>();
  for (const row of money) {
    if (!raceById.has(row.raceId)) continue;
    const list = moneyByRace.get(row.raceId) ?? [];
    list.push(row);
    moneyByRace.set(row.raceId, list);
  }
  const outsideByRace = new Map(outside.filter((o) => raceById.has(o.raceId)).map((o) => [o.raceId, o]));

  const ids = new Set([...moneyByRace.keys(), ...outsideByRace.keys()]);
  const races: MoneyRace[] = [...ids].map((id) => {
    const r = raceById.get(id)!;
    const rows = moneyByRace.get(id);
    const o = outsideByRace.get(id);
    const candidates: CandidateMoney | null = rows
      ? {
          dem: side(rows.filter((m) => m.party === "D")),
          rep: side(rows.filter((m) => m.party === "R")),
          other: side(rows.filter((m) => m.party !== "D" && m.party !== "R")),
          coverageEnd: maxDate(rows.map((m) => m.coverageEnd)),
        }
      : null;
    const isSenate = r.chamber === "senate";
    return {
      id: r.id,
      lean: r.lean,
      incumbentRunning: r.incumbentRunning,
      incumbentParty: r.incumbentParty,
      special: r.special,
      ratingScore: r.ratingScore,
      ratingCount: r.ratingCount,
      chamber: r.chamber,
      label: isSenate ? `${r.stateName} Senate` : r.id,
      place: isSenate
        ? `${r.stateName} Senate${(r as SenateRace).specialElection ? " (special)" : ""}`
        : districtName(r.id, r.stateName),
      state: r.state,
      rating: r.rating,
      dem: r.dem,
      rep: r.rep,
      challenger: r.special === "independent_vs_R" ? "I" : "D",
      candidates,
      outside: o
        ? {
            proDem: o.proDem,
            proRep: o.proRep,
            other: Math.max(0, o.total - o.proDem - o.proRep),
            total: o.total,
            last30: o.last30,
            latest: o.latest,
          }
        : null,
    };
  });

  // Outside spenders, aggregated by committee across races.
  const bySpender = new Map<string, SpenderSummary & { byRace: Map<string, number> }>();
  const spenderRaceMap = new Map<string, SpenderRace>();
  for (const s of spenders) {
    if (!raceById.has(s.raceId) || !Number.isFinite(s.amount)) continue;
    const key = s.spenderId || s.spender;
    const agg = bySpender.get(key) ?? {
      id: key,
      name: s.spender || key,
      total: 0,
      proDem: 0,
      proRep: 0,
      other: 0,
      races: [],
      latest: "",
      byRace: new Map<string, number>(),
    };
    const pro =
      (s.supportOppose === "S" && s.candidateParty === "D") || (s.supportOppose === "O" && s.candidateParty === "R")
        ? "proDem"
        : (s.supportOppose === "S" && s.candidateParty === "R") || (s.supportOppose === "O" && s.candidateParty === "D")
          ? "proRep"
          : "other";
    agg.total += s.amount;
    agg[pro] += s.amount;
    agg.byRace.set(s.raceId, (agg.byRace.get(s.raceId) ?? 0) + s.amount);
    if (s.latest > agg.latest) agg.latest = s.latest;
    bySpender.set(key, agg);

    const rk = `${key}|${s.raceId}`;
    const sr = spenderRaceMap.get(rk) ?? { spender: key, raceId: s.raceId, proDem: 0, proRep: 0, other: 0 };
    sr[pro] += s.amount;
    spenderRaceMap.set(rk, sr);
  }
  const rankedSpenders = [...bySpender.values()].sort((a, b) => b.total - a.total);
  const topSpenders: SpenderSummary[] = rankedSpenders.slice(0, MAX_SPENDERS).map(({ byRace, ...rest }) => ({
    ...rest,
    races: [...byRace.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id),
  }));
  const kept = new Set(topSpenders.map((s) => s.id));
  const spenderRaces = [...spenderRaceMap.values()].filter((r) => kept.has(r.spender));

  const matchedRows = money.filter((m) => raceById.has(m.raceId));
  const coverage: Coverage = {
    candidateEnd: maxDate(matchedRows.map((m) => m.coverageEnd)),
    candidateEarliest: minDate(matchedRows.map((m) => m.coverageEnd)),
    outsideLatest: maxDate(outside.map((o) => o.latest)),
    nominees: countNominees(allRaces),
    matched: matchedRows.length,
    reporting: matchedRows.filter((m) => m.receipts != null).length,
    candidateSource: sourceLine("fec_candidates", "Federal Election Commission, House and Senate current campaigns"),
    outsideSource: sourceLine("fec_independent_expenditures", "Federal Election Commission, 24- and 48-hour independent-expenditure reports"),
  };

  return (
    <MoneyDashboard
      races={races}
      spenders={topSpenders}
      spenderRaces={spenderRaces}
      spenderCount={rankedSpenders.length}
      coverage={coverage}
    />
  );
}
