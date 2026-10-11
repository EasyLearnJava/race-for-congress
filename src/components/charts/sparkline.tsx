"use client";

// Micro charts for table cells and stat tiles: a trend line (Sparkline), a diverging margin
// bar (MarginBar) and a two-part win-probability bar (ProbBar). Each sits beside a number that
// already states the value, so none carries a tooltip or any interaction, and each is hidden
// from assistive tech unless given an ariaLabel. Sized by props (default 80x18), never measured;
// the svg is inline-block and vertically centered so it flows with text and cell alignment.
import { memo, useMemo, type ReactNode } from "react";

import { partyColor } from "@/lib/ratings";
import { barPath } from "./axes";

const DEFAULT_WIDTH = 80;
const DEFAULT_HEIGHT = 18;
/** End dot: an 8px fill (r = 4) wrapped in a 2px surface ring. */
const DOT_R = 4;
const RING = 2;
/** Bar thickness cap for MarginBar and ProbBar; the rest of the height is air. */
const BAR_MAX = 10;
/** Surface gap between the two ProbBar segments. */
const GAP = 2;
/** Margin (points) that fills one half of a MarginBar by default. */
const DEFAULT_MARGIN_MAX = 30;
/** Margins smaller than this print as "Even" in fmtMargin (one decimal), so they draw no bar. */
const EVEN_BELOW = 0.05;
/** Auto y-extents closer than this fraction of their magnitude are floating-point noise: draw flat. */
const FLAT_EPSILON = 1e-9;

/**
 * The non-Republican side of a race, as in the model's `RaceProjection.challenger`: a Democrat,
 * or an independent where no Democrat runs. It picks the party token for that side's fill.
 */
export type Challenger = "D" | "I";

interface MicroChartProps {
  /** Width in CSS pixels. Default 80. */
  width?: number;
  /** Height in CSS pixels. Default 18. */
  height?: number;
  /**
   * Accessible name, e.g. "Win probability: 62% Democratic". Without it the chart is
   * aria-hidden, which is right when the same number is printed beside it.
   */
  ariaLabel?: string;
  /** Extra classes for the svg, which is `inline-block align-middle` by default. */
  className?: string;
}

export interface SparklineProps extends MicroChartProps {
  /** The series, evenly spaced in x, oldest first. null, NaN and ±Infinity leave a gap; a lone value between gaps draws as a 2px point. */
  values: ReadonlyArray<number | null | undefined>;
  /** Line (and area) color as a CSS token, e.g. "var(--dem)". Default "var(--ink-2)". */
  color?: string;
  /** End-dot color. Defaults to `color`; pass a party token to show who leads now. */
  dotColor?: string;
  /** Wash the area under the line at 10% opacity, down to `baseline` when one is given. Default false. */
  area?: boolean;
  /** Draw a 1px reference hairline at this value (e.g. 0 for an even margin). The y-domain widens to keep it in view. */
  baseline?: number;
  /**
   * Fixed y-domain [min, max]. Give every row of a table the same domain so the lines compare
   * honestly; values outside it are clamped to the edge. Default: the data's own extent.
   */
  domain?: readonly [number, number];
  /** Mark the latest defined value with an 8px dot in a 2px surface ring. Default true. */
  highlightLast?: boolean;
}

export interface MarginBarProps extends MicroChartProps {
  /**
   * Margin in points; positive favors the Democrat (the bar grows right in --dem), negative the
   * Republican (grows left in --rep). A margin that rounds to "Even" (under 0.05) draws no bar.
   */
  value: number | null | undefined;
  /** Margin that fills one half of the bar; larger margins draw as a full half. Default 30. */
  max?: number;
  /** Who the positive side is: "D" (default, --dem) or "I" for an independent (--ind). Pass `RaceProjection.challenger`. */
  challenger?: Challenger;
}

export interface ProbBarProps extends MicroChartProps {
  /**
   * Probability the Democrat (or the `challenger`) wins, 0..1 (clamped). That share fills from
   * the left, the Republican share from the right.
   */
  p: number | null | undefined;
  /** Who the left share belongs to: "D" (default, --dem) or "I" for an independent (--ind). Pass `RaceProjection.challenger`. */
  challenger?: Challenger;
}

