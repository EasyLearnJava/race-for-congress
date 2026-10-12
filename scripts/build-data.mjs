// Turns the pipeline's CSVs in data/clean into typed JSON for the app (src/generated/)
// and copies the downloadable files into public/data/. Runs before `next dev` and `next build`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { csvParse } from "d3-dsv";

import { allFacts } from "./summaries/facts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const clean = join(root, "data", "clean");
const generated = join(root, "src", "generated");
const publicData = join(root, "public", "data");
mkdirSync(generated, { recursive: true });
mkdirSync(publicData, { recursive: true });

const str = (v) => (v == null ? "" : String(v));
const num = (v) => (v == null || v === "" ? null : Number(v));
const bool = (v) => v === "True" || v === "true";

/** Any CSV with numbers and True/False converted, for tables whose columns the page reads directly. */
function readCsvAuto(name) {
  const path = join(clean, name);
  if (!existsSync(path)) return null;
  return csvParse(readFileSync(path, "utf8"), (row) => {
    const out = {};
    for (const [k, v] of Object.entries(row)) {
      if (v === "True" || v === "False") out[k] = v === "True";
      else if (v === "") out[k] = null;
      else if (/^-?d+(.d+)?(e-?d+)?$/i.test(v)) out[k] = Number(v);
      else out[k] = v;
    }
    return out;
  });
}

function readCsv(name, columns) {
  const path = join(clean, name);
  if (!existsSync(path)) return null;
  const rows = csvParse(readFileSync(path, "utf8"));
  return rows.map((row) => {
    const out = {};
    for (const [key, [column, type]] of Object.entries(columns)) out[key] = type(row[column]);
    return out;
  });
}

const raceColumns = {
  id: ["race_id", str],
  state: ["state", str],
  stateName: ["state_name", str],
  harris24: ["harris_24", num],
  trump24: ["trump_24", num],
  total24: ["total_24", num],
  pres24: ["pres24_margin", num],
  lean: ["lean", num],
  incumbent: ["incumbent", str],
  incumbentParty: ["incumbent_party", str],
  incumbentRunning: ["incumbent_running", bool],
  openSeat: ["open_seat", bool],
  incumbentStatus: ["incumbent_status", str],
  dem: ["dem_candidate", str],
  rep: ["rep_candidate", str],
  others: ["other_candidates", str],
  special: ["special_case", str],
  rankedChoice: ["ranked_choice", bool],
  rating: ["rating_consensus", str],
  ratingScore: ["rating_score", num],
  ratingCount: ["rating_count", num],
  cook: ["rating_cook", str],
  ie: ["rating_ie", str],
  sabato: ["rating_sabato", str],
};

const datasets = {
  house: readCsv("races_house_2026.csv", {
    ...raceColumns,
    district: ["district", num],
    newLines: ["new_lines", bool],
    biden20: ["biden_20", num],
    trump20: ["trump_20", num],
    total20: ["total_20", num],
    pres20: ["pres20_margin", num],
    heldBy: ["held_by", str],
    heldByMember: ["held_by_member", str],
    firstElected: ["first_elected", str],
    otherIncumbents: ["other_incumbents", str],
    redistrictedFrom: ["redistricted_from", str],
  }),
  senate: readCsv("races_senate_2026.csv", { ...raceColumns, specialElection: ["special", bool] }),
  ratings: readCsv("ratings_2026.csv", {
    chamber: ["chamber", str],
    raceId: ["race_id", str],
    source: ["source", str],
    rating: ["rating", str],
    score: ["score", num],
    asOf: ["as_of", str],
  }),
  money: readCsv("money_2026.csv", {
    raceId: ["race_id", str],
    chamber: ["chamber", str],
    party: ["party", str],
    candidate: ["candidate", str],
    fecId: ["fec_candidate_id", str],
    receipts: ["receipts", num],
    disbursements: ["disbursements", num],
    cashOnHand: ["cash_on_hand", num],
    individual: ["individual_contributions", num],
    selfFunding: ["candidate_self_funding", num],
    debts: ["debts", num],
    coverageEnd: ["coverage_end", str],
  }),
  outside: readCsv("outside_spending_2026.csv", {
    raceId: ["race_id", str],
    chamber: ["chamber", str],
    supportDem: ["support_dem", num],
    opposeDem: ["oppose_dem", num],
    supportRep: ["support_rep", num],
    opposeRep: ["oppose_rep", num],
    proDem: ["pro_dem", num],
    proRep: ["pro_rep", num],
    total: ["total", num],
    last30: ["last_30_days_total", num],
    latest: ["latest_expenditure_date", str],
  }),
  spenders: readCsv("outside_spenders_2026.csv", {
    raceId: ["race_id", str],
    chamber: ["chamber", str],
    spender: ["spender", str],
    spenderId: ["spender_id", str],
    supportOppose: ["support_oppose", str],
    candidateParty: ["candidate_party", str],
    amount: ["amount", num],
    latest: ["latest_date", str],
  }),
  genericBallot: readCsv("generic_ballot_2026.csv", {
    source: ["source", str],
    dates: ["dates", str],
    updated: ["updated", str],
    dem: ["dem", num],
    rep: ["rep", num],
    margin: ["margin", num],
  }),
  oldLines: readCsv("house_2024_lines.csv", {
    id: ["race_id", str],
    state: ["state", str],
    harris24: ["harris_24", num],
    trump24: ["trump_24", num],
    total24: ["total_24", num],
    pres24: ["pres24_margin", num],
    heldBy: ["held_by", str],
  }),
  redistricting: readCsvAuto("redistricting_2026.csv"),
  redistrictingDistricts: readCsvAuto("redistricting_districts_2026.csv"),
  redistrictingCurve: readCsvAuto("redistricting_curve_2026.csv"),
  history: readCsv("house_history.csv", {
    year: ["year", num],
    id: ["race_id", str],
    dem: ["dem_votes", num],
    rep: ["rep_votes", num],
    total: ["total_votes", num],
    margin: ["margin", num],
    winnerParty: ["winner_party", str],
    winner: ["winner", str],
  }),
};

