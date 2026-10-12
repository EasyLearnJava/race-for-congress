"use client";

// Make your call: one card per close seat, three buttons (Democrat, Toss-up, Republican),
// a live count against 218, then a result to share. Picks live only in the URL; nothing about
// what a person picked is stored or sent anywhere.
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";

import { SeatBar, type SeatSegment } from "@/components/charts/seat-bar";
import { useScenario } from "@/components/scenario/scenario";
import { Badge, Card, PageHeader, RatingChip, SectionTitle } from "@/components/ui/primitives";
import {
  HOUSE_SEATS,
  MAJORITY,
  baselinePick,
  callHeadline,
  decodePicks,
  encodePicks,
  picksQuery,
  tally,
  type CallRace,
  type Choice,
  type Picks,
  type Tally,
} from "@/lib/call";
import { track } from "@/lib/analytics";
import { districtName, fmtDate, fmtMargin, fmtMoney, fmtProb } from "@/lib/format";
import { useProjections } from "@/lib/model/use-outlook";
import { houseHref } from "@/lib/routes";
import { setSearchParams, useSearch } from "@/lib/url-state";
import type { CallSources, DeckRace } from "./types";

// Progress is counted at these seat counts only (plus the last seat); never which way a seat went.
const MILESTONES = [1, 10, 20, 30];

const CHOICE_LABEL: Record<Choice, string> = { D: "Democrat", T: "Toss-up", R: "Republican" };
const CHOICE_COLOR: Record<Choice, string> = { D: "var(--dem)", T: "var(--r-toss)", R: "var(--rep)" };
// Text that stays readable on each filled (picked) button, in both themes.
const CHOICE_INK: Record<Choice, string> = { D: "var(--r-likely-d-ink)", T: "var(--r-toss-ink)", R: "var(--r-likely-r-ink)" };

export function CallClient({ races, deck, sources }: { races: CallRace[]; deck: DeckRace[]; sources: CallSources }) {
  const search = useSearch();
  const validIds = useMemo(() => new Set(races.map((r) => r.id)), [races]);
  const picks = useMemo(() => decodePicks((k) => search.get(k), validIds), [search, validIds]);
  const shared = search.get("shared") === "1";
  // The URL is read after hydration, so this runs once `shared` turns true.
  const countedVisit = useRef(false);
  useEffect(() => {
    if (!shared || countedVisit.current) return;
    countedVisit.current = true;
    track("shared_visit", { surface: "call" });
  }, [shared]);
  const t = useMemo(() => tally(races, picks), [races, picks]);

  const [index, setIndex] = useState<number | null>(null);
  // Which way the deck last moved (1 forward, -1 back): the next card enters from that side.
  const [dir, setDir] = useState<1 | -1>(1);
  const [showResult, setShowResult] = useState(false);
  const firstOpen = deck.findIndex((r) => !picks.has(r.id));
  const current = index ?? (firstOpen === -1 ? deck.length : firstOpen);
  const done = current >= deck.length;
  const resultView = shared || showResult || done;

  const writePicks = useCallback((next: Picks) => setSearchParams({ ...encodePicks(next), shared: null }), []);

  const choose = useCallback(
    (choice: Choice) => {
      const race = deck[current];
      if (!race) return;
      const next = new Map(picks);
      next.set(race.id, choice);
      writePicks(next);
      const called = deck.filter((r) => next.has(r.id)).length;
      if (!picks.has(race.id) && (MILESTONES.includes(called) || called === deck.length)) {
        track("call_progress", { called, deck: deck.length, finished: called === deck.length });
      }
      // Advance to the next seat not called yet, after this one first, then from the top.
      const after = deck.findIndex((r, i) => i > current && !next.has(r.id));
      const before = deck.findIndex((r) => !next.has(r.id));
      const target = after !== -1 ? after : before !== -1 ? before : deck.length;
      setDir(target >= current ? 1 : -1);
      setIndex(target);
    },
    [current, deck, picks, writePicks],
  );

  const go = useCallback(
    (i: number) => {
      const next = Math.max(0, Math.min(deck.length - 1, i));
      if (next === current) return;
      setDir(next > current ? 1 : -1);
      setIndex(next);
    },
    [deck.length, current],
  );

  const startOver = () => {
    writePicks(new Map());
    setIndex(0);
    setShowResult(false);
  };

  return (
    <div className="pb-12">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Make your call" }]}
        eyebrow="2026 midterms · Your call"
        title="Make your call"
        description={`Forecasters rate ${deck.length} House seats as Lean or Toss-up. Call each one yourself and see who reaches 218. The other ${HOUSE_SEATS - deck.length} seats follow the forecaster consensus. Your call, not a forecast.`}
      />

      <Tracker t={t} deckSize={deck.length} />

      {resultView ? (
        <Result
          t={t}
          picks={picks}
          deck={deck}
          shared={shared}
          sources={sources}
          onEdit={() => {
            setSearchParams({ shared: null });
            setShowResult(false);
            setIndex(firstOpen === -1 ? 0 : firstOpen);
          }}
          onStartOver={startOver}
        />
      ) : (
        <Deck deck={deck} current={current} dir={dir} picks={picks} onChoose={choose} onGo={go} onFinish={() => setShowResult(true)} />
      )}

      <Sources sources={sources} />
    </div>
  );
}

