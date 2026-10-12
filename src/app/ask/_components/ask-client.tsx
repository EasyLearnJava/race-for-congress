"use client";

import Link from "next/link";
import { Fragment, useState, type ReactNode } from "react";

import { useScenario } from "@/components/scenario/scenario";
import { track } from "@/lib/analytics";
import { fmtMargin } from "@/lib/format";
import { raceHref } from "@/lib/routes";

interface Turn {
  role: "user" | "assistant";
  content: string;
  tools?: string[];
}

const SUGGESTIONS = [
  "Which House seats are most likely to flip, and to which party?",
  "What is the tipping-point seat, and what national vote do Democrats need?",
  "Compare the Senate races in Maine, North Carolina and Ohio.",
  "Where do the forecasters disagree the most?",
  "Which open seats in states with new maps are competitive?",
  "How do the chances change if Republicans win the national vote by 3?",
];

const ERRORS: Record<string, string> = {
  not_configured:
    "The AI analyst isn't switched on for this deployment yet. The site owner can enable it by adding an ANTHROPIC_API_KEY environment variable in Vercel.",
  rate_limited: "You've asked a lot of questions in a short time. Please wait a few minutes and try again.",
  busy: "The analyst is busy right now. Please try again in a moment.",
  bad_question: "Please ask a question of up to 600 characters.",
};

/** Plain-markdown rendering (bold, bullets, paragraphs) with race ids turned into links. */
function Rich({ text }: { text: string }) {
  const inline = (line: string, key: string): ReactNode[] =>
    line.split(/(\*\*[^*]+\*\*|\b[A-Z]{2}-(?:\d{2}|AL|SEN)\b|https:\/\/vote\.gov)/g).map((part, i) => {
      if (!part) return null;
      if (part.startsWith("**") && part.endsWith("**")) return <strong key={`${key}-${i}`}>{part.slice(2, -2)}</strong>;
      if (/^[A-Z]{2}-(?:\d{2}|AL|SEN)$/.test(part))
        return (
          <Link key={`${key}-${i}`} href={raceHref(part)} className="font-medium underline underline-offset-2">
            {part}
          </Link>
        );
      if (part === "https://vote.gov")
        return (
          <a key={`${key}-${i}`} href={part} className="underline underline-offset-2">
            vote.gov
          </a>
        );
      return <Fragment key={`${key}-${i}`}>{part}</Fragment>;
    });

  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = (k: number) => {
    if (bullets.length) {
      blocks.push(
        <ul key={`ul-${k}`} className="my-2 list-disc space-y-1 pl-5">
          {bullets.map((b, i) => (
            <li key={i}>{inline(b, `b${k}-${i}`)}</li>
          ))}
        </ul>,
      );
      bullets = [];
    }
  };
  text.split("\n").forEach((raw, k) => {
    const line = raw.trim();
    if (/^[-*•]\s+/.test(line)) bullets.push(line.replace(/^[-*•]\s+/, ""));
    else {
      flush(k);
      if (line) blocks.push(<p key={`p-${k}`} className="my-2">{inline(line.replace(/^#+\s*/, ""), `p${k}`)}</p>);
    }
  });
  flush(-1);
  return <>{blocks}</>;
}

export function AskClient() {
  const { params } = useScenario();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string, source: "suggestion" | "typed") => {
    const text = q.trim();
    if (!text || pending) return;
    // Counts only: the question text is never sent to analytics.
    track("ai_question", { source });
    setPending(true);
    setError(null);
    setQuestion("");
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: text }]);
    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text, history, scenario: params }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; toolsUsed?: string[]; error?: string };
      if (!res.ok || !data.answer) {
        setError(ERRORS[data.error ?? ""] ?? "Something went wrong. Please try again.");
        setTurns((t) => t.slice(0, -1));
        setQuestion(text);
      } else {
        setTurns((t) => [...t, { role: "assistant", content: data.answer!, tools: data.toolsUsed }]);
      }
    } catch {
      setError("Couldn't reach the analyst. Check your connection and try again.");
      setTurns((t) => t.slice(0, -1));
      setQuestion(text);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-h-[420px] flex-col tile">
        <div className="flex-1 space-y-4 p-4 sm:p-5" aria-live="polite">
          {turns.length === 0 && (
            <div className="py-6 text-sm text-ink-2">
              <p>
                Answers use your current scenario: national vote <strong className="text-ink">{fmtMargin(params.env)}</strong>. Change it
                with the slider on any dashboard.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s, "suggestion")}
                    className="rounded-lg border border-line px-3 py-2 text-left text-sm text-ink hover:bg-surface-2"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-xl bg-surface-2 px-4 py-2.5 text-sm text-ink">
                {t.content}
              </div>
            ) : (
              <div key={i} className="max-w-[95%] text-sm leading-6 text-ink">
                <Rich text={t.content} />
                {t.tools && t.tools.length > 0 && (
                  <div className="mt-1 text-[11px] text-muted">Looked up: {[...new Set(t.tools)].join(", ").replaceAll("_", " ")}</div>
                )}
              </div>
            ),
          )}
          {pending && <div className="text-sm text-ink-2">Looking it up…</div>}
          {error && (
            <div role="alert" className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm text-ink">
              {error}
            </div>
          )}
        </div>
        <form
          className="flex gap-2 border-t border-line p-3"
          onSubmit={(e) => {
            e.preventDefault();
            ask(question, "typed");
          }}
        >
          <label htmlFor="ask-input" className="sr-only">
            Your question
          </label>
          <input
            id="ask-input"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={600}
            placeholder="Ask about a race, a state, the forecasters or either chamber"
            className="min-w-0 flex-1 rounded-lg border border-line bg-page px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <button
            type="submit"
            disabled={pending || !question.trim()}
            className="btn btn-primary btn-sm"
          >
            Ask
          </button>
        </form>
      </div>
      <aside className="space-y-3 text-sm text-ink-2">
        <div className="tile p-4">
          <div className="font-semibold text-ink">How it works</div>
          <p className="mt-1">
            Claude reads your question, then calls four tools that query this site&apos;s data: search races, open one race, run the
            chamber outlook, and compare forecasters. It writes the answer only from what those tools return.
          </p>
        </div>
        <div className="tile p-4">
          <div className="font-semibold text-ink">Ground rules</div>
          <p className="mt-1">
            Nonpartisan, no endorsements. For registering and voting, see{" "}
            <a href="https://vote.gov" className="underline underline-offset-2">
              vote.gov
            </a>
            . AI can make mistakes; race pages have the full data.
          </p>
        </div>
      </aside>
    </div>
  );
}
