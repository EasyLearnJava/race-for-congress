// Deterministic checks on a generated summary. Code decides the numbers; the model only writes
// sentences, so every number in a summary must already appear in the race's fact sheet. Pure.

export const LIMITS = { summary: [35, 110], what_decides: [8, 40] };

// Loaded or predictive language. A word is allowed when it appears in the fact sheet itself
// (e.g. a candidate of the "Progressive" party).
const BANNED = [
  "extreme", "extremist", "radical", "far-left", "far-right", "socialist", "fascist", "communist", "maga", "woke",
  "dangerous", "corrupt", "disgraced", "embattled", "controversial", "scandal", "scandal-plagued", "firebrand",
  "beleaguered", "moderate", "progressive", "conservative", "liberal", "populist", "establishment", "insurgent",
  "landslide", "blowout", "crushing", "stunning", "shocking", "devastating", "vulnerable", "weak", "strong",
  "popular", "unpopular", "beloved", "hated", "gop", "dems", "flip-flop", "rubber-stamp",
];
const BANNED_PHRASES = [
  /\bwill (?:win|lose|flip|hold|keep|take|defeat|beat|prevail)\b/i,
  /\b(?:is|are) (?:going|expected|projected|poised|set) to (?:win|lose|flip|hold|keep|take)\b/i,
  /\bvote (?:for|against)\b/i,
  /\bshould\b/i,
  /\bsure (?:thing|bet)\b/i,
  /\b(?:i|we) (?:think|believe|predict)\b/i,
];

function words(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Numbers in a text, normalized: "1,200" -> "1200", "3.10" -> "3.1", "$2.30" -> "2.3". */
export function numbersIn(text) {
  return (String(text).match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => {
    const plain = n.replace(/,/g, "");
    return plain.includes(".") ? String(Number(plain)) : plain.replace(/^0+(?=\d)/, "");
  });
}

/** Last name of a candidate entry like "Mary Peltola" or "Gerald Heikes / Dan J. Smith". */
function surnames(field) {
  if (!field || field === "none") return [];
  return field
    .split("/")
    .map((s) => s.replace(/\(.*?\)/g, "").trim().split(/\s+/).filter((w) => !/^(?:jr\.?|sr\.?|ii|iii|iv)$/i.test(w)).pop())
    .filter(Boolean);
}

/**
 * Check a summary against its fact sheet.
 * @returns {string[]} problems; empty means it passed
 */
export function checkSummary(output, facts) {
  const problems = [];
  if (!output || typeof output.summary !== "string" || typeof output.what_decides !== "string") {
    return ["output does not match the schema"];
  }
  const text = `${output.summary} ${output.what_decides}`;
  const factText = JSON.stringify(facts);

  const allowed = new Set(numbersIn(factText));
  const unknown = [...new Set(numbersIn(text))].filter((n) => !allowed.has(n));
  if (unknown.length) problems.push(`numbers not in the data: ${unknown.join(", ")}`);

  for (const [field, [min, max]] of Object.entries(LIMITS)) {
    const n = words(output[field]);
    if (n < min || n > max) problems.push(`${field} is ${n} words (allowed ${min}-${max})`);
  }

  const lowerFacts = factText.toLowerCase();
  const tokens = new Set(text.toLowerCase().match(/[a-z][a-z'-]*/g) ?? []);
  const banned = BANNED.filter((w) => tokens.has(w) && !lowerFacts.includes(w));
  if (banned.length) problems.push(`loaded or predictive words: ${banned.join(", ")}`);
  for (const pattern of BANNED_PHRASES) {
    const m = text.match(pattern);
    if (m) problems.push(`predictive or advocating phrase: "${m[0]}"`);
  }

  // Both major-party candidates are named when both are on the ballot.
  for (const side of ["democratic_candidate", "republican_candidate"]) {
    const names = surnames(facts[side]);
    if (names.length && !names.some((n) => text.includes(n))) problems.push(`does not name the ${side.replace("_", " ")} (${facts[side]})`);
  }

  if (/[*#_`]|https?:\/\//.test(text)) problems.push("contains markdown or a link");
  return problems;
}