/** The live count: a seat bar with the 218 line and what each party still needs. */
function Tracker({ t, deckSize }: { t: Tally; deckSize: number }) {
  const segments: SeatSegment[] = [
    { key: "D", label: "Democrats", count: t.D, color: "var(--dem)" },
    { key: "T", label: "Toss-up", count: t.T, color: "var(--r-toss)" },
    { key: "open", label: "Not called yet", count: t.open, color: "var(--grid)" },
    { key: "R", label: "Republicans", count: t.R, color: "var(--rep)" },
  ];
  const need = (n: number) => Math.max(0, MAJORITY - n);
  return (
    <Card className="mb-6">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold text-ink tabular-nums">
          <span className="text-2xl" style={{ color: "var(--dem)" }}>
            {t.D}
          </span>{" "}
          Dem
        </span>
        <span className="text-center text-xs text-ink-2 tabular-nums">
          {deckSize - t.open} of {deckSize} called
          {t.T > 0 && ` · ${t.T} toss-up${t.T === 1 ? "" : "s"}`}
        </span>
        <span className="font-semibold text-ink tabular-nums">
          Rep{" "}
          <span className="text-2xl" style={{ color: "var(--rep)" }}>
            {t.R}
          </span>
        </span>
      </div>
      <SeatBar segments={segments} majority={MAJORITY} total={HOUSE_SEATS} height={26} majorityLabel="218 for a majority" />
      <p className="mt-2 text-xs text-ink-2 tabular-nums" aria-live="polite">
        {t.winner
          ? callHeadline(t)
          : `To reach 218: Democrats need ${need(t.D)} more, Republicans need ${need(t.R)} more.`}
      </p>
    </Card>
  );
}

