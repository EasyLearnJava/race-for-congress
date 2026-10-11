"use client";

import type { ReactNode } from "react";

import { BarChart, barChartHeight, type BarRow } from "@/components/charts/bar-chart";
import { ChartFrame, LegendItem } from "@/components/charts/chart-frame";
import { TipRow, TipTitle } from "@/components/charts/tooltip";
import { useScenario } from "@/components/scenario/scenario";
import { fmtMargin } from "@/lib/format";
import { RATING_COLOR } from "@/lib/ratings";
import { stateHref } from "@/lib/routes";
import { netPhrase, type Basis, type StateTally } from "../_lib/derive";

const D_FILL = RATING_COLOR["Safe D"];
const R_FILL = RATING_COLOR["Safe R"];
const ROW = 36;
/** Below this width the label column shows postal codes instead of state names. */
const NARROW = 520;

export type Compare = "old" | "held";

export function StateBars({
  tallies,
  compare,
  basis,
  selected,
  source,
  actions,
}: {
  tallies: StateTally[];
  /** "old": 2024 lines vs 2026 lines (needs the old-lines data); "held": notional holders vs 2026 lines. */
  compare: Compare;
  basis: Basis;
  /** A state picked elsewhere on the page, emphasized here. */
  selected: string | null;
  source: string;
  /** Controls in the frame's header (e.g. the comparison toggle). */
  actions?: ReactNode;
}) {
  const { href } = useScenario();
  const leanWord = basis === "pres" ? "carried by" : "leaning";
  const before = compare === "old" ? "2024 lines" : "Held now";

  const rowsFor = (narrow: boolean): BarRow[] =>
    tallies.flatMap((t) => {
      const label = narrow ? t.postal : t.name;
      const link = href(stateHref(t.postal));
      const beforeD = compare === "old" ? (t.oldD ?? 0) : t.heldD;
      const beforeR = compare === "old" ? (t.oldR ?? 0) : t.heldR;
      const net = t.newD - beforeD;
      return [
        {
          key: `${t.postal}-before`,
          label,
          sublabel: before,
          href: link,
          segments: [
            { key: "D", label: compare === "old" ? `Seats ${leanWord} D, 2024 lines` : "Held by Democrats", value: beforeD, color: D_FILL },
            { key: "R", label: compare === "old" ? `Seats ${leanWord} R, 2024 lines` : "Held by Republicans", value: beforeR, color: R_FILL },
          ],
        },
        {
          key: `${t.postal}-new`,
          label,
          sublabel: `2026 lines · ${netPhrase(net)}`,
          href: link,
          segments: [
            { key: "D", label: `Seats ${leanWord} D, 2026 lines`, value: t.newD, color: D_FILL },
            { key: "R", label: `Seats ${leanWord} R, 2026 lines`, value: t.newR, color: R_FILL },
          ],
        },
      ];
    });

  const rowCount = tallies.length * 2;
  const height = barChartHeight(rowCount, ROW);

  const table = {
    columns: [
      { key: "state", label: "State" },
      { key: "seats", label: "Seats", align: "right" as const },
      { key: "statewide", label: "2024 statewide", align: "right" as const, format: (v: unknown) => fmtMargin(v as number | null) },
      ...(compare === "old"
        ? [
            { key: "oldD", label: "2024 lines: D", align: "right" as const },
            { key: "oldR", label: "2024 lines: R", align: "right" as const },
          ]
        : []),
      { key: "heldD", label: "Held by D", align: "right" as const },
      { key: "heldR", label: "Held by R", align: "right" as const },
      { key: "newD", label: "2026 lines: D", align: "right" as const },
      { key: "newR", label: "2026 lines: R", align: "right" as const },
      { key: "net", label: compare === "old" ? "Net change for D (lines)" : "Net change for D (vs held)", align: "right" as const },
    ],
    rows: tallies.map((t) => ({
      state: t.name,
      seats: t.seats,
      statewide: t.statewide == null ? null : Math.round(t.statewide * 100) / 100,
      oldD: t.oldD,
      oldR: t.oldR,
      heldD: t.heldD,
      heldR: t.heldR,
      newD: t.newD,
      newR: t.newR,
      net: t.newD - (compare === "old" ? (t.oldD ?? 0) : t.heldD),
    })),
  };

  return (
    <ChartFrame
      title={compare === "old" ? "Each state's delegation, old lines vs new" : "Each state's delegation: who holds it vs where the new lines lean"}
      subtitle={
        <>
          Seats {basis === "pres" ? "each party's presidential candidate carried in 2024" : "that lean to each side at a tied national vote"},{" "}
          {compare === "old" ? "on the 2024 lines and on the 2026 lines (the same voters)" : "next to the notional holders today"}. Click a state to open it.
        </>
      }
      legend={
        <>
          <LegendItem color={D_FILL} label={compare === "old" ? `Lean D` : "Democratic (held or lean)"} />
          <LegendItem color={R_FILL} label={compare === "old" ? `Lean R` : "Republican (held or lean)"} />
        </>
      }
      source={source}
      table={table}
      csvName={compare === "old" ? "redistricting-old-vs-new-lines" : "redistricting-held-vs-new-lines"}
      height={height}
      actions={actions}
    >
      {(width) => {
        const rows = rowsFor(width < NARROW);
        return (
          <BarChart
            rows={rows}
            width={width}
            rowHeight={ROW}
            highlightKey={selected ? `${selected}-new` : null}
            valueLabel="Seats"
            clickHint="Click to open the state"
            ariaLabel={`Seats leaning to each party in the nine redrawn states, ${before.toLowerCase()} and on the 2026 lines`}
            tooltip={(row) => {
              const [d, r] = row.segments ?? [];
              return (
                <>
                  <TipTitle>
                    {row.label} · {row.sublabel}
                  </TipTitle>
                  {d && <TipRow color={D_FILL} label={d.label} value={d.value ?? "—"} />}
                  {r && <TipRow color={R_FILL} label={r.label} value={r.value ?? "—"} />}
                </>
              );
            }}
          />
        );
      }}
    </ChartFrame>
  );
}
