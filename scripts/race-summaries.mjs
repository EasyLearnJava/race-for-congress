// AI race summaries: written in advance with the Message Batches API, then checked before
// anything is published. See docs/AI_SUMMARIES.md.
//
//   node scripts/race-summaries.mjs plan [--limit N] [--ids PA-07,TX-SEN] [--all]   cost estimate, no API calls
//   node scripts/race-summaries.mjs run  [--limit N] [--ids ...] [--all] [--retry] [--wait]
//   node scripts/race-summaries.mjs approve PA-07 NY-17 ... | --passed               publish reviewed summaries
//   node scripts/race-summaries.mjs reject PA-07 ...
//   node scripts/race-summaries.mjs review                                           rewrite data/ai/review.md
//
// `run` is resumable: it submits a batch, or picks up the one in progress (two stages: write,
// then grade). Credentials come from ANTHROPIC_API_KEY (or .env.local) or an `ant auth` profile.
import Anthropic from "@anthropic-ai/sdk";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { checkSummary } from "./summaries/checks.mjs";
import { allFacts, swapFacts, swapText } from "./summaries/facts.mjs";
import { BATCH_PRICE, MODEL, estimateCost, gradeRequest, parseCustomId, swapRequest, writeRequest } from "./summaries/prompts.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const AI = join(root, "data", "ai");
const STORE = join(AI, "race_summaries.json");
const STATE = join(AI, ".state.json"); // batch in progress; not committed
const REVIEW = join(AI, "review.md");
const ASSUMED_OUTPUT = { gen: 1500, swap: 1500, grade: 600, swapcmp: 600 };

const readJson = (path, fallback) => (existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback);
const writeJson = (path, value) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
};
const today = () => new Date().toISOString().slice(0, 10);

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--limit") out.limit = Number(argv[++i]);
    else if (a === "--ids") out.ids = argv[++i].split(",").map((s) => s.trim().toUpperCase());
    else if (a.startsWith("--")) out[a.slice(2)] = true;
    else out._.push(a);
  }
  return out;
}

/** Every race's fact sheet, built from the same generated data the site uses. */
function loadRaces() {
  execFileSync(process.execPath, [join(root, "scripts", "build-data.mjs")], { stdio: "ignore" });
  const gen = (name) => JSON.parse(readFileSync(join(root, "src", "generated", `${name}.json`), "utf8"));
  return allFacts({
    house: gen("house"),
    senate: gen("senate"),
    ratings: gen("ratings"),
    money: gen("money"),
    outside: gen("outside"),
    generated: gen("meta").generated,
  });
}

function pickTargets(races, store, opts) {
  let list = races.filter((r) => {
    if (opts.ids) return opts.ids.includes(r.id);
    const prev = store.races[r.id];
    if (opts.all || !prev || prev.hash !== r.hash) return true;
    return opts.retry && ["rejected", "refused", "error"].includes(prev.status);
  });
  // Competitive races first: they matter most and each one gets a person's review.
  list.sort((a, b) => Number(b.competitive) - Number(a.competitive) || a.id.localeCompare(b.id));
  if (opts.limit) list = list.slice(0, opts.limit);
  return list;
}

function writeRequests(targets) {
  return targets.flatMap((r) => [writeRequest(r.id, r.facts), ...(r.competitive ? [writeRequest(r.id, swapFacts(r.facts), "swap")] : [])]);
}

function printEstimate(label, requests, gradeCount) {
  const write = estimateCost(requests, ASSUMED_OUTPUT);
  // The grading stage sends each fact sheet again with its summary: about the same input, less output.
  const grade = { input: write.input * 1.1, output: gradeCount * ASSUMED_OUTPUT.grade };
  const dollars = write.dollars + grade.input * BATCH_PRICE.input + grade.output * BATCH_PRICE.output;
  console.log(`${label}: ${requests.length} writing requests, about ${gradeCount} grading requests`);
  console.log(`  estimated cost: $${dollars.toFixed(2)} at batch prices (${MODEL}; output sizes assumed, thinking included)`);
}

// ---------- the resumable run ----------

function textOf(message) {
  const block = message.content.find((b) => b.type === "text");
  return block ? block.text : "";
}