function Deck({
  deck,
  current,
  dir,
  picks,
  onChoose,
  onGo,
  onFinish,
}: {
  deck: DeckRace[];
  current: number;
  dir: 1 | -1;
  picks: Picks;
  onChoose: (c: Choice) => void;
  onGo: (i: number) => void;
  onFinish: () => void;
}) {
  const { params, href } = useScenario();
  const projections = useProjections(deck);
  const race = deck[current];
  const p = projections.get(race.id);
  const picked = picks.get(race.id);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const moved = useRef(false);

  // Move focus to the new card after a pick so screen readers announce it; not on first load.
  useEffect(() => {
    if (moved.current) headingRef.current?.focus({ preventScroll: true });
    moved.current = true;
  }, [race.id]);

  // Keyboard: D / T / R (or 1 / 2 / 3) call the seat; arrow keys move between cards.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement;
      if (el.closest("input, textarea, select, [contenteditable=true]")) return;
      const key = e.key.toLowerCase();
      const choice = ({ d: "D", "1": "D", t: "T", "2": "T", r: "R", "3": "R" } as const)[key as "d"];
      if (choice) {
        e.preventDefault();
        onChoose(choice);
      } else if (e.key === "ArrowLeft" && !el.closest("[role=slider], input[type=range]")) {
        onGo(current - 1);
      } else if (e.key === "ArrowRight" && !el.closest("[role=slider], input[type=range]")) {
        onGo(current + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, onChoose, onGo]);

  const called = deck.filter((r) => picks.has(r.id)).length;
  const holder = race.incumbent
    ? `${race.incumbent} (${race.incumbentParty})${race.incumbentRunning ? ", running again" : ", not running"}`
    : race.heldByMember
      ? `Open seat, held by ${race.heldByMember} (${race.heldBy})`
      : "Open seat";

  return (
    <section aria-label="Seats to call">
      <div className="mb-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-ink-2 tabular-nums">
          Seat {current + 1} of {deck.length}
        </span>
        <button type="button" onClick={onFinish} className="text-sm font-semibold text-ink underline underline-offset-2">
          {called === 0 ? "Skip to the result" : "See my result"}
        </button>
      </div>
      <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-(--spring) ease-(--ease-spring)"
          style={{ width: `${(called / deck.length) * 100}%` }}
        />
      </div>

      {/* Keyed by seat: each new card arrives from the direction the deck moved. */}
      <div key={race.id} className="card-enter" style={{ "--dir": dir } as CSSProperties}>
        <Card className="mx-auto max-w-2xl">
          <div className="flex flex-wrap items-center gap-2 text-xs font-semibold tracking-[0.12em] text-muted uppercase">
            {districtName(race.id, race.stateName)}
            {race.newLines && <Badge tone="info">New 2026 lines</Badge>}
            {!race.incumbentRunning && <Badge>Open seat</Badge>}
          </div>
          <h2 ref={headingRef} tabIndex={-1} className="mt-1 font-serif text-4xl font-semibold tracking-tight text-ink outline-none">
            {race.id}
          </h2>
          <p className="mt-1 text-sm text-ink-2">{holder}</p>
  
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <Fact label="Forecasters">
              <RatingChip rating={race.rating} />
              <span className="ml-1.5 text-xs text-ink-2">median of {race.ratingCount}</span>
            </Fact>
            <Fact label={`Model at ${fmtMargin(params.env)}`}>
              {p ? (
                <span className="tabular-nums">
                  {fmtProb(p.pWin)} D · {fmtProb(1 - p.pWin)} R
                </span>
              ) : (
                "—"
              )}
            </Fact>
            <Fact label="2024 president here">
              <span className="tabular-nums">{fmtMargin(race.pres24)}</span>
            </Fact>
            <Fact label="Raised by nominees">
              <span className="tabular-nums">
                D {fmtMoney(race.raisedD)} · R {fmtMoney(race.raisedR)}
              </span>
            </Fact>
          </dl>
  
          <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label={`Call ${race.id}`}>
            <ChoiceButton choice="D" name={race.dem} picked={picked} onChoose={onChoose} />
            <ChoiceButton choice="T" picked={picked} onChoose={onChoose} />
            <ChoiceButton choice="R" name={race.rep} picked={picked} onChoose={onChoose} />
          </div>
  
          <div className="mt-4 flex items-center justify-between gap-2 text-sm">
            <button
              type="button"
              onClick={() => onGo(current - 1)}
              disabled={current === 0}
              className="rounded-lg px-2 py-1.5 font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-40"
            >
              <span aria-hidden>←</span> Back
            </button>
            <Link href={href(houseHref(race.id))} className="text-xs font-semibold text-ink-2 underline underline-offset-2">
              Full race page
            </Link>
            <button
              type="button"
              onClick={() => onGo(current + 1)}
              disabled={current >= deck.length - 1}
              className="rounded-lg px-2 py-1.5 font-medium text-ink-2 hover:bg-surface-2 disabled:opacity-40"
            >
              Skip <span aria-hidden>→</span>
            </button>
          </div>
        </Card>
      </div>
      <p className="mx-auto mt-3 max-w-2xl text-center text-xs text-muted">
        Keyboard: D, T or R (or 1, 2, 3) to call a seat; arrow keys to move between seats.
      </p>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-surface-2 px-3 py-2">
      <dt className="text-xs text-ink-2">{label}</dt>
      <dd className="mt-0.5 flex flex-wrap items-center font-medium text-ink">{children}</dd>
    </div>
  );
}

function ChoiceButton({ choice, name, picked, onChoose }: { choice: Choice; name?: string; picked?: Choice; onChoose: (c: Choice) => void }) {
  const active = picked === choice;
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onChoose(choice)}
      className={`flex min-h-16 flex-col items-center justify-center rounded-lg border-2 px-2 py-2 text-center transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:outline-none ${
        active ? "" : "bg-surface text-ink hover:bg-surface-2"
      }`}
      style={{ borderColor: CHOICE_COLOR[choice], background: active ? CHOICE_COLOR[choice] : undefined, color: active ? CHOICE_INK[choice] : undefined }}
    >
      <span className="text-sm font-semibold">
        {choice === "D" && <span aria-hidden>← </span>}
        {CHOICE_LABEL[choice]}
        {choice === "R" && <span aria-hidden> →</span>}
      </span>
      {name && <span className={`mt-0.5 line-clamp-2 text-[11px] leading-4 ${active ? "opacity-90" : "text-ink-2"}`}>{name}</span>}
    </button>
  );
}

