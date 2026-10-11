// Shared axis and grid pieces for SVG charts: hairline, solid, recessive. Tick labels use
// the muted text token and tabular figures; the baseline uses the axis token.
import type { ReactNode } from "react";

type Scale = ((v: number) => number) & { ticks?: (n?: number) => number[] };

export interface Margin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export function XAxis({
  scale,
  ticks,
  y,
  x0,
  x1,
  format = String,
  label,
  grid,
  gridTop,
}: {
  scale: Scale;
  ticks: number[];
  /** Pixel y of the axis line (bottom of the plot). */
  y: number;
  x0: number;
  x1: number;
  format?: (v: number) => string;
  label?: ReactNode;
  /** Draw vertical gridlines up to gridTop. */
  grid?: boolean;
  gridTop?: number;
}) {
  return (
    <g className="text-[10px]">
      {grid &&
        ticks.map((t) => (
          <line key={`g${t}`} x1={scale(t)} x2={scale(t)} y1={gridTop ?? 0} y2={y} stroke="var(--grid)" strokeWidth={1} />
        ))}
      <line x1={x0} x2={x1} y1={y} y2={y} stroke="var(--axis)" strokeWidth={1} />
      {ticks.map((t) => (
        <text key={t} x={scale(t)} y={y + 14} textAnchor="middle" fill="var(--muted)" className="tabular-nums">
          {format(t)}
        </text>
      ))}
      {label && (
        <text x={(x0 + x1) / 2} y={y + 30} textAnchor="middle" fill="var(--ink-2)" className="text-[11px]">
          {label}
        </text>
      )}
    </g>
  );
}

export function YAxis({
  scale,
  ticks,
  x,
  x1,
  format = String,
  label,
  grid = true,
}: {
  scale: Scale;
  ticks: number[];
  /** Pixel x of the axis (left edge of the plot). */
  x: number;
  /** Right edge of the plot, for gridlines. */
  x1: number;
  format?: (v: number) => string;
  label?: ReactNode;
  grid?: boolean;
}) {
  return (
    <g className="text-[10px]">
      {ticks.map((t) => (
        <g key={t}>
          {grid && <line x1={x} x2={x1} y1={scale(t)} y2={scale(t)} stroke="var(--grid)" strokeWidth={1} />}
          <text x={x - 6} y={scale(t)} dy="0.32em" textAnchor="end" fill="var(--muted)" className="tabular-nums">
            {format(t)}
          </text>
        </g>
      ))}
      {label && (
        <text transform={`translate(${x - 34},${(scale(ticks[0]) + scale(ticks[ticks.length - 1])) / 2}) rotate(-90)`} textAnchor="middle" fill="var(--ink-2)" className="text-[11px]">
          {label}
        </text>
      )}
    </g>
  );
}

/** A labelled reference line (majority line, current environment, zero). */
export function RefLine({
  x,
  y,
  x0,
  x1,
  y0,
  y1,
  label,
  strong,
}: {
  x?: number;
  y?: number;
  x0?: number;
  x1?: number;
  y0?: number;
  y1?: number;
  label?: string;
  strong?: boolean;
}) {
  const stroke = strong ? "var(--ink)" : "var(--axis)";
  if (x != null) {
    return (
      <g>
        <line x1={x} x2={x} y1={y0 ?? 0} y2={y1 ?? 0} stroke={stroke} strokeWidth={strong ? 1.5 : 1} />
        {label && (
          <text x={x} y={(y0 ?? 0) - 4} textAnchor="middle" fill="var(--ink)" className="text-[10px] font-semibold">
            {label}
          </text>
        )}
      </g>
    );
  }
  return (
    <g>
      <line x1={x0 ?? 0} x2={x1 ?? 0} y1={y} y2={y} stroke={stroke} strokeWidth={strong ? 1.5 : 1} />
      {label && (
        <text x={(x1 ?? 0) - 2} y={(y ?? 0) - 4} textAnchor="end" fill="var(--ink)" className="text-[10px] font-semibold">
          {label}
        </text>
      )}
    </g>
  );
}

/** Path for a bar with 4px rounded data-end and a square baseline. */
export function barPath(x: number, y: number, w: number, h: number, orientation: "up" | "right", radius = 4): string {
  if (w <= 0 || h <= 0) return "";
  if (orientation === "up") {
    const r = Math.min(radius, w / 2, h);
    return `M${x},${y + h}V${y + r}A${r},${r} 0 0 1 ${x + r},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h}Z`;
  }
  const r = Math.min(radius, h / 2, w);
  return `M${x},${y}H${x + w - r}A${r},${r} 0 0 1 ${x + w},${y + r}V${y + h - r}A${r},${r} 0 0 1 ${x + w - r},${y + h}H${x}Z`;
}
