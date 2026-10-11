import Link from "next/link";

import { meta } from "@/lib/data";
import { fmtDate } from "@/lib/format";

const REPO_URL = "https://github.com/EasyLearnJava/race-for-congress";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-line bg-surface">
      <div className="mx-auto grid grid-cols-1 w-full max-w-7xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-3">
        <div>
          <div className="font-serif text-xl font-bold">218</div>
          <p className="mt-2 text-ink-2">
            Independent and nonpartisan. A simulation, not a forecast of who will win. Not affiliated with any party,
            campaign or candidate.
          </p>
          <p className="mt-3 text-ink-2">
            Register or find your polling place at{" "}
            <a href="https://vote.gov" className="font-medium text-ink underline underline-offset-2">
              vote.gov
            </a>
            .
          </p>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">Data & credits</div>
          <ul className="mt-2 space-y-1.5 text-ink-2">
            <li>
              Presidential results by district:{" "}
              <a href="https://the-db.co/presbycd" className="underline underline-offset-2">
                The Downballot
              </a>
            </li>
            <li>
              District map: Congressional District Hexmap by Daniel Donner for{" "}
              <a href="https://the-db.co/maps" className="underline underline-offset-2">
                The Downballot
              </a>{" "}
              (CC BY 4.0)
            </li>
            <li>Candidates and published ratings: Wikipedia (CC BY-SA 4.0), compiled from the named forecasters</li>
            <li>Campaign finance: Federal Election Commission</li>
          </ul>
        </div>
        <div>
          <div className="text-xs font-semibold tracking-[0.14em] text-muted uppercase">Project</div>
          <ul className="mt-2 space-y-1.5 text-ink-2">
            <li>
              <Link href="/methodology" className="underline underline-offset-2">
                How the model works
              </Link>
            </li>
            <li>
              <Link href="/data" className="underline underline-offset-2">
                Download the data
              </Link>
            </li>
            <li>
              <a href={REPO_URL} className="underline underline-offset-2">
                Source code on GitHub
              </a>
            </li>
            <li className="text-muted">Data updated {fmtDate(meta.generated)}</li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
