import type { Metadata } from "next";
import Link from "next/link";

import { Card, PageHeader, SectionTitle } from "@/components/ui/primitives";
import { baselineEnvironment, meta } from "@/lib/data";
import { fmtDate, fmtMargin } from "@/lib/format";
import { DEFAULT_PARAMS, impliedMargin } from "@/lib/model/engine";

export const metadata: Metadata = {
  title: "How the model works",
  description: "The forecast model behind 218: district lean, the national vote, incumbency, published ratings and uncertainty.",
};

export default function MethodologyPage() {
  const env = meta.environment;
  const anchors = [3, 2, 1, 0, -1, -2, -3];
  const labels: Record<number, string> = { 3: "Safe D", 2: "Likely D", 1: "Lean D", 0: "Tossup", [-1]: "Lean R", [-2]: "Likely R", [-3]: "Safe R" };

  return (
    <div className="pb-10">
      <PageHeader
        breadcrumbs={[{ label: "Overview", href: "/" }, { label: "Methodology" }]}
        eyebrow="Methodology"
        title="How the model works"
        description="A transparent, simple model you can tune yourself. It is a simulation of what happens under a given national environment, not a prediction of who will win."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <SectionTitle title="1. Every race gets an expected margin" />
            <div className="space-y-3 text-sm leading-6 text-ink-2">
              <p>
                <strong className="text-ink">Fundamentals.</strong> A district&apos;s <em>lean</em> is its 2024 presidential margin
                (on the 2026 lines) minus the national margin ({fmtMargin(meta.national_2024.margin)}). Add the{" "}
                <em>national environment</em>, the Democratic-minus-Republican margin of the national vote, and{" "}
                {DEFAULT_PARAMS.incumbency} points for an incumbent running again.
              </p>
              <p>
                <strong className="text-ink">Expert view.</strong> Up to 10 forecasters publish a rating for each competitive race. We
                take the median, convert it to a margin with the table on the right, and shift it by how far the chosen national
                environment is from the polling average the ratings were made in ({fmtMargin(baselineEnvironment())}).
              </p>
              <p>
                <strong className="text-ink">Blend.</strong> The expected margin is {Math.round(DEFAULT_PARAMS.expertWeight * 100)}% expert
                view and {Math.round((1 - DEFAULT_PARAMS.expertWeight) * 100)}% fundamentals by default. Races no forecaster lists as
                competitive use fundamentals only. Races with only one party on the ballot (for example, two Democrats in a California
                top-two race) are decided by the ballot.
              </p>
            </div>
          </Card>
          <Card>
            <SectionTitle title="2. Uncertainty" />
            <div className="space-y-3 text-sm leading-6 text-ink-2">
              <p>
                Two kinds of error are layered on every expected margin: a <strong className="text-ink">national error</strong> (default ±
                {DEFAULT_PARAMS.sigmaNational} points), shared by every race because polls tend to miss in the same direction, and a{" "}
                <strong className="text-ink">race error</strong> (default ±{DEFAULT_PARAMS.sigmaRace} points) for candidates and local
                issues.
              </p>
              <p>
                Seat probabilities are computed exactly, not by random sampling: for each of 61 national-error scenarios, the number of
                seats won follows a Poisson-binomial distribution, which we compute by dynamic programming and then average. The same
                inputs always give the same answer.
              </p>
            </div>
          </Card>
          <Card>
            <SectionTitle title="3. Reading the results" />
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-ink-2">
              <li>
                <strong className="text-ink">Finish line:</strong> the national vote at which Democrats are expected to win exactly 218
                seats. Every expected margin moves one-for-one with the national vote, so it equals the current setting minus the
                margin of the tipping-point seat (the 218th most Democratic seat).
              </li>
              <li>
                <strong className="text-ink">Flip point:</strong> for one race, the national vote at which its expected margin crosses
                zero.
              </li>
              <li>
                <strong className="text-ink">Gains and losses</strong> are counted against the party that notionally holds each seat
                today. In redrawn states that is the party holding the old district the new one most resembles.
              </li>
              <li>
                <strong className="text-ink">Senate control:</strong> with a Republican vice president, Democrats need 51 seats and
                Republicans 50. Independents who caucus with Democrats count with them.
              </li>
            </ul>
          </Card>
          <Card>
            <SectionTitle title="Limitations" />
            <ul className="list-disc space-y-2 pl-5 text-sm leading-6 text-ink-2">
              <li>One national swing: real elections swing unevenly by region and by type of voter.</li>
              <li>Ratings are a snapshot; forecasters update them. Check each rating&apos;s date.</li>
              <li>Independent candidates are modeled as the non-Republican side only where no Democrat runs.</li>
              <li>Ranked-choice (Alaska, Maine) and runoff rules are not modeled separately.</li>
            </ul>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <SectionTitle title="Ratings to margins" />
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="py-1 font-medium">Median rating</th>
                  <th className="py-1 text-right font-medium">Implied margin</th>
                </tr>
              </thead>
              <tbody>
                {anchors.map((s) => (
                  <tr key={s} className="border-t border-line">
                    <td className="py-1.5">{labels[s]}</td>
                    <td className="py-1.5 text-right tabular-nums">{fmtMargin(impliedMargin(s), 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-2">In-between medians (for example, halfway between Lean and Likely) interpolate linearly.</p>
          </Card>
          <Card>
            <SectionTitle title="Defaults" />
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-ink-2">National environment</dt>
              <dd className="text-right font-medium tabular-nums">{fmtMargin(baselineEnvironment())}</dd>
              <dt className="text-ink-2">Weight on ratings</dt>
              <dd className="text-right font-medium tabular-nums">{Math.round(DEFAULT_PARAMS.expertWeight * 100)}%</dd>
              <dt className="text-ink-2">Incumbency</dt>
              <dd className="text-right font-medium tabular-nums">{DEFAULT_PARAMS.incumbency} pts</dd>
              <dt className="text-ink-2">National error</dt>
              <dd className="text-right font-medium tabular-nums">±{DEFAULT_PARAMS.sigmaNational} pts</dd>
              <dt className="text-ink-2">Race error</dt>
              <dd className="text-right font-medium tabular-nums">±{DEFAULT_PARAMS.sigmaRace} pts</dd>
            </dl>
            <p className="mt-3 text-xs text-ink-2">
              {env
                ? `The national environment default is the average of ${env.n_sources} generic-ballot polling averages as of ${fmtDate(env.as_of)}.`
                : "No polling average is loaded in this build, so the default national environment is even."}{" "}
              Change any setting in the Model panel under the national vote slider.
            </p>
          </Card>
          <Card>
            <SectionTitle title="Data" />
            <p className="text-sm text-ink-2">
              Sources, licenses and downloads are on the <Link href="/data" className="font-medium text-ink underline underline-offset-2">Data page</Link>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