const subscribeNever = () => () => {};

function Result({
  t,
  picks,
  deck,
  shared,
  sources,
  onEdit,
  onStartOver,
}: {
  t: Tally;
  picks: Picks;
  deck: DeckRace[];
  shared: boolean;
  sources: CallSources;
  onEdit: () => void;
  onStartOver: () => void;
}) {
  const { params, href } = useScenario();
  const projections = useProjections(deck);
  const origin = useSyncExternalStore(subscribeNever, () => window.location.origin, () => "");
  const query = picksQuery(picks);
  const shareUrl = `${origin}/call${query ? `?${query}&shared=1` : ""}`;
  const imageUrl = `/api/og/call${query ? `?${query}` : ""}`;
  const storyUrl = `/api/og/call?${query ? `${query}&` : ""}format=story`;
  const [copied, setCopied] = useState(false);

  // The same 40 seats three ways; seats outside the deck are identical in every row.
  const rows = useMemo(() => {
    const count = (choose: (r: DeckRace) => Choice | undefined) => {
      const c = { D: 0, T: 0, R: 0, open: 0 };
      for (const r of deck) {
        const v = choose(r);
        if (v) c[v]++;
        else c.open++;
      }
      return c;
    };
    return [
      { label: shared ? "This call" : "Your call", ...count((r) => picks.get(r.id)) },
      { label: "Forecaster consensus", ...count((r) => baselinePick(r)) },
      {
        label: `Model at ${fmtMargin(params.env)}`,
        ...count((r) => {
          const p = projections.get(r.id);
          return p ? (p.pWin >= 0.5 ? "D" : "R") : undefined;
        }),
      },
    ];
  }, [deck, picks, projections, params.env, shared]);

  const share = async () => {
    try {
      if (navigator.share) {
        track("share_clicked", { surface: "call", method: "native" });
        await navigator.share({ title: "My 2026 House call", text: callHeadline(t), url: shareUrl });
        return;
      }
      await navigator.clipboard.writeText(shareUrl);
      track("share_clicked", { surface: "call", method: "copy" });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Dismissed share sheet or blocked clipboard: the link field below still works.
    }
  };

  const groups = (["D", "T", "R"] as const).map((c) => ({ c, ids: deck.filter((r) => picks.get(r.id) === c).map((r) => r.id) }));
  const notCalled = deck.filter((r) => !picks.has(r.id)).map((r) => r.id);
  const extra = [...picks.keys()].filter((id) => !deck.some((r) => r.id === id));

  return (
    <div className="space-y-6">
      {shared && (
        <div className="rounded-2xl bg-surface-2 p-4 text-sm text-ink">
          <strong>Someone shared their call with you.</strong> It is one person&apos;s call, not a forecast and not a view of 218.{" "}
          <button type="button" onClick={onStartOver} className="font-semibold underline underline-offset-2">
            Make your own call
          </button>
        </div>
      )}

      <Card>
        <div className="text-xs font-semibold tracking-[0.12em] text-muted uppercase">{shared ? "A 2026 House call" : "Your 2026 House call"}</div>
        <h2 className="mt-1 font-serif text-2xl leading-snug font-semibold text-ink sm:text-3xl">{callHeadline(t)}</h2>
        <div className="mt-4 grid grid-cols-3 gap-2 text-center tabular-nums">
          <Count label="Democrats" n={t.D} color="var(--dem)" />
          <Count label="Undecided" n={t.T + t.open} color="var(--r-toss)" />
          <Count label="Republicans" n={t.R} color="var(--rep)" />
        </div>
        <p className="mt-3 text-sm text-ink-2">
          Against the seats each party holds today, Democrats gain {t.gainsD} and Republicans gain {t.gainsR}.
          {t.open > 0 && ` ${t.open} of the ${deck.length} close seats are not called yet.`}
        </p>
        {!shared && (
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" onClick={share} className="btn btn-primary press">
              <span aria-live="polite">{copied ? "Link copied" : "Share my call"}</span>
            </button>
            <button type="button" onClick={onEdit} className="btn btn-secondary press">
              {t.open > 0 ? "Keep calling" : "Change my picks"}
            </button>
            <button type="button" onClick={onStartOver} className="btn text-ink-2 hover:text-ink">
              Start over
            </button>
          </div>
        )}
      </Card>

      {!shared && (
        <Card>
          <SectionTitle
            title="Share it"
            description="The link holds your picks, so anyone who opens it sees the same call. Nothing about your picks is stored by 218."
          />
          <label htmlFor="call-link" className="sr-only">
            Link to your call
          </label>
          <input
            id="call-link"
            readOnly
            value={shareUrl}
            onFocus={(e) => e.currentTarget.select()}
            className="w-full min-w-0 rounded-lg border border-line bg-surface-2 px-3 py-2 font-mono text-xs text-ink"
          />
          <div className="mt-3 flex flex-wrap gap-3 text-sm">
            <a
              href={imageUrl}
              download="my-2026-house-call.png"
              onClick={() => track("share_clicked", { surface: "call", method: "image" })}
              className="font-semibold text-ink underline underline-offset-2">
              Download image (1200×630)
            </a>
            <a
              href={storyUrl}
              download="my-2026-house-call-story.png"
              onClick={() => track("share_clicked", { surface: "call", method: "story" })}
              className="font-semibold text-ink underline underline-offset-2">
              Download story image (9:16)
            </a>
          </div>
        </Card>
      )}

      <Card>
        <SectionTitle
          title={`The ${deck.length} close seats, three ways`}
          description={`The other ${HOUSE_SEATS - deck.length} seats are the same in every row. The model leans every seat one way, so it has no toss-ups. Open: not called yet.`}
        />
        <div className="overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-2">
                <th scope="col" className="py-2 pr-3 font-medium"></th>
                <th scope="col" className="px-1.5 py-2 text-right font-medium">Dem</th>
                <th scope="col" className="px-1.5 py-2 text-right font-medium">Toss-up</th>
                <th scope="col" className="px-1.5 py-2 text-right font-medium">Open</th>
                <th scope="col" className="py-2 pl-1.5 text-right font-medium">Rep</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-line last:border-0">
                  <th scope="row" className="py-2 pr-3 text-left font-medium text-ink">
                    {r.label}
                  </th>
                  <td className="px-1.5 py-2 text-right">{r.D}</td>
                  <td className="px-1.5 py-2 text-right">{r.T}</td>
                  <td className="px-1.5 py-2 text-right">{r.open}</td>
                  <td className="py-2 pl-1.5 text-right">{r.R}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <SectionTitle title={shared ? "The picks" : "Your picks"} description="Each district links to its race page." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {groups.map(({ c, ids }) => (
            <div key={c}>
              <h3 className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink">
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: CHOICE_COLOR[c] }} />
                {CHOICE_LABEL[c]} ({ids.length})
              </h3>
              <IdList ids={ids} href={href} />
            </div>
          ))}
        </div>
        {notCalled.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-1.5 text-sm font-semibold text-ink">Not called yet ({notCalled.length})</h3>
            <IdList ids={notCalled} href={href} />
          </div>
        )}
        {extra.length > 0 && (
          <p className="mt-4 text-xs text-ink-2">
            Also picked, outside today&apos;s close seats: {extra.join(", ")}. Ratings have moved since this call was made.
          </p>
        )}
      </Card>

      <p className="text-sm text-ink-2">
        A personal call, not a forecast. Official voting information:{" "}
        <a href="https://vote.gov" className="font-semibold underline underline-offset-2">
          vote.gov
        </a>
        . Ratings as of {fmtDate(sources.ratingsAsOf)}.
      </p>
    </div>
  );
}

