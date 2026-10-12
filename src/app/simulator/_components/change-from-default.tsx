"use client";

// "Change from the polling average": the current settings against the model defaults (the
// polling-average national vote with the default model settings). Expected seats and chances
// for both chambers, then every seat whose favored side differs between the two.
import Link from "next/link";
import { useMemo } from "react";

import { ProbBar } from "@/components/charts/sparkline";
import { useScenario } from "@/components/scenario/scenario";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Empty, SectionTitle } from "@/components/ui/primitives";
import { HOUSE_SEATS } from "@/lib/data/states";
import { fmtMargin, fmtProb, signed } from "@/lib/format";
import {
  DEFAULT_PARAMS,
  houseOutlook,
  senateOutlook,
  type ChamberOutlook,
  type ModelParams,
  type RaceProjection,
  type SenateOutlook,
} from "@/lib/model/engine";
import { useModelParams } from "@/lib/model/use-outlook";
import { raceHref } from "@/lib/routes";
import type { Composition, SimRace } from "./types";

interface FlipRow {
  race: SimRace;
  before: RaceProjection;
  after: RaceProjection;
}

const sideName = (p: RaceProjection) => (p.favored === "D" ? "Democrat" : p.favored === "I" ? "Independent" : "Republican");
const sideColor = (p: RaceProjection) => (p.favored === "D" ? "var(--dem)" : p.favored === "I" ? "var(--ind)" : "var(--rep)");