async function collect(client, batchId) {
  const results = new Map();
  const usage = { input: 0, output: 0 };
  for await (const item of await client.messages.batches.results(batchId)) {
    const { kind, id } = parseCustomId(item.custom_id);
    const r = item.result;
    let entry;
    if (r.type !== "succeeded") entry = { error: r.type === "errored" ? `${r.error?.type ?? "error"}` : r.type };
    else {
      const m = r.message;
      usage.input += (m.usage.input_tokens ?? 0) + (m.usage.cache_read_input_tokens ?? 0) + (m.usage.cache_creation_input_tokens ?? 0);
      usage.output += m.usage.output_tokens ?? 0;
      if (m.stop_reason === "refusal") entry = { refused: m.stop_details?.category ?? "unspecified" };
      else if (m.stop_reason === "max_tokens") entry = { error: "max_tokens" };
      else {
        try {
          entry = { output: JSON.parse(textOf(m)) };
        } catch {
          entry = { error: "invalid JSON" };
        }
      }
    }
    results.set(`${kind}__${id}`, entry);
  }
  const cost = usage.input * BATCH_PRICE.input + usage.output * BATCH_PRICE.output;
  console.log(`  tokens: ${usage.input} in, ${usage.output} out (about $${cost.toFixed(2)}, before cache discounts)`);
  return results;
}

async function waitFor(client, batchId, wait) {
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    const c = batch.request_counts;
    console.log(`  batch ${batchId}: ${batch.processing_status} (${c.succeeded} succeeded, ${c.errored} errored, ${c.processing} processing)`);
    if (batch.processing_status === "ended") return true;
    if (!wait) return false;
    await new Promise((r) => setTimeout(r, 60_000));
  }
}

function finalize(store, state, grades) {
  for (const [id, p] of Object.entries(state.pending)) {
    const grade = grades.get(`grade__${id}`);
    const swap = grades.get(`swapcmp__${id}`);
    const problems = [...p.problems];
    if (p.refused) problems.push(`refused (${p.refused})`);
    if (p.error) problems.push(`writing failed: ${p.error}`);
    if (p.output && !p.refused && !p.error) {
      if (!grade?.output) problems.push(`not graded${grade?.error ? `: ${grade.error}` : ""}`);
      else {
        if (!grade.output.grounded) problems.push("grader: not grounded in the data");
        if (!grade.output.neutral) problems.push("grader: not neutral");
        problems.push(...grade.output.problems.map((s) => `grader: ${s}`));
      }
      if (p.competitive) {
        if (!swap?.output) problems.push("party-swap test did not run");
        else if (!swap.output.equivalent) problems.push(...["party-swap test: tone differs", ...swap.output.problems.map((s) => `party swap: ${s}`)]);
      }
    }
    const failed = p.refused || p.error || problems.length > 0;
    store.races[id] = {
      status: p.refused ? "refused" : p.error ? "error" : failed ? "rejected" : p.competitive ? "needs_review" : "published",
      competitive: p.competitive,
      hash: p.hash,
      model: MODEL,
      generatedAt: today(),
      dataAsOf: p.facts.data_as_of,
      summary: p.output?.summary ?? null,
      whatDecides: p.output?.what_decides ?? null,
      swapped: p.swapOutput ?? null,
      problems,
      facts: p.facts,
    };
  }
  store.updated = today();
}

async function run(opts) {
  const client = new Anthropic();
  const store = readJson(STORE, { model: MODEL, updated: null, races: {} });
  let state = readJson(STATE, null);

  if (!state) {
    const targets = pickTargets(loadRaces(), store, opts);
    if (!targets.length) return console.log("All summaries are up to date with the data.");
    const requests = writeRequests(targets);
    printEstimate("Submitting", requests, targets.length + targets.filter((t) => t.competitive).length);
    const batch = await client.messages.batches.create({ requests });
    state = { stage: "write", batchId: batch.id, submitted: new Date().toISOString(), targets: Object.fromEntries(targets.map((t) => [t.id, t])) };
    writeJson(STATE, state);
    console.log(`Writing batch ${batch.id} submitted. Run this command again (or add --wait) to continue.`);
    if (!opts.wait) return;
  }

  if (state.stage === "write") {
    if (!(await waitFor(client, state.batchId, opts.wait))) return;
    const results = await collect(client, state.batchId);
    const pending = {};
    for (const [id, t] of Object.entries(state.targets)) {
      const gen = results.get(`gen__${id}`) ?? { error: "missing" };
      const swap = results.get(`swap__${id}`);
      pending[id] = {
        facts: t.facts,
        hash: t.hash,
        competitive: t.competitive,
        output: gen.output,
        refused: gen.refused,
        error: gen.error,
        problems: gen.output ? checkSummary(gen.output, t.facts) : [],
        swapOutput: swap?.output ? { summary: swapText(swap.output.summary), what_decides: swapText(swap.output.what_decides) } : null,
      };
    }
    const requests = Object.entries(pending).flatMap(([id, p]) => [
      ...(p.output ? [gradeRequest(id, p.facts, p.output)] : []),
      ...(p.output && p.swapOutput ? [swapRequest(id, p.output, p.swapOutput)] : []),
    ]);
    if (!requests.length) {
      finalize(store, { pending }, new Map());
      writeJson(STORE, store);
      writeJson(STATE, null);
      return console.log("Nothing to grade; results recorded.");
    }
    const batch = await client.messages.batches.create({ requests });
    state = { stage: "grade", batchId: batch.id, submitted: new Date().toISOString(), pending };
    writeJson(STATE, state);
    console.log(`Grading batch ${batch.id} submitted (${requests.length} requests).`);
    if (!opts.wait) return;
  }

  if (state.stage === "grade") {
    if (!(await waitFor(client, state.batchId, opts.wait))) return;
    const grades = await collect(client, state.batchId);
    finalize(store, state, grades);
    writeJson(STORE, store);
    writeFileSync(STATE, "null\n");
    writeReview(store);
    report(store);
  }
}

