"use client";

// The seat bar: every seat in one row, most Democratic on the left to most Republican on the
// right, with each category's count inside its segment, the party totals at both ends and
// triangles marking the majority. Segments are flex items, so when the scenario changes they
// glide to their new widths on the site's spring instead of jumping. Each segment drills down.
import Link from "next/link";
import type { ReactNode } from "react";

import { Ticker } from "@/components/ui/ticker";
import { RATING_COLOR, RATING_TEXT } from "@/lib/ratings";
import type { RatingLabel } from "@/lib/data/types";
import { useMeasure } from "./use-measure";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

export interface SeatSegment {
  key: string;
  label: string;
  count: number;
  color: string;
  /** Text color inside the segment; defaults to the rating palette's ink for rating colors. */
  ink?: string;
  href?: string;
}

/** A party total shown large at one end of the bar. */
export interface SeatEnd {
  label: string;
  value: number;
  color: string;
  detail?: ReactNode;
}

const INK_BY_COLOR = new Map<string, string>(
  (Object.keys(RATING_COLOR) as RatingLabel[]).map((r) => [RATING_COLOR[r], RATING_TEXT[r]]),
);
const MIN_LABEL_PX = 26;

export function SeatBar({
  segments,
  majority,
  total,
  height = 40,
  leftLabel,
  rightLabel,
  ends,
  majorityLabel,
}: {
  segments: SeatSegment[];
  majority: number;
  total: number;
  height?: number;
  leftLabel?: ReactNode;
  rightLabel?: ReactNode;
  /** Large party totals at the two ends (Democrats left, Republicans right). */
  ends?: { left: SeatEnd; right: SeatEnd };
  majorityLabel?: string;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();
  const summary = segments.filter((s) => s.count > 0).map((s) => `${s.label}: ${s.count}`).join(", ");
  const visible = segments.filter((s) => s.count > 0);
  const lastKey = visible[visible.length - 1]?.key;
  const majorityPct = (majority / total) * 100;

  return (
    <div>
      {ends ? (
        <div className="mb-2 flex items-end justify-between gap-4">
          <End end={ends.left} align="left" />
          <End end={ends.right} align="right" />
        </div>
      ) : (
        (leftLabel || rightLabel) && (
          <div className="mb-1 flex items-end justify-between gap-4 text-sm">
            <div>{leftLabel}</div>
            <div className="text-right">{rightLabel}</div>
          </div>
        )
      )}

      <div ref={ref} data-seatbar className="relative pt-5 pb-2">
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 text-[11px] font-semibold whitespace-nowrap text-ink" style={{ left: `${majorityPct}%` }}>
          {majorityLabel ?? majority}
        </div>
        <div
          role="img"
          aria-label={`Seats by category. ${summary}. ${majority} needed for a majority.`}
          className="flex w-full overflow-hidden rounded-md"
          style={{ height }}
        >
          {segments.map((s) => {
            const px = (s.count / total) * width;
            const ink = s.ink ?? INK_BY_COLOR.get(s.color) ?? "var(--surface)";
            const style = {
              flexGrow: s.count,
              flexBasis: 0,
              background: s.color,
              color: ink,
              // A thin page-colored seam between categories (none after the last one).
              boxShadow: s.count > 0 && s.key !== lastKey ? "inset -2px 0 0 var(--surface)" : undefined,
              transition: "flex-grow var(--spring) var(--ease-spring), background-color 300ms ease",
            };
            const inner = px >= MIN_LABEL_PX && <span className="text-sm font-semibold tabular-nums">{s.count}</span>;
            const common = {
              style,
              className: "flex min-w-0 items-center justify-center overflow-hidden transition-[filter] hover:brightness-110",
              onPointerMove: (e: React.PointerEvent) => {
                const box = (e.currentTarget as HTMLElement).closest("[data-seatbar]")?.getBoundingClientRect();
                if (!box) return;
                show(e.clientX - box.left, e.clientY - box.top, (
                  <>
                    <TipTitle>{s.label}</TipTitle>
                    <TipRow color={s.color} label="Seats" value={s.count} />
                    <TipRow label="Share" value={`${((s.count / total) * 100).toFixed(0)}%`} />
                    {s.href && <div className="mt-1 text-[11px] text-muted">Click to see these races</div>}
                  </>
                ));
              },
              onPointerLeave: hide,
            };
            return s.href && s.count > 0 ? (
              <Link key={s.key} href={s.href} aria-label={`${s.label}: ${s.count} seats`} {...common}>
                {inner}
              </Link>
            ) : (
              <div key={s.key} aria-hidden {...common}>
                {inner}
              </div>
            );
          })}
        </div>
        {/* Majority marker: a triangle above and below the bar (no line, so it never hides a count). */}
        <div aria-hidden className="pointer-events-none absolute top-[14px] bottom-0 w-0" style={{ left: `${majorityPct}%` }}>
          <span className="absolute -left-[6px] top-0 border-x-[6px] border-t-[7px] border-x-transparent border-t-ink" />
          <span className="absolute -left-[6px] bottom-0 border-x-[6px] border-b-[7px] border-x-transparent border-b-ink" />
        </div>
        <TooltipLayer tip={tip} width={width} height={height + 28} />
      </div>
    </div>
  );
}

function End({ end, align }: { end: SeatEnd; align: "left" | "right" }) {
  const value = (
    <Ticker value={end.value} format={(n) => String(Math.round(n))} className="font-serif text-3xl font-semibold tracking-tight sm:text-4xl" />
  );
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`flex items-baseline gap-2 ${align === "right" ? "flex-row-reverse" : ""}`} style={{ color: end.color }}>
        <span className="text-sm font-semibold sm:text-base">{end.label}</span>
        {value}
      </div>
      {end.detail && <div className="mt-0.5 text-xs text-ink-2">{end.detail}</div>}
    </div>
  );
}
