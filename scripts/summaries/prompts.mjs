// Prompts, output schemas and batch request builders for the race summaries.
// Model, effort and schemas follow CLAUDE.md: claude-opus-5-5, JSON via output_config.format.
// Batches do not accept the `fallbacks` parameter, so refusals are recorded and skipped.

export const MODEL = "claude-opus-5-5";

export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string", description: "Two or three sentences, 35-110 words." },
    what_decides: { type: "string", description: "One sentence, 8-40 words." },
  },
  required: ["summary", "what_decides"],
  additionalProperties: false,
};

export const GRADE_SCHEMA = {
  type: "object",
  properties: {
    grounded: { type: "boolean" },
    neutral: { type: "boolean" },
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["grounded", "neutral", "problems"],
  additionalProperties: false,
};

export const SWAP_SCHEMA = {
  type: "object",
  properties: {
    equivalent: { type: "boolean" },
    problems: { type: "array", items: { type: "string" } },
  },
  required: ["equivalent", "problems"],
  additionalProperties: false,
};

export const WRITER_SYSTEM = `You write short, strictly neutral race summaries for "218", a nonpartisan website about the 2026 US House and Senate elections. Readers include people outside the US who are new to American politics.

You receive one race's fact sheet as JSON. Write:
- "summary": two or three plain sentences (35-110 words) on who is running, who holds the seat, how the area voted for president in 2024, and how forecasters rate the race. Mention money only if the fact sheet has it.
- "what_decides": one sentence (8-40 words) on what the facts suggest will matter, phrased as a question of the data (for example the gap between the district's presidential vote and the forecasters' rating, an open seat, new district lines, or a fundraising gap). Never predict the winner.

Rules:
- Use only facts in the sheet. Do not add ideology, biography, issues, polls, endorsements or events you know from elsewhere.
- Copy every number exactly as the sheet writes it (margins like "R+3.1", money like "$2.3 million", counts, dates). Do not compute new numbers, percentages or differences.
- Name both major-party candidates with their party, in the same way. Describe both parties with the same kind of wording; no adjectives about candidates or parties.
- Attribute ratings to forecasters ("forecasters rate it Lean Republican"); never state an outcome as fact or say who will win.
- Write "Democratic"/"Democrat" and "Republican" in full, never "GOP" or "Dems".
- Plain text only: no markdown, lists, links or emoji. Respond directly without preamble.`;

export const GRADER_SYSTEM = `You check short race summaries written for a nonpartisan election website. You receive a race's fact sheet (JSON) and a summary of it.

Return:
- "grounded": true only if every fact and number in the summary is stated in, or directly follows from, the fact sheet. Outside knowledge counts as not grounded.
- "neutral": true only if both parties and candidates are described with equivalent wording, there are no loaded or evaluative adjectives, no prediction of the winner, and nothing that encourages voting for or against anyone.
- "problems": a short list naming each issue found; empty when both are true.

Judge strictly but do not invent problems. Respond directly without preamble.`;

export const SWAP_SYSTEM = `You test a nonpartisan election website for partisan asymmetry. The same race summary was written twice: once from the real fact sheet, and once from a copy with the parties exchanged, whose party words were then exchanged back. If the writer is even-handed, both versions describe the race with the same tone.

Return:
- "equivalent": true if the two versions give the same impression of each party and candidate. Different wording or sentence order is fine; differences in favorability, emphasis on one side's strengths or weaknesses, hedging, or omitted facts for one side are not.
- "problems": each asymmetry found; empty when equivalent.

Respond directly without preamble.`;

const json = (value) => "```json\n" + JSON.stringify(value, null, 2) + "\n```";

function request(customId, system, content, schema, effort, maxTokens) {
  return {
    custom_id: customId,
    params: {
      model: MODEL,
      max_tokens: maxTokens,
      output_config: { effort, format: { type: "json_schema", schema } },
      // Same system prompt on every request in the batch, so it can be served from cache.
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content }],
    },
  };
}

// custom_id allows [a-zA-Z0-9_-]{1,64}: race ids already fit ("PA-07", "TX-SEN").
export function writeRequest(id, facts, variant = "real") {
  return request(`${variant === "swap" ? "swap" : "gen"}__${id}`, WRITER_SYSTEM, `Fact sheet:\n${json(facts)}`, SUMMARY_SCHEMA, "medium", 8000);
}

export function gradeRequest(id, facts, output) {
  return request(`grade__${id}`, GRADER_SYSTEM, `Fact sheet:\n${json(facts)}\n\nSummary:\n${json(output)}`, GRADE_SCHEMA, "low", 4000);
}

export function swapRequest(id, original, swappedBack) {
  return request(`swapcmp__${id}`, SWAP_SYSTEM, `Version A:\n${json(original)}\n\nVersion B:\n${json(swappedBack)}`, SWAP_SCHEMA, "low", 4000);
}

export function parseCustomId(customId) {
  const [kind, id] = customId.split("__");
  return { kind, id };
}

// Batch pricing is half the standard rate: claude-opus-5-5 is $4 / $20 per million tokens.
export const BATCH_PRICE = { input: 2 / 1e6, output: 10 / 1e6 };

/** Rough cost before running: ~4 characters per token, plus assumed output sizes. */
export function estimateCost(requests, outputTokens) {
  let input = 0;
  let output = 0;
  for (const r of requests) {
    input += Math.ceil((JSON.stringify(r.params.messages) + r.params.system[0].text).length / 4);
    output += outputTokens[r.custom_id.split("__")[0]] ?? 1000;
  }
  return { input, output, dollars: input * BATCH_PRICE.input + output * BATCH_PRICE.output };
}
