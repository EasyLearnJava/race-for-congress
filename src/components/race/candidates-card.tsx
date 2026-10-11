"use client";

import { Badge, Card, SectionTitle } from "@/components/ui/primitives";
import { partyColor } from "@/lib/ratings";
import { candidatesOf, specialNote, type AnyRace } from "./race-utils";

export function CandidatesCard({ race, className = "" }: { race: AnyRace; className?: string }) {
  const candidates = candidatesOf(race);
  const hasDem = candidates.some((c) => c.party === "D");
  const hasRep = candidates.some((c) => c.party === "R");
  const note = specialNote(race);

  return (
    <Card className={className}>
      <SectionTitle
        title="Candidates"
        description={race.rankedChoice ? "On the November ballot. Ranked-choice voting decides the winner." : "On the November ballot."}
      />
      {candidates.length === 0 ? (
        <p className="text-sm text-ink-2">The nominees are not listed yet.</p>
      ) : (
        <ul className="divide-y divide-line">
          {candidates.map((c) => (
            <li key={`${c.party}-${c.name}`} className="flex items-center justify-between gap-3 py-2">
              <span className="flex min-w-0 items-center gap-2.5">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: partyColor(c.party) }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-ink">{c.name}</span>
                  <span className="block text-xs text-ink-2">{c.partyLabel}</span>
                </span>
              </span>
              {c.incumbent && <Badge tone="info">Incumbent</Badge>}
            </li>
          ))}
        </ul>
      )}
      {(!hasDem || !hasRep) && candidates.length > 0 && (
        <p className="mt-3 text-xs leading-5 text-ink-2">
          {!hasDem && !hasRep
            ? "Neither major party has a nominee listed."
            : !hasDem
              ? "No Democratic nominee is listed."
              : "No Republican nominee is listed."}
        </p>
      )}
      {note && <p className="mt-2 text-xs leading-5 text-ink-2">{note}</p>}
    </Card>
  );
}
