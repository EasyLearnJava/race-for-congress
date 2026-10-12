// The race's AI summary: written in advance from this race's data only, checked (numbers,
// wording, a neutrality grade and a party-swap test) and, for close races, read by a person.
import Link from "next/link";

import type { RaceSummary } from "@/lib/data/types";
import { fmtDate } from "@/lib/format";

export function AiSummary({ summary }: { summary: RaceSummary }) {
  return (
    <section aria-labelledby="ai-summary-title" className="mt-6 tile p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ai-summary-title" className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">
          AI summary from FEC and election data
        </h2>
        <Link href="/methodology#ai-summaries" className="text-xs text-ink-2 underline underline-offset-2">
          How these are made
        </Link>
      </div>
      <p className="mt-2 max-w-3xl font-serif text-lg leading-7 text-ink">{summary.summary}</p>
      <p className="mt-3 max-w-3xl text-sm leading-6 text-ink-2">
        <span className="font-semibold text-ink">What decides it: </span>
        {summary.whatDecides}
      </p>
      <p className="mt-3 text-xs leading-5 text-muted">
        Written by Claude on {fmtDate(summary.generatedAt)} from this page&apos;s data as of {fmtDate(summary.dataAsOf)}, then checked for accuracy and
        neutral wording. Not a forecast.
        {summary.stale && " Some figures on this page have been updated since; the numbers above take precedence."}
      </p>
    </section>
  );
}
