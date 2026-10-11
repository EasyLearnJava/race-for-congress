"use client";

// The seat bar: every seat in one row, ordered most-Democratic to most-Republican, with the
// majority line. Each segment drills down (link) to the races behind it.
import Link from "next/link";
import { useMeasure } from "./use-measure";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

export interface SeatSegment {
  key: string;
  label: string;
  count: number;
  color: string;
  href?: string;
}

export function SeatBar({
  segments,
  majority,
  total,
  height = 34,
  leftLabel,
  rightLabel,
  majorityLabel,
}: {
  segments: SeatSegment[];
  majority: number;
  total: number;
  height?: number;
  leftLabel?: React.ReactNode;
  rightLabel?: React.ReactNode;
  majorityLabel?: string;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();
  const gap = 2;
  const visible = segments.filter((s) => s.count > 0);
  const scale = (width - gap * Math.max(0, visible.length - 1)) / total;
  const top = 18;
  const svgHeight = top + height + 6;

  const rects: (SeatSegment & { x: number; w: number })[] = [];
  for (const s of visible) {
    const prev = rects[rects.length - 1];
    const x = prev ? prev.x + prev.w + gap : 0;
    rects.push({ ...s, x, w: Math.max(0, s.count * scale) });
  }
  // Majority line: after `majority` seats counted from the left, plus the gaps passed so far.
  let seats = 0;
  let mx = 0;
  for (const r of rects) {
    if (seats + r.count >= majority) {
      mx = r.x + (majority - seats) * scale;
      break;
    }
    seats += r.count;
  }

  const summary = visible.map((s) => `${s.label}: ${s.count}`).join(", ");

  return (
    <div>
      {(leftLabel || rightLabel) && (
        <div className="mb-1 flex items-end justify-between gap-4 text-sm">
          <div>{leftLabel}</div>
          <div className="text-right">{rightLabel}</div>
        </div>
      )}
      <div ref={ref} className="relative w-full" style={{ height: svgHeight }}>
        {width > 0 && (
          <svg width={width} height={svgHeight} role="img" aria-label={`Seats by category. ${summary}. ${majority} needed for a majority.`}>
            {rects.map((r, i) => {
              const first = i === 0;
              const last = i === rects.length - 1;
              const radius = 4;
              const body = (
                <path
                  d={roundedBar(r.x, top, r.w, height, first ? radius : 0, last ? radius : 0)}
                  fill={r.color}
                  className="transition-opacity hover:opacity-85"
                  onPointerMove={(e) => {
                    const box = (e.currentTarget.ownerSVGElement as SVGSVGElement).getBoundingClientRect();
                    show(e.clientX - box.left, e.clientY - box.top, (
                      <>
                        <TipTitle>{r.label}</TipTitle>
                        <TipRow color={r.color} label="Seats" value={r.count} />
                        <TipRow label="Share" value={`${((r.count / total) * 100).toFixed(0)}%`} />
                        {r.href && <div className="mt-1 text-[11px] text-muted">Click to see these races</div>}
                      </>
                    ));
                  }}
                  onPointerLeave={hide}
                />
              );
              return r.href ? (
                <Link key={r.key} href={r.href} aria-label={`${r.label}: ${r.count} seats`}>
                  {body}
                </Link>
              ) : (
                <g key={r.key}>{body}</g>
              );
            })}
            <line x1={mx} x2={mx} y1={top - 6} y2={top + height + 6} stroke="var(--ink)" strokeWidth={2} />
            <text x={mx} y={10} textAnchor="middle" className="fill-ink text-[11px] font-semibold">
              {majorityLabel ?? majority}
            </text>
          </svg>
        )}
        <TooltipLayer tip={tip} width={width} height={svgHeight} />
      </div>
    </div>
  );
}

function roundedBar(x: number, y: number, w: number, h: number, rl: number, rr: number): string {
  const l = Math.min(rl, w / 2);
  const r = Math.min(rr, w / 2);
  return [
    `M${x + l},${y}`,
    `H${x + w - r}`,
    r ? `A${r},${r} 0 0 1 ${x + w},${y + r}` : "",
    `V${y + h - r}`,
    r ? `A${r},${r} 0 0 1 ${x + w - r},${y + h}` : "",
    `H${x + l}`,
    l ? `A${l},${l} 0 0 1 ${x},${y + h - l}` : "",
    `V${y + l}`,
    l ? `A${l},${l} 0 0 1 ${x + l},${y}` : "",
    "Z",
  ].join("");
}
