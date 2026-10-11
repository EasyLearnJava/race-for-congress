"use client";

// Line chart on a numeric x axis: one or more series (2px round-capped lines, optional 10%
// area wash), labelled reference lines, a highlighted marker x, and a crosshair that snaps
// to the nearest data x (or the marker) and lists every series there. With onXClick the plot doubles as an
// x picker: click or tap anywhere, or focus it, move with the arrow keys and press Enter.
//
// Rendered inside ChartFrame's render prop, which measures the width (this never measures):
//   <ChartFrame title="…" height={280}>{(w) => <LineChart width={w} height={280} … />}</ChartFrame>
//
// One transparent layer over the plot carries every interaction (pointer, click, keyboard)
// as a single slider control. It sits beside the role="img" svg, not inside it, so assistive
// technology can reach it. Label widths are estimated rather than measured, so the layout
// is deterministic and needs no effects.
import { bisectLeft } from "d3-array";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { area as d3Area, line as d3Line } from "d3-shape";
import { useId, useMemo, useState, type FocusEvent, type KeyboardEvent, type PointerEvent } from "react";

import { fmtCompact } from "@/lib/format";
import { RefLine, XAxis, YAxis } from "./axes";
import { TipRow, TipTitle, TooltipLayer, type TipState } from "./tooltip";

/* ------------------------------------------------------------------ public types */

/** An [x, y] pair. A null or NaN y leaves a gap in the line. */
export type LinePoint = readonly [x: number, y: number | null];

/** One line on the chart. */
export interface LineSeries {
  /** Stable identity. Tie it to the entity, not its rank, so a color never jumps to another line. */
  key: string;
  /** Series name, shown in the tooltip, the end label and the accessible summary. */
  label: string;
  /** Line (and area) color as a CSS token, e.g. "var(--dem)" or "var(--m-4)". Never a hex value. */
  color: string;
  /** Points in any order. Points with a non-finite x are dropped; a null/NaN y breaks the line. */
  points: readonly LinePoint[];
  /** Wash the area between the line and zero (or the plot floor) at 10% opacity. */
  area?: boolean;
}

/** A reference line: vertical at `x`, or horizontal at `y` (`x` wins when both are set). */
export interface LineRefLine {
  /** Data x of a vertical line, e.g. the current environment or the finish line. */
  x?: number;
  /** Data y of a horizontal line, e.g. a 0.5 probability or the majority seat count. */
  y?: number;
  /** Short label: above the plot for a vertical line, at the right end for a horizontal one. */
  label?: string;
  /** Ink at 1.5px for the line the story is about; otherwise a recessive axis-gray hairline. */
  strong?: boolean;
}

/** A highlighted x, e.g. the current setting: a ringed dot on every series plus one label. */
export interface LineMarker {
  /** Data x. Between data points each line's value is interpolated, as the line is drawn. */
  x: number;
  /** Short label drawn beside the dots and repeated in the tooltip, e.g. "Current". */
  label: string;
}

export interface LineChartProps {
  /** Width in px, from ChartFrame's render prop. */
  width: number;
  /** Height in px including the axis labels. Pass the same number as ChartFrame's `height`. Default 280. */
  height?: number;
  /** The lines, drawn in this order (later lines on top). */
  series: readonly LineSeries[];
  /** x extent, left to right. Default: the data and any vertical reference lines, unpadded. */
  xDomain?: readonly [number, number];
  /**
   * y extent, used exactly as given. Default: the data and any horizontal reference lines
   * (plus zero when a series has an area), widened to round tick values.
   */
  yDomain?: readonly [number, number];
  /** Formats x in the tooltip and accessible text, e.g. `(v) => fmtMargin(v)`. Default: compact number. */
  xFormat?: (x: number) => string;
  /** Formats y in the tooltip and accessible text, e.g. `fmtProb`. Default: compact number. */
  yFormat?: (y: number) => string;
  /** Formats x tick labels when they need a rounder form than `xFormat`, e.g. `(v) => fmtMargin(v, 0)`. */
  xTickFormat?: (x: number) => string;
  /** Formats y tick labels, e.g. `(v) => \`${Math.round(v * 100)}%\`` (fmtProb would print 0 as "<1%"). */
  yTickFormat?: (y: number) => string;
  /** Axis title, centered under the x axis. */
  xLabel?: string;
  /** Axis title, written horizontally above the y tick labels. */
  yLabel?: string;
  /** Reference lines, e.g. y = 0.5, x = current environment, x = finish line. Lines outside the domain are skipped. */
  refLines?: readonly LineRefLine[];
  /**
   * Makes the plot an x picker. A click or tap anywhere on the plot, or Enter/Space on the
   * focused plot, calls this with the snapped x: one of the data x values, or the marker's x.
   */
  onXClick?: (x: number) => void;
  /**
   * Highlights one x (e.g. the current setting): a dot on each series plus a label. Its x is
   * also a crosshair stop, and the keyboard cursor starts there.
   */
  marker?: LineMarker;
  /**
   * Name each line at its right end. Drawn only for 2-3 lines that all reach the right edge,
   * when the names fit and do not collide; otherwise the legend and tooltip carry identity. Default true.
   */
  endLabels?: boolean;
  /** Accessible summary for the svg. Default: generated from the series, the x range and the marker. */
  ariaLabel?: string;
}