function Count({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <div className="rounded-lg bg-surface-2 px-2 py-3">
      <div className="text-3xl font-semibold sm:text-4xl" style={{ color }}>
        {n}
      </div>
      <div className="mt-0.5 text-xs text-ink-2">{label}</div>
    </div>
  );
}

function IdList({ ids, href }: { ids: string[]; href: (path: string) => string }) {
  if (!ids.length) return <p className="text-xs text-muted">None</p>;
  return (
    <ul className="flex flex-wrap gap-1.5">
      {ids.map((id) => (
        <li key={id}>
          <Link href={href(houseHref(id))} className="inline-block rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink hover:bg-surface-2">
            {id}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Sources({ sources }: { sources: CallSources }) {
  return (
    <p className="mt-8 text-xs leading-5 text-muted">
      Sources: forecaster ratings from {sources.ratingSources.join(", ")}, compiled from Wikipedia, as of {fmtDate(sources.ratingsAsOf)}; the deck is
      every seat whose median rating is Lean or Toss-up. 2024 presidential results on the 2026 lines: The Downballot. Fundraising: FEC, candidate
      reports through {fmtDate(sources.moneyAsOf)}. Model: 218&apos;s scenario model at your national vote setting. Data updated {fmtDate(sources.generated)}.
    </p>
  );
}