// ---------- review ----------

function report(store) {
  const counts = {};
  for (const r of Object.values(store.races)) counts[r.status] = (counts[r.status] ?? 0) + 1;
  console.log("Summaries by status:", counts);
  console.log(`Review the competitive ones in ${REVIEW}, then: node scripts/race-summaries.mjs approve <ids> (or --passed)`);
}

function writeReview(store) {
  const rows = Object.entries(store.races)
    .filter(([, r]) => r.status === "needs_review" || r.status === "rejected")
    .sort(([a, x], [b, y]) => x.status.localeCompare(y.status) || a.localeCompare(b));
  const lines = [
    "# Race summaries to review",
    "",
    "Generated by `scripts/race-summaries.mjs`. Every Lean and Toss-up summary needs a person's approval before it is published:",
    "`node scripts/race-summaries.mjs approve PA-07 NY-17` (or `--passed` for every one that passed all checks). Rejected summaries are never shown.",
    "",
  ];
  for (const [id, r] of rows) {
    lines.push(`## ${id} · ${r.status === "rejected" ? "REJECTED" : "needs review"}`, "");
    lines.push(`**Candidates:** ${r.facts.democratic_candidate} (D) · ${r.facts.republican_candidate} (R) · **Forecasters:** ${r.facts.forecasters.consensus}`, "");
    if (r.summary) lines.push(`> ${r.summary}`, ">", `> **What decides it:** ${r.whatDecides}`, "");
    if (r.swapped) lines.push(`Party-swap version (mapped back): _${r.swapped.summary} ${r.swapped.what_decides}_`, "");
    lines.push(r.problems.length ? r.problems.map((p) => `- ${p}`).join("\n") : "- All checks passed.", "");
  }
  mkdirSync(AI, { recursive: true });
  writeFileSync(REVIEW, lines.join("\n"));
}

function setStatus(store, ids, from, to) {
  let n = 0;
  for (const id of ids) {
    const r = store.races[id];
    if (!r) console.log(`  ${id}: no summary`);
    else if (!from.includes(r.status)) console.log(`  ${id}: is ${r.status}, left unchanged`);
    else if (to === "published" && r.problems.length) console.log(`  ${id}: has open problems, left unchanged`);
    else {
      r.status = to;
      n++;
    }
  }
  writeJson(STORE, store);
  writeReview(store);
  console.log(`${n} summar${n === 1 ? "y" : "ies"} set to ${to}.`);
}

// ---------- main ----------

const opts = args(process.argv.slice(2));
const command = opts._.shift();
try {
  process.loadEnvFile(join(root, ".env.local"));
} catch {
  // No .env.local: the SDK falls back to ANTHROPIC_API_KEY or an `ant auth` profile.
}

if (command === "plan") {
  const store = readJson(STORE, { races: {} });
  const targets = pickTargets(loadRaces(), store, opts);
  console.log(`${targets.length} races to write (${targets.filter((t) => t.competitive).length} competitive, each with a party-swap twin).`);
  printEstimate("Plan", writeRequests(targets), targets.length + targets.filter((t) => t.competitive).length);
} else if (command === "run") {
  await run(opts);
} else if (command === "approve") {
  const store = readJson(STORE, { races: {} });
  const ids = opts.passed ? Object.keys(store.races).filter((id) => store.races[id].status === "needs_review" && !store.races[id].problems.length) : opts._.map((s) => s.toUpperCase());
  setStatus(store, ids, ["needs_review"], "published");
} else if (command === "reject") {
  setStatus(readJson(STORE, { races: {} }), opts._.map((s) => s.toUpperCase()), ["needs_review", "published"], "rejected");
} else if (command === "review") {
  const store = readJson(STORE, { races: {} });
  writeReview(store);
  report(store);
} else {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(0, 12).join("\n"));
  process.exitCode = 1;
}