/**
 * A tiny trend line: 2px line, gaps at missing values, an optional 10% area wash, an optional
 * baseline hairline and a surface-ringed dot on the latest value.
 */
export const Sparkline = memo(function Sparkline({
  values,
  width,
  height,
  color = "var(--ink-2)",
  dotColor,
  area = false,
  baseline,
  domain,
  highlightLast = true,
  ariaLabel,
  className,
}: SparklineProps) {
  const w = px(width, DEFAULT_WIDTH);
  const h = px(height, DEFAULT_HEIGHT);
  const d0 = domain?.[0];
  const d1 = domain?.[1];
  const geo = useMemo(
    () => sparkGeometry(Array.isArray(values) ? values : [], w, h, area, baseline, d0, d1, highlightLast),
    [values, w, h, area, baseline, d0, d1, highlightLast],
  );

  if (w < 1 || h < 1) return <MicroSvg width={w} height={h} ariaLabel={ariaLabel} className={className} />;
  if (!geo) return <NoData width={w} height={h} ariaLabel={ariaLabel} className={className} />;

  return (
    <MicroSvg width={w} height={h} ariaLabel={ariaLabel} className={className}>
      {geo.baseY != null && <line x1={0} x2={geo.right} y1={geo.baseY} y2={geo.baseY} stroke="var(--axis)" strokeWidth={1} />}
      {geo.area && <path d={geo.area} fill={color} fillOpacity={0.1} />}
      <path d={geo.line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {geo.last && (
        <circle
          cx={geo.last.x}
          cy={geo.last.y}
          r={DOT_R + RING / 2}
          fill={dotColor ?? color}
          stroke="var(--surface)"
          strokeWidth={RING}
        />
      )}
    </MicroSvg>
  );
});

/**
 * A tiny diverging bar for a margin: Democratic (or independent) margins grow right, Republican
 * margins grow left in --rep, both from a center zero hairline.
 */
export const MarginBar = memo(function MarginBar({
  value,
  max = DEFAULT_MARGIN_MAX,
  challenger = "D",
  width,
  height,
  ariaLabel,
  className,
}: MarginBarProps) {
  const w = px(width, DEFAULT_WIDTH);
  const h = px(height, DEFAULT_HEIGHT);
  if (w < 1 || h < 1) return <MicroSvg width={w} height={h} ariaLabel={ariaLabel} className={className} />;
  if (!finite(value)) return <NoData width={w} height={h} ariaLabel={ariaLabel} className={className} />;

  const scaleMax = finite(max) && max > 0 ? max : DEFAULT_MARGIN_MAX;
  const t = barThickness(h);
  const y = Math.round((h - t) / 2);
  // The zero hairline fills pixel column [z, z + 1); bars grow outward from either side of it.
  const z = Math.floor(w / 2);
  const half = Math.max(0, Math.min(z, w - z - 1));
  // A margin printed as "Even" draws no bar, so the bar never shows a lean the number denies.
  // Any other margin keeps at least a 1px sliver, so the leaning side always shows.
  const len =
    Math.abs(value) < EVEN_BELOW ? 0 : round1(Math.max(Math.min(1, half), (Math.min(Math.abs(value), scaleMax) / scaleMax) * half));

  return (
    <MicroSvg width={w} height={h} ariaLabel={ariaLabel} className={className}>
      <line x1={z + 0.5} x2={z + 0.5} y1={0} y2={h} stroke="var(--axis)" strokeWidth={1} />
      {len > 0 && value > 0 && <path d={barPath(z + 1, y, len, t, "right")} fill={partyColor(challenger)} />}
      {/* barPath rounds only a right-hand end, so the left-growing bar is drawn mirrored. */}
      {len > 0 && value < 0 && <path d={barPath(-z, y, len, t, "right")} transform="scale(-1,1)" fill="var(--rep)" />}
    </MicroSvg>
  );
});

/**
 * A tiny two-part bar for a win probability: the Democratic (or independent) share from the
 * left, the Republican share from the right in --rep, a 2px surface gap at the split and a 50%
 * tick above and below the bar.
 */
export const ProbBar = memo(function ProbBar({ p, challenger = "D", width, height, ariaLabel, className }: ProbBarProps) {
  const w = px(width, DEFAULT_WIDTH);
  const h = px(height, DEFAULT_HEIGHT);
  if (w < 1 || h < 1) return <MicroSvg width={w} height={h} ariaLabel={ariaLabel} className={className} />;
  if (!finite(p)) return <NoData width={w} height={h} ariaLabel={ariaLabel} className={className} />;

  const left = partyColor(challenger);
  const q = Math.min(1, Math.max(0, p));
  const t = barThickness(h);
  const y = Math.round((h - t) / 2);
  // An odd bar width puts 50% on a pixel center, so the tick renders as a crisp hairline.
  const whole = Math.floor(w);
  const bw = whole % 2 === 0 ? whole - 1 : whole;
  const mid = bw / 2;
  // Only exact 0 and 1 draw one segment: any real uncertainty keeps at least a 1px sliver.
  const single = q === 0 || q === 1 || bw < 2 + GAP;

  let bar: ReactNode;
  if (single) {
    bar = <rect x={0} y={y} width={bw} height={t} rx={Math.min(4, t / 2)} fill={q >= 0.5 ? left : "var(--rep)"} />;
  } else {
    // The split is not snapped to whole pixels, so an even race stays symmetric: each side gives
    // 1px to the gap. Clamping keeps at least 1px on each side.
    const split = Math.min(bw - 1 - GAP / 2, Math.max(1 + GAP / 2, round1(q * bw)));
    const leftW = split - GAP / 2;
    const repX = split + GAP / 2;
    bar = (
      <>
        {/* Rounded outer ends, square at the split; the left segment is barPath mirrored. */}
        <path d={barPath(-leftW, y, leftW, t, "right")} transform="scale(-1,1)" fill={left} />
        <path d={barPath(repX, y, bw - repX, t, "right")} fill="var(--rep)" />
      </>
    );
  }

  return (
    <MicroSvg width={w} height={h} ariaLabel={ariaLabel} className={className}>
      {/* The 50% tick stops at the bar's edges, so the split gap stays clean surface even at 50%. */}
      {y > 0 && <path d={`M${mid},0V${y}M${mid},${y + t}V${h}`} fill="none" stroke="var(--muted)" strokeWidth={1} />}
      {bar}
    </MicroSvg>
  );
});

// ---------------------------------------------------------------------------------------------

function MicroSvg({
  width,
  height,
  ariaLabel,
  className,
  children,
}: {
  width: number;
  height: number;
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <svg
      width={width}
      height={height}
      // The end dot's surface ring (and, in a box under 18px tall, part of the dot) may spill
      // past the top or bottom rather than be clipped.
      overflow="visible"
      className={className ? `inline-block align-middle ${className}` : "inline-block align-middle"}
      role={ariaLabel ? "img" : undefined}
      aria-label={ariaLabel || undefined}
      aria-hidden={ariaLabel ? undefined : true}
    >
      {children}
    </svg>
  );
}

function NoData({ width, height, ariaLabel, className }: { width: number; height: number; ariaLabel?: string; className?: string }) {
  return (
    <MicroSvg width={width} height={height} ariaLabel={ariaLabel ? `${ariaLabel}: no data` : undefined} className={className}>
      {width >= 12 && height >= 8 && (
        <text
          x={width / 2}
          y={height / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="var(--muted)"
          className="text-[10px]"
        >
          {width >= 40 ? "No data" : "—"}
        </text>
      )}
    </MicroSvg>
  );
}

interface SparkGeometry {
  line: string;
  area: string;
  /** Pixel y of the baseline hairline (snapped crisp), when the baseline is in view. */
  baseY: number | null;
  /**
   * Right end of the plot: the last slot's x plus the line's round cap. The baseline stops here,
   * so it never pokes out past the end dot's ring as a stray stub.
   */
  right: number;
  last: { x: number; y: number } | null;
}

/** Paths for a sparkline, or null when no value is drawable. */
function sparkGeometry(
  values: ReadonlyArray<number | null | undefined>,
  width: number,
  height: number,
  withArea: boolean,
  baseline: number | undefined,
  d0: number | undefined,
  d1: number | undefined,
  withDot: boolean,
): SparkGeometry | null {
  const n = values.length;
  let lo = Infinity;
  let hi = -Infinity;
  let lastIndex = -1;
  let lastValue = 0;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!finite(v)) continue;
    if (v < lo) lo = v;
    if (v > hi) hi = v;
    lastIndex = i;
    lastValue = v;
  }
  if (lastIndex < 0) return null;

  const base = finite(baseline) ? baseline : null;
  if (finite(d0) && finite(d1) && d0 !== d1) {
    lo = Math.min(d0, d1);
    hi = Math.max(d0, d1);
  } else {
    if (base != null) {
      lo = Math.min(lo, base);
      hi = Math.max(hi, base);
    }
    // A flat series, or a single value, sits at mid-height. Extents that differ only by
    // floating-point noise (0.30000000000000004 vs 0.3) count as flat, so rounding error is never
    // stretched into a full-height swing; the padding scales with the values so it never vanishes.
    const magnitude = Math.max(1, Math.abs(lo), Math.abs(hi));
    if (hi - lo <= magnitude * FLAT_EPSILON) {
      const center = (lo + hi) / 2;
      lo = center - magnitude;
      hi = center + magnitude;
    }
  }

  // Inset so the 2px line and the dot's fill stay inside the box. Height is the scarce
  // dimension, so vertically only the fill is inset and the surface ring may spill. Below 18px
  // the dot gives way too, so the line always keeps at least half the height for the data
  // (a fixed 4px inset would flatten every series at 8px).
  const padY = withDot ? Math.max(1, Math.min(DOT_R, (height - 2) / 4)) : 1;
  const x0 = 1;
  const x1 = Math.max(x0, width - (withDot ? DOT_R + RING : 1));
  const yTop = padY;
  const yBottom = Math.max(yTop, height - padY);
  const xAt = (i: number) => round1(n > 1 ? x0 + (i / (n - 1)) * (x1 - x0) : x1);
  const yAt = (v: number) => round1(yBottom - ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * (yBottom - yTop));

  // Unbroken runs of defined values; a missing value ends a run.
  const runs: [number, number][][] = [];
  let current: [number, number][] | null = null;
  for (let i = 0; i < n; i++) {
    const v = values[i];
    if (!finite(v)) {
      current = null;
      continue;
    }
    if (!current) {
      current = [];
      runs.push(current);
    }
    current.push([xAt(i), yAt(v)]);
  }

  const floor = base != null ? yAt(base) : height;
  let line = "";
  let area = "";
  for (const run of runs) {
    const pts = run.map(([x, y]) => `${x},${y}`).join("L");
    if (run.length === 1) {
      // An isolated value: a zero-length segment that the round cap draws as a 2px dot.
      line += `M${pts}h0`;
      continue;
    }
    line += `M${pts}`;
    if (withArea) area += `M${run[0][0]},${floor}L${pts}L${run[run.length - 1][0]},${floor}Z`;
  }

  return {
    line,
    area,
    baseY: base != null && base >= lo && base <= hi ? Math.round(yAt(base) - 0.5) + 0.5 : null,
    right: Math.min(width, x1 + 1),
    last: withDot ? { x: xAt(lastIndex), y: yAt(lastValue) } : null,
  };
}

function finite(v: number | null | undefined): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/** A usable pixel size: finite and non-negative, else the default. */
function px(v: number | undefined, fallback: number): number {
  return finite(v) ? Math.max(0, v) : fallback;
}

/** Bar thickness for a given height: about half of it, capped so the rest reads as air, and never taller than the box. */
function barThickness(h: number): number {
  return Math.min(h, Math.max(2, Math.min(BAR_MAX, Math.round(h * 0.55))));
}

/** One decimal is sub-pixel precision and keeps hundreds of paths small. */
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