/* ------------------------------------------------------------------ internals */

type Pt = [number, number];
type Fmt = (v: number) => string;

interface CleanSeries {
  key: string;
  label: string;
  color: string;
  area: boolean;
  /** Sorted by x; y is NaN at a gap. */
  pts: Pt[];
  xs: number[];
  /** Defined points with no defined neighbor. A one-point path is invisible, so these become dots. */
  lone: Pt[];
  /** First and last defined points, by x. */
  first: Pt | null;
  last: Pt | null;
}

interface NormRef {
  kind: "v" | "h";
  value: number;
  label: string;
  strong: boolean;
}

interface Domains {
  x: [number, number];
  y: [number, number];
  niceY: boolean;
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

interface Layout {
  left: number;
  right: number;
  top: number;
  bottom: number;
  xScale: ScaleLinear<number, number>;
  yScale: ScaleLinear<number, number>;
  xTicks: number[];
  yTicks: number[];
  vLines: { px: number; strong: boolean }[];
  hLines: { py: number; strong: boolean }[];
  topLabels: { text: string; x: number; y: number; strong: boolean }[];
  sideLabels: { text: string; x: number; y: number; strong: boolean; box: Box }[];
  endLabels: { text: string; y: number }[];
  xTitle: string;
  yTitle: string;
  /** Pixel y of zero when it falls strictly inside the plot (gets an axis-weight line). */
  zeroY: number | null;
  /** Floor of the area washes: zero, clamped into the plot. */
  baseY: number;
}

interface Hover {
  /** Snapped data x. */
  x: number;
  /** Pointer y in chart pixels (the tooltip follows it). */
  py: number;
  touch: boolean;
}

const TICK = 10; // tick and reference-label font size, px
const LABEL = 11; // axis-title, end-label and marker-label font size, px
const EM = 0.6; // estimated advance per character, in em (Inter averages ~0.55; err wide)
const ROW = 13; // height of one row of reference labels above the plot
const HALO = { stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" } as const;

const textWidth = (s: string, size: number) => s.length * size * EM;

/** Truncate with an ellipsis so the estimated width fits; "" when not even a stub fits. */
function fitText(s: string, maxW: number, size: number): string {
  if (textWidth(s, size) <= maxW) return s;
  const n = Math.floor(maxW / (size * EM)) - 1;
  return n >= 3 ? `${s.slice(0, n).trimEnd()}…` : "";
}

function within(v: number, dom: readonly [number, number]): boolean {
  const lo = Math.min(dom[0], dom[1]);
  const hi = Math.max(dom[0], dom[1]);
  const eps = (hi - lo) * 1e-9;
  return v >= lo - eps && v <= hi + eps;
}

function padDomain(a: number, b: number): [number, number] {
  if (a !== b) return [a, b];
  const pad = Math.abs(a) * 0.1 || 1;
  return [a - pad, b + pad];
}

const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

function cleanSeries(series: readonly LineSeries[]): CleanSeries[] {
  return (series ?? []).map((s) => {
    const pts: Pt[] = [];
    for (const p of s.points ?? []) {
      const x = p?.[0];
      if (typeof x !== "number" || !Number.isFinite(x)) continue;
      const y = p[1];
      pts.push([x, typeof y === "number" && Number.isFinite(y) ? y : NaN]);
    }
    pts.sort((a, b) => a[0] - b[0]);
    const ok = (i: number) => i >= 0 && i < pts.length && Number.isFinite(pts[i][1]);
    const defined = pts.filter((_, i) => ok(i));
    return {
      key: s.key,
      label: s.label ?? "",
      color: s.color,
      area: !!s.area,
      pts,
      xs: pts.map((p) => p[0]),
      lone: pts.filter((_, i) => ok(i) && !ok(i - 1) && !ok(i + 1)),
      first: defined[0] ?? null,
      last: defined[defined.length - 1] ?? null,
    };
  });
}

function cleanRefs(refLines: readonly LineRefLine[] | undefined): NormRef[] {
  const out: NormRef[] = [];
  for (const r of refLines ?? []) {
    if (!r) continue;
    const label = r.label ?? "";
    if (typeof r.x === "number" && Number.isFinite(r.x)) out.push({ kind: "v", value: r.x, label, strong: !!r.strong });
    else if (typeof r.y === "number" && Number.isFinite(r.y)) out.push({ kind: "h", value: r.y, label, strong: !!r.strong });
  }
  return out;
}

/** Null when no series has a single defined point. */
function computeDomains(
  clean: CleanSeries[],
  refs: NormRef[],
  xDomain: readonly [number, number] | undefined,
  yDomain: readonly [number, number] | undefined,
): Domains | null {
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const c of clean) {
    for (const [px, py] of c.pts) {
      x0 = Math.min(x0, px);
      x1 = Math.max(x1, px);
      if (Number.isFinite(py)) {
        y0 = Math.min(y0, py);
        y1 = Math.max(y1, py);
      }
    }
  }
  if (!Number.isFinite(y0)) return null;
  for (const r of refs) {
    if (r.kind === "v") {
      x0 = Math.min(x0, r.value);
      x1 = Math.max(x1, r.value);
    } else {
      y0 = Math.min(y0, r.value);
      y1 = Math.max(y1, r.value);
    }
  }
  // An area encodes magnitude from zero, so its default scale includes zero.
  if (clean.some((c) => c.area && c.first)) {
    y0 = Math.min(y0, 0);
    y1 = Math.max(y1, 0);
  }
  const valid = (d: readonly [number, number] | undefined) =>
    d && Number.isFinite(d[0]) && Number.isFinite(d[1]) ? padDomain(d[0], d[1]) : null;
  const gx = valid(xDomain);
  const gy = valid(yDomain);
  return { x: gx ?? padDomain(x0, x1), y: gy ?? padDomain(y0, y1), niceY: !gy };
}

/** Two x values closer than this read as the same position (well under a pixel). */
const sameX = (a: number, b: number, dom: readonly [number, number]) => Math.abs(a - b) <= Math.abs(dom[1] - dom[0]) / 2000;

/**
 * The crosshair's stops: every x (inside the domain) where at least one series has a value,
 * plus the marker's x, so the current setting can be read exactly rather than at a neighbor.
 */
function snapPositions(clean: CleanSeries[], dom: [number, number], markerX: number | null): number[] {
  const set = new Set<number>();
  for (const c of clean) for (const [px, py] of c.pts) if (Number.isFinite(py) && within(px, dom)) set.add(px);
  const xs = Array.from(set).sort((a, b) => a - b);
  if (markerX == null || !clean.some((c) => valueAt(c, markerX) != null)) return xs;
  const i = nearestIndex(xs, markerX);
  if (i >= 0 && sameX(xs[i], markerX, dom)) return xs;
  return [...xs, markerX].sort((a, b) => a - b);
}

function nearestIndex(sorted: number[], v: number): number {
  const n = sorted.length;
  if (n === 0) return -1;
  if (!Number.isFinite(v)) return n - 1;
  const i = bisectLeft(sorted, v);
  if (i <= 0) return 0;
  if (i >= n) return n - 1;
  return v - sorted[i - 1] <= sorted[i] - v ? i - 1 : i;
}

/** The series value at x: exact at a data point, linear between two defined neighbors, else null. */
function valueAt(c: CleanSeries, x: number): number | null {
  const i = bisectLeft(c.xs, x);
  if (i < c.xs.length && c.xs[i] === x) return Number.isFinite(c.pts[i][1]) ? c.pts[i][1] : null;
  if (i === 0 || i >= c.xs.length) return null;
  const [xa, ya] = c.pts[i - 1];
  const [xb, yb] = c.pts[i];
  if (!Number.isFinite(ya) || !Number.isFinite(yb) || xa === xb) return null;
  return ya + ((yb - ya) * (x - xa)) / (xb - xa);
}

function dedupeLabels(ticks: number[], f: Fmt): number[] {
  const out: number[] = [];
  let prev: string | undefined;
  for (const t of ticks) {
    const s = f(t);
    if (s !== prev) out.push(t);
    prev = s;
  }
  return out;
}

function keepApart(ticks: number[], apart: (a: number, b: number) => boolean): number[] {
  const out: number[] = [];
  for (const t of ticks) if (out.length === 0 || apart(out[out.length - 1], t)) out.push(t);
  return out;
}

/** The most round x ticks whose labels fit side by side (and inside the svg). */
function fitTicksX(scale: ScaleLinear<number, number>, f: Fmt, start: number, width: number): number[] {
  const half = (t: number) => textWidth(f(t), TICK) / 2;
  const apart = (a: number, b: number) => Math.abs(scale(a) - scale(b)) >= half(a) + half(b) + 8;
  let ticks: number[] = [];
  for (let n = Math.max(2, start); n >= 2; n--) {
    ticks = dedupeLabels(scale.ticks(n), f);
    if (ticks.every((t, i) => i === 0 || apart(ticks[i - 1], t))) break;
  }
  return keepApart(
    ticks.filter((t) => scale(t) - half(t) >= 0 && scale(t) + half(t) <= width),
    apart,
  );
}

/** The most round y ticks at least 14px apart. */
function fitTicksY(scale: ScaleLinear<number, number>, f: Fmt, start: number): number[] {
  const apart = (a: number, b: number) => Math.abs(scale(a) - scale(b)) >= 14;
  let ticks: number[] = [];
  for (let n = Math.max(2, start); n >= 2; n--) {
    ticks = dedupeLabels(scale.ticks(n), f);
    if (ticks.every((t, i) => i === 0 || apart(ticks[i - 1], t))) return ticks;
  }
  return keepApart(ticks, apart);
}

/**
 * Labels of vertical reference lines, centered over their line (nudged inside the plot) and
 * stacked into rows when they overlap. Strong lines claim space first; a label that fits in
 * no row is dropped, never truncated.
 */
function placeTopLabels(refs: NormRef[], x: ScaleLinear<number, number>, left: number, right: number, maxRows: number) {
  const rows: [number, number][][] = [];
  const labels: { text: string; x: number; row: number; strong: boolean }[] = [];
  const ordered = refs.filter((r) => r.label).sort((a, b) => Number(b.strong) - Number(a.strong));
  for (const r of ordered) {
    const text = r.label;
    if (textWidth(text, TICK) > right - left) continue;
    const half = textWidth(text, TICK) / 2;
    const cx = Math.min(Math.max(x(r.value), left + half), right - half);
    const a = cx - half - 4;
    const b = cx + half + 4;
    let row = 0;
    while (row < maxRows && (rows[row] ?? []).some(([s, e]) => a < e && s < b)) row++;
    if (row >= maxRows) continue;
    if (!rows[row]) rows[row] = [];
    rows[row].push([a, b]);
    labels.push({ text, x: cx, row, strong: r.strong });
  }
  return { labels, rows: rows.length };
}

/** End-label candidates: 2-3 lines that all reach the right edge of the x domain. */
function endCandidates(clean: CleanSeries[], dom: [number, number]): { text: string; y: number }[] | null {
  const lines = clean.filter((c) => c.last);
  if (lines.length < 2 || lines.length > 3) return null;
  const reversed = dom[0] > dom[1];
  const tol = Math.abs(dom[1] - dom[0]) * 1e-6;
  const out: { text: string; y: number }[] = [];
  for (const c of lines) {
    const end = reversed ? c.first : c.last;
    if (!end || !c.label || Math.abs(end[0] - dom[1]) > tol) return null;
    out.push({ text: c.label, y: end[1] });
  }
  return out;
}

function computeLayout(o: {
  width: number;
  height: number;
  dom: Domains;
  clean: CleanSeries[];
  refs: NormRef[];
  xTick: Fmt;
  yTick: Fmt;
  xLabel?: string;
  yLabel?: string;
  endLabels: boolean;
}): Layout {
  const W = Math.max(1, o.width);
  const H = Math.max(1, o.height);
  const yTitle = o.yLabel ? fitText(o.yLabel, W - 2, LABEL) : "";
  const vRefs = o.refs.filter((r) => r.kind === "v" && within(r.value, o.dom.x));
  const vLabelled = vRefs.filter((r) => r.label);

  // Top band: the y title (if any), then up to two rows of vertical reference labels.
  const topFor = (rows: number) => {
    const band = rows > 0 ? rows * ROW + 4 : 0;
    return yTitle ? Math.max(24, 16 + band) : Math.max(8, band);
  };
  const bottomPad = o.xLabel ? 38 : 22;
  const makeY = (top: number) => {
    const bottom = Math.max(top + 16, H - bottomPad);
    const count = Math.max(2, Math.floor((bottom - top) / 45));
    const scale = scaleLinear().domain(o.dom.y).range([bottom, top]);
    if (o.dom.niceY) scale.nice(count);
    return { scale, bottom, ticks: fitTicksY(scale, o.yTick, count) };
  };
  const yTickWidth = (ticks: number[]) => ticks.reduce((m, t) => Math.max(m, textWidth(o.yTick(t), TICK)), 0);
  const makeX = (l: number, r: number) => scaleLinear().domain(o.dom.x).range([l, Math.max(l + 1, r)]);

  // Pass 1: a provisional vertical layout gives the y tick labels, hence the left margin.
  let top = topFor(vLabelled.length > 0 ? 1 : 0);
  let Y = makeY(top);
  let left = Math.ceil(Math.max(yTickWidth(Y.ticks) + 8, textWidth(o.xTick(o.dom.x[0]), TICK) / 2 + 2, 10));
  const rightPad = Math.ceil(Math.max(textWidth(o.xTick(o.dom.x[1]), TICK) / 2 + 2, 10));

  // End labels need a right margin wide enough for the longest name.
  let ends = o.endLabels ? endCandidates(o.clean, o.dom.x) : null;
  const endPad = ends ? Math.ceil(ends.reduce((m, e) => Math.max(m, textWidth(e.text, LABEL)), 0) + 12) : 0;
  if (ends && (W < 200 || endPad > Math.min(160, W * 0.3))) ends = null;

  // Pass 2: stack the vertical reference labels, then settle the vertical layout.
  let right = W - Math.max(rightPad, ends ? endPad : 0);
  const rows = placeTopLabels(vLabelled, makeX(left, right), left, right, W < 200 ? 1 : 2).rows;
  top = topFor(rows);
  Y = makeY(top);
  left = Math.max(left, Math.ceil(yTickWidth(Y.ticks) + 8));
  const { scale: yScale, bottom } = Y;

  // Colliding end labels are dropped, never nudged apart: the legend and tooltip carry identity.
  if (ends) {
    const ys = ends.map((e) => yScale(e.y)).sort((a, b) => a - b);
    if (ys.some((v, i) => v < top - 2 || v > bottom + 2 || (i > 0 && v - ys[i - 1] < 13))) ends = null;
  }
  right = Math.max(left + 1, W - Math.max(rightPad, ends ? endPad : 0));
  const xScale = makeX(left, right);

  const [yd0, yd1] = yScale.domain();
  const yLo = Math.min(yd0, yd1);
  const yHi = Math.max(yd0, yd1);
  const hRefs = o.refs.filter((r) => r.kind === "h" && within(r.value, [yLo, yHi]));

  // Horizontal reference labels sit at the right end, above their line (below if there is no
  // room); one that does not fit is dropped, never truncated.
  const sideLabels: Layout["sideLabels"] = [];
  for (const r of hRefs.filter((h) => h.label).sort((a, b) => Number(b.strong) - Number(a.strong))) {
    const text = r.label;
    const w = textWidth(text, TICK);
    if (w > (right - left) * 0.6) continue;
    const py = yScale(r.value);
    const x = right - 4;
    for (const base of [py - 4, py + 12]) {
      const box = { x0: x - w - 2, x1: x + 2, y0: base - 9, y1: base + 3 };
      if (box.y0 < top - 1 || box.y1 > bottom + 1 || sideLabels.some((l) => overlaps(l.box, box))) continue;
      sideLabels.push({ text, x, y: base, strong: r.strong, box });
      break;
    }
  }

  const center = (left + right) / 2;
  return {
    left,
    right,
    top,
    bottom,
    xScale,
    yScale,
    xTicks: fitTicksX(xScale, o.xTick, Math.floor((right - left) / 80), W),
    yTicks: Y.ticks,
    vLines: vRefs.map((r) => ({ px: xScale(r.value), strong: r.strong })),
    hLines: hRefs.map((r) => ({ py: yScale(r.value), strong: r.strong })),
    topLabels: placeTopLabels(vLabelled, xScale, left, right, rows).labels.map((l) => ({
      text: l.text,
      x: l.x,
      y: top - 4 - l.row * ROW,
      strong: l.strong,
    })),
    sideLabels,
    endLabels: ends ? ends.map((e) => ({ text: e.text, y: yScale(e.y) })) : [],
    xTitle: o.xLabel ? fitText(o.xLabel, 2 * Math.min(center, W - center) - 4, LABEL) : "",
    yTitle,
    zeroY: yLo < 0 && yHi > 0 ? yScale(0) : null,
    baseY: yScale(Math.min(Math.max(0, yLo), yHi)),
  };
}

function linePaths(clean: CleanSeries[], l: Layout): { line: string; area: string }[] {
  const { xScale: x, yScale: y } = l;
  const defined = (p: Pt) => Number.isFinite(p[1]);
  const line = d3Line<Pt>()
    .defined(defined)
    .x((p) => x(p[0]))
    .y((p) => y(p[1]));
  const area = d3Area<Pt>()
    .defined(defined)
    .x((p) => x(p[0]))
    .y0(l.baseY)
    .y1((p) => y(p[1]));
  return clean.map((c) => ({ line: line(c.pts) ?? "", area: c.area ? (area(c.pts) ?? "") : "" }));
}

/** The marker's label: above the highest dot, else below the lowest, clear of reference labels. */
function placeMarkerLabel(label: string, mx: number, dotYs: number[], l: Layout) {
  const text = label;
  if (!text || dotYs.length === 0 || textWidth(text, LABEL) > l.right - l.left) return null;
  const half = textWidth(text, LABEL) / 2;
  const x = Math.min(Math.max(mx, l.left + half), l.right - half);
  for (const base of [Math.min(...dotYs) - 11, Math.max(...dotYs) + 19]) {
    const box = { x0: x - half - 2, x1: x + half + 2, y0: base - 9, y1: base + 3 };
    if (box.y0 < l.top || box.y1 > l.bottom || l.sideLabels.some((s) => overlaps(s.box, box))) continue;
    return { text, x, y: base };
  }
  return null;
}

const fmtValue = (v: number | null, f: Fmt) => (v == null ? "—" : f(v));

/* ------------------------------------------------------------------ component */

/**
 * Lines on a numeric x axis with a snapping crosshair tooltip, reference lines, a marker
 * and optional click/keyboard selection of an x. Returns the svg, the interaction layer and
 * the tooltip as siblings; the parent (ChartFrame's plot area) must be position: relative.
 */
export function LineChart({
  width,
  height = 280,
  series,
  xDomain,
  yDomain,
  xFormat = fmtCompact,
  yFormat = fmtCompact,
  xTickFormat,
  yTickFormat,
  xLabel,
  yLabel,
  refLines,
  onXClick,
  marker,
  endLabels = true,
  ariaLabel,
}: LineChartProps) {
  const clipId = `line-clip-${useId().replace(/[^A-Za-z0-9_-]/g, "")}`;
  const [hover, setHover] = useState<Hover | null>(null);
  // Keyboard cursor: shown while the plot has keyboard focus; null x means "start at the marker".
  const [kbOn, setKbOn] = useState(false);
  const [kbX, setKbX] = useState<number | null>(null);

  const xTick = xTickFormat ?? xFormat;
  const yTick = yTickFormat ?? yFormat;

  const clean = useMemo(() => cleanSeries(series), [series]);
  const refs = useMemo(() => cleanRefs(refLines), [refLines]);
  const dom = useMemo(() => computeDomains(clean, refs, xDomain, yDomain), [clean, refs, xDomain, yDomain]);
  const markerX = marker && dom && Number.isFinite(marker.x) && within(marker.x, dom.x) ? marker.x : null;
  const snap = useMemo(() => (dom ? snapPositions(clean, dom.x, markerX) : []), [clean, dom, markerX]);
  const layout = useMemo(
    () =>
      dom && snap.length > 0
        ? computeLayout({ width, height, dom, clean, refs, xTick, yTick, xLabel, yLabel, endLabels })
        : null,
    [width, height, dom, snap.length, clean, refs, xTick, yTick, xLabel, yLabel, endLabels],
  );
  const paths = useMemo(() => (layout ? linePaths(clean, layout) : []), [clean, layout]);

  if (!dom || !layout) {
    return (
      <>
        <svg width={width} height={height} role="img" aria-label={ariaLabel ? `${ariaLabel}: no data` : "No data"} className="block">
          <text x={width / 2} y={height / 2} dy="0.32em" textAnchor="middle" fill="var(--muted)" className="text-xs">
            No data
          </text>
        </svg>
        <TooltipLayer tip={null} width={width} height={height} />
      </>
    );
  }

  const { xScale, yScale, left, right, top, bottom } = layout;
  const reversed = dom.x[0] > dom.x[1];
  const atMarker = (v: number) => markerX != null && sameX(v, markerX, dom.x);
  const inPlotY = (py: number) => py >= top - 1 && py <= bottom + 1;

  // Marker: interpolated value on every series at its x.
  const markerVals = markerX == null ? null : clean.map((c) => valueAt(c, markerX));
  const markerDots =
    markerX == null || !markerVals
      ? []
      : clean.flatMap((c, i) => {
          const v = markerVals[i];
          const cy = v == null ? NaN : yScale(v);
          return Number.isFinite(cy) && inPlotY(cy) ? [{ key: `${i}:${c.key}`, color: c.color, cy }] : [];
        });
  const markerLabel =
    markerX == null || !marker
      ? null
      : placeMarkerLabel(
          marker.label,
          xScale(markerX),
          markerDots.map((d) => d.cy),
          layout,
        );

  // Crosshair position: the pointer wins; otherwise the keyboard cursor while focused.
  const homeIdx = nearestIndex(snap, markerX ?? (reversed ? snap[0] : snap[snap.length - 1]));
  const kbIdx = kbX == null ? homeIdx : nearestIndex(snap, kbX);
  const activeIdx = hover ? nearestIndex(snap, hover.x) : kbOn ? kbIdx : -1;
  const ax = activeIdx >= 0 ? snap[activeIdx] : null;
  const activeVals = ax == null ? null : clean.map((c) => valueAt(c, ax));

  let tip: TipState | null = null;
  if (ax != null && activeVals) {
    const hint = !onXClick ? null : !hover ? "Press Enter to select" : hover.touch ? "Tap to select" : "Click to select";
    tip = {
      x: xScale(ax),
      y: hover ? hover.py : top + 4,
      // The slider's aria-valuetext already speaks these values; hide the visual copy from the live region.
      content: (
        <div aria-hidden="true">
          <TipTitle>{xFormat(ax)}</TipTitle>
          {marker?.label && atMarker(ax) ? <div className="-mt-0.5 mb-1 text-[11px] text-muted">{marker.label}</div> : null}
          {clean.map((c, i) => (
            <TipRow key={`${i}:${c.key}`} color={c.color} label={c.label} value={fmtValue(activeVals[i], yFormat)} />
          ))}
          {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
        </div>
      ),
    };
  }

  // Accessible text: a summary for the image, and the cursor's readout for the slider.
  const names = clean.filter((c) => c.last && c.label).map((c) => c.label);
  const first = snap[0];
  const last = snap[snap.length - 1];
  let summary = `Line chart${names.length > 0 ? ` of ${names.join(", ")}` : ""}${xLabel ? ` by ${xLabel}` : ""}, ${
    first === last ? `at ${xFormat(first)}` : `from ${xFormat(first)} to ${xFormat(last)}`
  }.`;
  if (marker && markerX != null && markerVals) {
    const parts = clean.flatMap((c, i) => {
      const v = markerVals[i];
      return v == null ? [] : [`${c.label} ${yFormat(v)}`];
    });
    if (parts.length > 0) summary += ` ${marker.label || "Marked"} (${xFormat(markerX)}): ${parts.join(", ")}.`;
  }
  const kbValue = snap[kbIdx];
  const kbVals = clean.map((c) => valueAt(c, kbValue));
  const valueText = `${xFormat(kbValue)}: ${clean
    .map((c, i) => `${c.label} ${kbVals[i] == null ? "no data" : fmtValue(kbVals[i], yFormat)}`)
    .join(", ")}${marker?.label && atMarker(kbValue) ? ` (${marker.label})` : ""}`;
  const xName = xLabel || "x";
  const sliderLabel = onXClick
    ? `Select ${xName}: arrow keys move the cursor, Enter selects`
    : `Read values by ${xName}: arrow keys move the cursor`;

  // One handler set on one layer serves every point: snap the pointer to the nearest data x.
  const locate = (e: { currentTarget: HTMLDivElement; clientX: number; clientY: number }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return {
      x: snap[nearestIndex(snap, xScale.invert(left + e.clientX - r.left))],
      py: top + e.clientY - r.top,
    };
  };
  const track = (e: PointerEvent<HTMLDivElement>) => {
    const p = locate(e);
    const touch = e.pointerType === "touch";
    setHover((h) => (h && h.x === p.x && h.py === p.py && h.touch === touch ? h : { x: p.x, py: p.py, touch }));
  };
  const onFocus = (e: FocusEvent<HTMLDivElement>) => {
    let keyboard = true;
    try {
      keyboard = e.currentTarget.matches(":focus-visible");
    } catch {
      // Older engines without :focus-visible: treat every focus as keyboard focus.
    }
    if (keyboard) setKbOn(true);
  };
  const onBlur = () => {
    setKbOn(false);
    setKbX(null);
    setHover(null);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const n = snap.length;
    const from = activeIdx >= 0 ? activeIdx : kbIdx;
    const step = reversed ? -1 : 1; // arrows move visually, whichever way the domain runs
    const page = Math.max(1, Math.round(n / 10));
    let next: number;
    switch (e.key) {
      case "ArrowRight":
      case "ArrowUp":
        next = from + step;
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next = from - step;
        break;
      case "PageUp":
        next = from + page * step;
        break;
      case "PageDown":
        next = from - page * step;
        break;
      case "Home":
        next = reversed ? n - 1 : 0;
        break;
      case "End":
        next = reversed ? 0 : n - 1;
        break;
      case "Enter":
      case " ":
        if (!onXClick) return;
        e.preventDefault();
        setHover(null);
        setKbOn(true);
        setKbX(snap[from]);
        onXClick(snap[from]);
        return;
      case "Escape":
        if (!kbOn && !hover) return;
        setKbOn(false);
        setHover(null);
        return;
      default:
        return;
    }
    e.preventDefault();
    setHover(null);
    setKbOn(true);
    setKbX(snap[Math.min(n - 1, Math.max(0, next))]);
  };

  const cx = ax == null ? null : xScale(ax);

  return (
    <>
      <svg width={width} height={height} role="img" aria-label={ariaLabel ?? summary} className="block">
        <defs>
          <clipPath id={clipId}>
            <rect x={left - 2} y={top - 2} width={Math.max(0, right - left + 4)} height={Math.max(0, bottom - top + 4)} />
          </clipPath>
        </defs>

        <YAxis scale={yScale} ticks={layout.yTicks} x={left} x1={right} format={yTick} />
        <g clipPath={`url(#${clipId})`}>
          {clean.map((c, i) =>
            paths[i]?.area ? <path key={`${i}:${c.key}`} d={paths[i].area} fill={c.color} fillOpacity={0.1} /> : null,
          )}
        </g>
        <XAxis scale={xScale} ticks={layout.xTicks} y={bottom} x0={left} x1={right} format={xTick} label={layout.xTitle || undefined} />
        {layout.zeroY != null && (
          <line x1={left} x2={right} y1={layout.zeroY} y2={layout.zeroY} stroke="var(--axis)" strokeWidth={1} />
        )}
        {/* The crosshair is transient, so it sits under the reference lines (and the data). */}
        {cx != null && <line x1={cx} x2={cx} y1={top} y2={bottom} stroke="var(--muted)" strokeWidth={1} />}
        {layout.hLines.map((r, i) => (
          <RefLine key={`h${i}`} y={r.py} x0={left} x1={right} strong={r.strong} />
        ))}
        {layout.vLines.map((r, i) => (
          <RefLine key={`v${i}`} x={r.px} y0={top} y1={bottom} strong={r.strong} />
        ))}

        <g clipPath={`url(#${clipId})`} fill="none" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          {clean.map((c, i) => (paths[i]?.line ? <path key={`${i}:${c.key}`} d={paths[i].line} stroke={c.color} /> : null))}
        </g>
        <g stroke="var(--surface)" strokeWidth={2}>
          {clean.flatMap((c, i) =>
            c.lone
              .filter(([px, py]) => within(px, dom.x) && inPlotY(yScale(py)))
              .map(([px, py], j) => <circle key={`${i}:${c.key}:${j}`} cx={xScale(px)} cy={yScale(py)} r={5} fill={c.color} />),
          )}
          {markerX != null &&
            markerDots.map((d) => <circle key={d.key} cx={xScale(markerX)} cy={d.cy} r={6} fill={d.color} />)}
          {/* Hover dots, unless the marker's (larger) dots already sit at this x. */}
          {cx != null &&
            ax != null &&
            activeVals &&
            !atMarker(ax) &&
            clean.map((c, i) => {
              const v = activeVals[i];
              const cy = v == null ? NaN : yScale(v);
              return Number.isFinite(cy) && inPlotY(cy) ? <circle key={`${i}:${c.key}`} cx={cx} cy={cy} r={5} fill={c.color} /> : null;
            })}
        </g>

        {layout.yTitle ? (
          <text x={0} y={12} fill="var(--ink-2)" className="text-[11px]">
            {layout.yTitle}
          </text>
        ) : null}
        {layout.topLabels.map((l, i) => (
          <text
            key={`t${i}`}
            x={l.x}
            y={l.y}
            textAnchor="middle"
            fill={l.strong ? "var(--ink)" : "var(--ink-2)"}
            className="text-[10px] font-semibold"
          >
            {l.text}
          </text>
        ))}
        {layout.sideLabels.map((l, i) => (
          <text
            key={`s${i}`}
            x={l.x}
            y={l.y}
            textAnchor="end"
            fill={l.strong ? "var(--ink)" : "var(--ink-2)"}
            className="text-[10px] font-semibold"
            {...HALO}
          >
            {l.text}
          </text>
        ))}
        {markerLabel && (
          <text x={markerLabel.x} y={markerLabel.y} textAnchor="middle" fill="var(--ink)" className="text-[11px] font-semibold" {...HALO}>
            {markerLabel.text}
          </text>
        )}
        {layout.endLabels.map((l, i) => (
          <text key={`e${i}`} x={right + 8} y={l.y} dy="0.32em" fill="var(--ink-2)" className="text-[11px] font-medium">
            {l.text}
          </text>
        ))}
      </svg>

      <div
        role="slider"
        tabIndex={0}
        aria-label={sliderLabel}
        aria-orientation="horizontal"
        aria-valuemin={first}
        aria-valuemax={last}
        aria-valuenow={kbValue}
        aria-valuetext={valueText}
        className={`absolute rounded-sm ${onXClick ? "cursor-pointer" : ""}`}
        style={{ left, top, width: right - left, height: bottom - top, touchAction: "pan-y pinch-zoom" }}
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={(e) => {
          // A lifted finger "leaves" too: keep a tapped readout until focus moves away.
          if (e.pointerType !== "touch") setHover(null);
        }}
        onPointerCancel={() => setHover(null)}
        onClick={onXClick ? (e) => onXClick(locate(e).x) : undefined}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      />
      <TooltipLayer tip={tip} width={width} height={height} />
    </>
  );
}