for (const [name, rows] of Object.entries(datasets)) {
  writeFileSync(join(generated, `${name}.json`), JSON.stringify(rows ?? []));
}
for (const file of ["hexmap_2026.json", "meta.json"]) {
  const source = join(clean, file);
  writeFileSync(join(generated, file.replace("_2026", "")), existsSync(source) ? readFileSync(source, "utf8") : "{}");
}

// AI race summaries (scripts/race-summaries.mjs): only published ones reach the site. A summary
// is stale when its race's facts have changed since it was written; the page says so.
const summaryStore = join(root, "data", "ai", "race_summaries.json");
const currentHash = new Map(
  allFacts({
    house: datasets.house ?? [],
    senate: datasets.senate ?? [],
    ratings: datasets.ratings ?? [],
    money: datasets.money ?? [],
    outside: datasets.outside ?? [],
    generated: JSON.parse(readFileSync(join(generated, "meta.json"), "utf8")).generated ?? "",
  }).map((f) => [f.id, f.hash]),
);
const summaries = Object.entries(existsSync(summaryStore) ? JSON.parse(readFileSync(summaryStore, "utf8")).races : {})
  .filter(([, s]) => s.status === "published" && s.summary)
  .map(([id, s]) => ({
    id,
    summary: s.summary,
    whatDecides: s.whatDecides,
    generatedAt: s.generatedAt,
    dataAsOf: s.dataAsOf,
    stale: currentHash.get(id) !== s.hash,
  }));
writeFileSync(join(generated, "summaries.json"), JSON.stringify(summaries));

// Public downloads: every clean CSV plus JSON versions of the race tables.
for (const file of [
  "races_house_2026.csv",
  "races_senate_2026.csv",
  "ratings_2026.csv",
  "money_2026.csv",
  "outside_spending_2026.csv",
  "outside_spenders_2026.csv",
  "generic_ballot_2026.csv",
  "house_2024_lines.csv",
  "redistricting_2026.csv",
  "redistricting_districts_2026.csv",
  "redistricting_curve_2026.csv",
  "house_history.csv",
  "meta.json",
]) {
  if (existsSync(join(clean, file))) copyFileSync(join(clean, file), join(publicData, file));
}
writeFileSync(join(publicData, "house.json"), JSON.stringify(datasets.house ?? []));
writeFileSync(join(publicData, "senate.json"), JSON.stringify(datasets.senate ?? []));

// Search index for the header search box (fetched on demand).
const people = (...names) => names.flatMap((n) => (n ? n.split(/ \/ |; /).map((s) => s.replace(/ \([^)]*\)$/, "")) : [])).filter(Boolean);
const states = [...new Map((datasets.house ?? []).map((r) => [r.state, r.stateName])).entries()];
const search = [
  ...states.map(([postal, name]) => ({ kind: "State", label: name, sub: postal, href: `/states/${postal.toLowerCase()}`, terms: `${name} ${postal}` })),
  ...(datasets.senate ?? []).map((r) => ({
    kind: "Senate",
    label: `${r.stateName} Senate`,
    sub: [r.dem, r.rep].filter(Boolean).join(" vs "),
    href: `/senate/${r.state.toLowerCase()}`,
    terms: [r.stateName, r.state, "senate", ...people(r.incumbent, r.dem, r.rep, r.others)].join(" "),
  })),
  ...(datasets.house ?? []).map((r) => ({
    kind: "House",
    label: r.id,
    sub: [r.incumbent || "Open seat", [r.dem, r.rep].filter(Boolean).join(" vs ")].filter(Boolean).join(" · "),
    href: `/house/${r.id.toLowerCase()}`,
    terms: [r.id, r.stateName, r.id.replace("-", " "), ...people(r.incumbent, r.dem, r.rep, r.others, r.heldByMember)].join(" "),
  })),
];
writeFileSync(join(publicData, "search.json"), JSON.stringify(search));

const counts = Object.fromEntries(Object.entries(datasets).map(([k, v]) => [k, v?.length ?? 0]));
console.log("build-data:", JSON.stringify({ ...counts, summaries: summaries.length, staleSummaries: summaries.filter((s) => s.stale).length }));
