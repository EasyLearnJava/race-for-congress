import Link from "next/link";
import { ElectionCountdown } from "@/components/election-countdown";

const REPO_URL = "https://github.com/EasyLearnJava/race-for-congress";
const HOUSE_SEATS = 435;
const MAJORITY = 218;

// Illustration only: a symmetric, made-up split so the teaser implies no forecast.
const TEASER_SEGMENTS = [
  { seats: 160, className: "bg-dem" },
  { seats: 40, className: "bg-dem-lean" },
  { seats: 35, className: "bg-tossup" },
  { seats: 40, className: "bg-rep-lean" },
  { seats: 160, className: "bg-rep" },
];

const FEATURES = [
  {
    title: "Swing the country",
    body: "Drag one slider for the national vote and watch all 435 House seats respond, district by district.",
  },
  {
    title: "Make your call",
    body: "Pick the winners in the closest races, see who controls the House, and share your map.",
  },
  {
    title: "See what moved the race",
    body: "Nine states drew new district lines this year. See how far they moved the finish line, and where campaign money is flowing.",
  },
];

function SeatBarTeaser() {
  return (
    <figure className="mt-14">
      <div className="relative flex items-end justify-between text-xs font-semibold uppercase tracking-[0.14em]">
        <span className="flex items-center gap-2">
          <span aria-hidden className="size-2.5 rounded-full bg-dem" />
          Democrats
        </span>
        <span
          className="absolute -translate-x-1/2 font-serif text-sm tracking-normal normal-case"
          style={{ left: `${(MAJORITY / HOUSE_SEATS) * 100}%` }}
        >
          {MAJORITY}
        </span>
        <span className="flex items-center gap-2">
          Republicans
          <span aria-hidden className="size-2.5 rounded-full bg-rep" />
        </span>
      </div>
      <div className="relative mt-3">
        <div className="flex h-10 overflow-hidden rounded-md sm:h-14">
          {TEASER_SEGMENTS.map((segment) => (
            <div
              key={segment.className}
              className={segment.className}
              style={{ flexGrow: segment.seats }}
            />
          ))}
        </div>
        <div aria-hidden className="seat-texture pointer-events-none absolute inset-0" />
        <div
          aria-hidden
          className="absolute -top-1.5 -bottom-1.5 w-0.5 -translate-x-1/2 rounded-full bg-ink"
          style={{ left: `${(MAJORITY / HOUSE_SEATS) * 100}%` }}
        />
      </div>
      <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-muted">
        <span>
          <strong className="font-semibold text-ink">{MAJORITY} seats</strong> make a majority
        </span>
        <span>Illustration only. The live simulator is on its way.</span>
      </figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-8">
          <Link href="/" className="flex items-baseline gap-2.5">
            <span className="font-serif text-2xl font-bold tracking-tight">218</span>
            <span className="hidden text-xs font-semibold uppercase tracking-[0.18em] text-muted sm:inline">
              Race for Congress
            </span>
          </Link>
          <ElectionCountdown />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 sm:px-8">
        <section className="pt-14 pb-16 sm:pt-24">
          <p className="text-sm font-medium text-muted">
            2026 US midterm elections · Nonpartisan simulator
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl leading-[1.05] font-semibold tracking-tight text-balance sm:text-7xl">
            435 seats. {MAJORITY} to win.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Move the national vote and watch control of the House of Representatives
            change hands, district by district. Built on public election data, with
            every assumption out in the open.
          </p>
          <SeatBarTeaser />
        </section>

        <section aria-labelledby="coming-soon" className="border-t border-line py-12 sm:py-16">
          <h2
            id="coming-soon"
            className="text-xs font-semibold uppercase tracking-[0.18em] text-muted"
          >
            Coming before Election Day
          </h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-3">
            {FEATURES.map((feature, index) => (
              <li key={feature.title} className="rounded-2xl border border-line bg-card p-6">
                <span className="font-serif text-sm text-muted tabular-nums">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="mt-2 font-serif text-xl font-semibold">{feature.title}</h3>
                <p className="mt-2 text-sm leading-6 text-muted">{feature.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <p>Independent and nonpartisan. A simulation, not a forecast.</p>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <a href="https://vote.gov" className="underline-offset-4 hover:text-ink hover:underline">
              Register or find your polling place at vote.gov
            </a>
            <a href={REPO_URL} className="underline-offset-4 hover:text-ink hover:underline">
              Source on GitHub
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
