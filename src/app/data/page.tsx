import type { Metadata } from "next";
import Link from "next/link";

import { Badge, Card, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { genericBallot, house, meta, money, oldLines, outside, ratings, senate, spenders, history } from "@/lib/data";
import { fmtDate, fmtNum } from "@/lib/format";

export const metadata: Metadata = {
  title: "Data & API",
  description: "Download every dataset behind the site as CSV or JSON: House and Senate races, forecaster ratings, money and more.",
};

const REPO_URL = "https://github.com/EasyLearnJava/race-for-congress";

export default function DataPage() {
  const datasets = [
    {
      name: "House races",
      file: "races_house_2026.csv",
      json: "house.json",
      rows: house.length,
      about: "All 435 seats on the 2026 lines: 2020 and 2024 presidential results, lean, notional holder, incumbent and status, candidates, special cases and the consensus of published ratings.",
      source: "The Downballot; Wikipedia",
    },
    {
      name: "Senate races",
      file: "races_senate_2026.csv",
      json: "senate.json",
      rows: senate.length,
      about: "All 35 races (33 regular, plus specials in Florida and Ohio) with statewide presidential results, incumbents, candidates and ratings.",
      source: "The Downballot; Wikipedia",
    },
    {
      name: "Forecaster ratings",
      file: "ratings_2026.csv",
      rows: ratings.length,
      about: "Every published rating from 10 forecasters, with the date each was published. Long format: one row per race and forecaster.",
      source: "Compiled on Wikipedia from each forecaster",
    },
    {
      name: "Candidate money",
      file: "money_2026.csv",
      rows: money.length,
      about: "Receipts, spending and cash on hand for general-election nominees, with the reporting period each covers.",
      source: "Federal Election Commission",
    },
    {
      name: "Outside spending by race",
      file: "outside_spending_2026.csv",
      rows: outside.length,
      about: "Independent expenditures for and against each party's nominee, by race.",
      source: "Federal Election Commission",
    },
    {
      name: "Outside spenders",
      file: "outside_spenders_2026.csv",
      rows: spenders.length,
      about: "Independent expenditures by committee, race and target.",
      source: "Federal Election Commission",
    },
    {
      name: "Generic-ballot averages",
      file: "generic_ballot_2026.csv",
      rows: genericBallot.length,
      about: "The polling averages behind the default national environment.",
      source: "Wikipedia",
    },
    {
      name: "2024 lines (redrawn states)",
      file: "house_2024_lines.csv",
      rows: oldLines.length,
      about: "2024 presidential results on the districts used in 2024, for the nine states with new maps. Used to measure the redistricting effect.",
      source: "The Downballot",
    },
    {
      name: "House results history",
      file: "house_history.csv",
      rows: history.length,
      about: "House results by district since 2002, on the lines in force each year.",
      source: "MIT Election Data + Science Lab",
    },
  ];

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Data & API" }]}
        eyebrow="Open data"
        title="Data & API"
        description={`Everything on this site comes from these files. They are rebuilt from public sources by an open pipeline and were last updated ${fmtDate(meta.generated)}.`}
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {datasets.map((d) => (
          <Card key={d.file}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold">{d.name}</h2>
                <p className="mt-1 text-sm leading-6 text-ink-2">{d.about}</p>
              </div>
              <Badge>{fmtNum(d.rows)} rows</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              {d.rows > 0 ? (
                <>
                  <a href={`/data/${d.file}`} download className="font-medium underline underline-offset-2">
                    {d.file}
                  </a>
                  {d.json && (
                    <a href={`/data/${d.json}`} className="font-medium underline underline-offset-2">
                      {d.json}
                    </a>
                  )}
                </>
              ) : (
                <span className="text-ink-2">Not available in this build</span>
              )}
              <span className="text-xs text-muted">Source: {d.source}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <SectionTitle title="Use it as an API" description="The JSON files are static and cached at the edge, so they are fast and free to call." />
          <pre className="overflow-x-auto rounded-lg bg-surface-2 p-4 text-xs leading-5">
            <code>{`# Every House race as JSON
curl https://race-for-congress.vercel.app/data/house.json

# The tossups, with jq
curl -s https://race-for-congress.vercel.app/data/house.json \\
  | jq '[.[] | select(.rating == "Tossup") | {id, incumbent, dem, rep, lean}]'`}</code>
          </pre>
          <p className="mt-3 text-sm text-ink-2">
            Field meanings, units and conventions are documented in the{" "}
            <a href={`${REPO_URL}/blob/main/data/README.md`} className="font-medium text-ink underline underline-offset-2">
              data dictionary
            </a>
            . Margins are always Democratic minus Republican, in percentage points.
          </p>
        </Card>
        <Card>
          <SectionTitle title="For newsrooms and teams" />
          <ul className="space-y-2 text-sm text-ink-2">
            <li>Every chart has a Table view and a CSV download.</li>
            <li>Every view is a link: scenario, filters and drill-downs are in the URL.</li>
            <li>Data refreshes from public sources with one command.</li>
          </ul>
          <a
            href={`${REPO_URL}/issues`}
            className="mt-4 inline-flex rounded-md bg-ink px-3 py-2 text-sm font-medium text-surface hover:opacity-90"
          >
            Ask about custom feeds
          </a>
        </Card>
      </div>

      <Card className="mt-8">
        <SectionTitle title="Sources and licenses" description="Credit is required for some sources wherever their data appears." />
        <ul className="divide-y divide-line text-sm">
          {Object.entries(meta.sources ?? {}).map(([key, s]) => (
            <li key={key} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
              <a href={s.url} className="font-medium underline underline-offset-2">
                {s.name}
              </a>
              <span className="text-xs text-ink-2">
                {s.license ? `${s.license} · ` : ""}retrieved {fmtDate(s.retrieved)}
                {s.revision ? ` · revision ${s.revision}` : ""}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-2">
          Read <Link href="/methodology" className="font-medium text-ink underline underline-offset-2">how the model works</Link>.
        </p>
      </Card>
    </div>
  );
}