export function ChangeFromDefault({
  house,
  senate,
  composition,
  houseNow,
  senateNow,
  hasPollingAverage,
}: {
  house: SimRace[];
  senate: SimRace[];
  composition: Composition;
  houseNow: ChamberOutlook;
  senateNow: SenateOutlook;
  hasPollingAverage: boolean;
}) {
  const { baselineEnv, href, reset } = useScenario();
  const params = useModelParams();

  const defaults = useMemo<ModelParams>(() => ({ ...DEFAULT_PARAMS, env: baselineEnv, baselineEnv }), [baselineEnv]);
  const houseBase = useMemo(() => houseOutlook(house, defaults), [house, defaults]);
  const senateBase = useMemo(() => senateOutlook(senate, defaults, composition), [senate, defaults, composition]);

  const atDefaults =
    params.env === defaults.env &&
    params.expertWeight === defaults.expertWeight &&
    params.incumbency === defaults.incumbency &&
    params.sigmaNational === defaults.sigmaNational &&
    params.sigmaRace === defaults.sigmaRace;

  const flips = useMemo<FlipRow[]>(() => {
    const out: FlipRow[] = [];
    const add = (races: SimRace[], before: RaceProjection[], after: RaceProjection[]) => {
      const beforeById = new Map(before.map((p) => [p.id, p]));
      const raceById = new Map(races.map((r) => [r.id, r]));
      for (const a of after) {
        const b = beforeById.get(a.id);
        const race = raceById.get(a.id);
        if (b && race && b.favored !== a.favored) out.push({ race, before: b, after: a });
      }
    };
    add(senate, senateBase.projections, senateNow.projections);
    add(house, houseBase.projections, houseNow.projections);
    return out;
  }, [house, senate, houseBase, senateBase, houseNow, senateNow]);

  const toD = flips.filter((f) => f.after.favored !== "R").length;
  const toR = flips.length - toD;
  const houseIds = flips.filter((f) => f.race.chamber === "house").map((f) => f.race.id);

  const columns = useMemo<Column<FlipRow>[]>(
    () => [
      {
        key: "seat",
        header: "Seat",
        value: (r) => r.race.id,
        cell: (r) => (
          <span>
            {r.race.id} <span className="font-normal text-ink-2">{r.race.stateName}</span>
          </span>
        ),
      },
      { key: "chamber", header: "Chamber", value: (r) => (r.race.chamber === "house" ? "House" : "Senate") },
      {
        key: "before",
        header: "At polling average",
        value: (r) => sideName(r.before),
        cell: (r) => <Side p={r.before} />,
      },
      {
        key: "after",
        header: "In this scenario",
        value: (r) => sideName(r.after),
        cell: (r) => <Side p={r.after} />,
      },
      {
        key: "chance",
        header: "Chance D now",
        value: (r) => Number(r.after.pWin.toFixed(4)),
        cell: (r) => (
          <span className="inline-flex items-center gap-2">
            <ProbBar p={r.after.pWin} width={56} height={12} />
            <span className="w-9 text-right">{fmtProb(r.after.pWin)}</span>
          </span>
        ),
        hideOnMobile: true,
      },
      {
        key: "shift",
        header: "Change in chance",
        align: "right",
        value: (r) => Number(((r.after.pWin - r.before.pWin) * 100).toFixed(1)),
        cell: (r) => `${signed((r.after.pWin - r.before.pWin) * 100, 0)} pts`,
      },
    ],
    [],
  );

  const houseSeatsDelta = houseNow.expectedDem - houseBase.expectedDem;
  const senateSeatsDelta = senateNow.expectedDem - senateBase.expectedDem;

  return (
    <section aria-labelledby="change-title" className="mt-8">
      <SectionTitle
        title={<span id="change-title">Change from the polling average</span>}
        description={`Your settings compared with the model defaults: a national vote of ${fmtMargin(baselineEnv)}${
          hasPollingAverage ? " (the polling average)" : " (no polling average loaded, so even)"
        }, ${Math.round(DEFAULT_PARAMS.expertWeight * 100)}% weight on ratings, ${DEFAULT_PARAMS.incumbency} points of incumbency, ±${DEFAULT_PARAMS.sigmaNational} national and ±${DEFAULT_PARAMS.sigmaRace} race error.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Delta
          label="House: expected Democratic seats"
          now={Math.round(houseNow.expectedDem)}
          base={Math.round(houseBase.expectedDem)}
          delta={signed(houseSeatsDelta, 0)}
          detail={`Republicans ${HOUSE_SEATS - Math.round(houseNow.expectedDem)} now`}
        />
        <Delta
          label="House: Democratic majority"
          now={fmtProb(houseNow.pDemMajority)}
          base={fmtProb(houseBase.pDemMajority)}
          delta={`${signed((houseNow.pDemMajority - houseBase.pDemMajority) * 100, 0)} pts`}
        />
        <Delta
          label="Senate: expected Democratic-caucus seats"
          now={Math.round(senateNow.expectedDem)}
          base={Math.round(senateBase.expectedDem)}
          delta={signed(senateSeatsDelta, 1)}
          detail={`Republicans ${Math.round(senateNow.expectedRep)} now`}
        />
        <Delta
          label="Senate: Democratic control"
          now={fmtProb(senateNow.pDemControl)}
          base={fmtProb(senateBase.pDemControl)}
          delta={`${signed((senateNow.pDemControl - senateBase.pDemControl) * 100, 0)} pts`}
        />
      </div>

      <div className="mt-4">
        {atDefaults ? (
          <Empty title="You are at the defaults">
            Move the national vote or any model setting above to see which seats change hands against the polling average.
          </Empty>
        ) : (
          <DataTable
            rows={flips}
            columns={columns}
            rowKey={(r) => r.race.id}
            rowHref={(r) => href(raceHref(r.race.id))}
            initialSort={{ key: "shift", dir: "desc" }}
            csvName="simulator-seats-that-change"
            maxHeight={480}
            emptyMessage="No seat changes its favored side between the two settings."
            caption={
              <>
                <span className="font-semibold text-ink tabular-nums">{flips.length}</span> seats change their favored side
                {flips.length > 0 && (
                  <>
                    {": "}
                    <span className="tabular-nums">{toD}</span> toward Democrats or independents,{" "}
                    <span className="tabular-nums">{toR}</span> toward Republicans
                  </>
                )}
              </>
            }
            toolbar={
              <>
                {houseIds.length > 0 && (
                  <Link
                    href={href(`/house?ids=${houseIds.join(",")}`)}
                    className="rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                  >
                    House seats in explorer
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => reset({ surface: "simulator" })}
                  className="rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                >
                  Back to defaults
                </button>
              </>
            }
          />
        )}
      </div>
    </section>
  );
}

function Side({ p }: { p: RaceProjection }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="size-2.5 rounded-full" style={{ background: sideColor(p) }} />
      {sideName(p)} <span className="text-ink-2">{fmtProb(Math.max(p.pWin, 1 - p.pWin))}</span>
    </span>
  );
}

function Delta({
  label,
  now,
  base,
  delta,
  detail,
}: {
  label: string;
  now: string | number;
  base: string | number;
  delta: string;
  detail?: string;
}) {
  const unchanged = /^[+-]?0(\.0)?( pts)?$/.test(delta.replace("+", ""));
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="text-xs font-medium text-ink-2">{label}</div>
      <div className="mt-1 flex flex-wrap items-baseline gap-x-2">
        <span className="text-2xl font-semibold tracking-tight text-ink tabular-nums sm:text-[28px]">{now}</span>
        <span className="text-sm font-semibold text-ink-2 tabular-nums">{unchanged ? "no change" : delta}</span>
      </div>
      <div className="mt-0.5 text-xs leading-5 text-ink-2 tabular-nums">
        Polling average: {base}
        {detail ? ` · ${detail}` : ""}
      </div>
    </div>
  );
}
