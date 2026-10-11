// "Ask 218": a Claude-powered analyst that answers questions by calling this site's own data
// and model as tools. Disabled (503) unless ANTHROPIC_API_KEY is set on the deployment.
import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";

import { TOOLS, runTool, scenarioFrom } from "@/lib/ai/tools";
import { meta } from "@/lib/data";

const MODEL = "claude-opus-5-5";
const MAX_STEPS = 6;
const MAX_QUESTION = 600;

const SYSTEM = `You are "218", a nonpartisan analyst for an election-data website about the 2026 United States midterm elections (all 435 House seats and 35 Senate races; Election Day is November 3, 2026). Data last updated ${meta.generated}.

How to answer:
- Get every number from the tools. Never state a margin, probability, rating, candidate or dollar figure from memory. If the tools do not have it, say so.
- The model's probabilities and margins depend on the user's scenario (a national-vote setting); say "in this scenario" or "the model" rather than presenting them as predictions.
- Always mention race ids exactly as written by the tools (PA-07, AK-AL, TX-SEN) so the site can link them.
- Be balanced: describe both parties with the same kind of language. Never tell anyone how to vote or which side to support.
- For registering, polling places, deadlines or how to vote, point people to https://vote.gov and their state election office.
- Keep answers short and scannable: a one-sentence answer first, then up to 6 bullets. Plain markdown only (bold and bullet lists; no tables, no headings).
- Margins are Democratic minus Republican: "D+3.2" means Democrats ahead by 3.2 points.`;

// Best-effort limit per server instance: 12 questions per IP per 10 minutes.
const WINDOW_MS = 10 * 60 * 1000;
const LIMIT = 12;
const hits = new Map<string, number[]>();
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  return recent.length > LIMIT;
}

interface Turn {
  role: "user" | "assistant";
  content: string;
}

function parseHistory(raw: unknown): Turn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is Turn => !!t && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
    .slice(-6)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 4000) }));
}

export async function POST(request: NextRequest) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: "not_configured" }, { status: 503 });
  }
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const body = (await request.json().catch(() => null)) as { question?: unknown; history?: unknown; scenario?: unknown } | null;
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question || question.length > MAX_QUESTION) {
    return NextResponse.json({ error: "bad_question" }, { status: 400 });
  }

  const params = scenarioFrom(body?.scenario);
  const history = parseHistory(body?.history);
  // A conversation must start with the user.
  while (history.length && history[0].role !== "user") history.shift();
  const messages: Anthropic.Beta.BetaMessageParam[] = [...history, { role: "user", content: question }];
  const toolsUsed: string[] = [];
  const client = new Anthropic();

  try {
    for (let step = 0; step < MAX_STEPS; step++) {
      const response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low" },
        system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      });

      if (response.stop_reason === "refusal") {
        return NextResponse.json({
          answer: "I can't help with that one. Try asking about a race, a state, the forecasters or either chamber.",
          toolsUsed,
        });
      }

      const toolUses = response.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const answer = response.content
          .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        return NextResponse.json({ answer: answer || "I couldn't find an answer in the data.", toolsUsed });
      }

      messages.push({ role: "assistant", content: response.content });
      messages.push({
        role: "user",
        content: toolUses.map((t) => ({
          type: "tool_result" as const,
          tool_use_id: t.id,
          content: JSON.stringify(runTool(t.name, t.input, { params })),
        })),
      });
      toolsUsed.push(...toolUses.map((t) => t.name));
    }
    return NextResponse.json({ answer: "That question needed more lookups than I allow. Try a narrower one.", toolsUsed });
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) return NextResponse.json({ error: "busy" }, { status: 429 });
    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return NextResponse.json({ error: "not_configured" }, { status: 503 });
    }
    if (error instanceof Anthropic.APIError) return NextResponse.json({ error: "upstream", status: error.status }, { status: 502 });
    throw error;
  }
}
