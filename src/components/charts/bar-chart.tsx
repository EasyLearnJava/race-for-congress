"use client";

// Horizontal bars, one row per category: a single bar or a stacked bar per row. The label
// column is sized to the longest label (at most ~40% of the width) and long labels end in an
// ellipsis; the full text leads the tooltip and the row's accessible name. Optional values at
// the bar tips, a value axis and a labelled reference line (e.g. the majority at 218).
// Rows tile the plot, so one delegated pointer handler finds the row under the pointer by
// arithmetic: hundreds of marks stay smooth, and the static marks are memoized so tooltip
// moves only re-render the hover band. Rows with an href are links; with onRowClick, buttons.
// The height is derived from the row count: size ChartFrame with barChartHeight().
import Link from "next/link";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import { useMemo, useState, type ReactNode } from "react";

import { fmtCompact, fmtNum, fmtProb } from "@/lib/format";
import { RATING_COLOR, RATING_TEXT } from "@/lib/ratings";
import { RefLine, XAxis, barPath } from "./axes";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

/** One piece of a stacked row. */
export interface BarSegment {
  /** Stable key, unique within its row. */
  key: string;
  /** Category name, shown in the tooltip and the row's accessible name. */
  label: string;
  /** Size of the piece. null/NaN pieces are skipped; negative pieces stack left of zero (dropped when normalized). */
  value: number | null | undefined;
  /** Fill as a CSS token, e.g. RATING_COLOR["Lean D"] or "var(--dem)". */
  color: string;
  /**
   * Color of the value label drawn inside the piece when it fits with padding: white or ink,
   * picked by the fill's luminance (e.g. RATING_TEXT["Lean D"]). Rating fills get their
   * RATING_TEXT token automatically; any other fill without textColor gets no inside label.
   */
  textColor?: string;
}

/** One category row: give `value` for a single bar or `segments` for a stacked bar. */
export interface BarRow {
  /** Stable key, unique within the chart (passed to onRowClick, matched by highlightKey). */
  key: string;
  /** Category label in the left column; a label that does not fit ends in an ellipsis. */
  label: string;
  /** Secondary text in muted ink: beside the label, or under it when rowHeight >= 36. */
  sublabel?: string;
  /** Drill-down target: the whole row becomes a keyboard-reachable link. */
  href?: string;
  /** Single-bar value. null/NaN draws no bar (an em dash marks the gap). Negative values grow left of zero. */
  value?: number | null;
  /** Single-bar fill token (default var(--m-3)). */
  color?: string;
  /** Stacked pieces, drawn outward from the baseline in this order. Takes precedence over `value`. */
  segments?: readonly BarSegment[];
}

/** A labelled vertical reference line. */
export interface BarReference {
  /** Position in data units (a 0-1 share when `normalize` is on). */
  value: number;
  /** Text above the line, e.g. "218 for majority". Its band is reserved by barChartHeight(..., true). */
  label?: string;
}

export interface BarChartProps {
  /** Rows, drawn top to bottom in the order given. */
  rows: readonly BarRow[];
  /** Plot width from ChartFrame's render prop. */
  width: number;
  /** Row pitch in px (default 28). Bars are min(18, rowHeight - 8) thick; the rest of the row is air. */
  rowHeight?: number;
  /** Formats values for tooltips, value labels and (unless tickFormat is set) axis ticks. Default fmtNum. */
  format?: (value: number) => string;
  /** Axis tick formatter. Default: `format` when given, else fmtCompact. Ignored when normalized (ticks read in %). */
  tickFormat?: (value: number) => string;
  /** Domain maximum, e.g. 435 seats. Default: the largest row total, rounded out to a clean tick. Ignored when normalized. */
  max?: number;
  /** Stretch every row to 100% (each piece shows its share); the axis reads in percent. */
  normalize?: boolean;
  /** Value at the bar tip: single-value rows show their value, stacked rows their total (not when normalized). */
  showValues?: boolean;
  /** Value labels inside stacked pieces, only where they fit with padding (default true). */
  segmentLabels?: boolean;
  /** Emphasize one row: its label turns semibold and the other rows' bars recede. */
  highlightKey?: string | null;
  /** Called with the row key on click, Enter or Space. Rows without an href become role="button". */
  onRowClick?: (key: string) => void;
  /** Bottom value axis with vertical gridlines (default true). Pass the same flag to barChartHeight. */
  axis?: boolean;
  /** A labelled vertical reference line, e.g. { value: 218, label: "218 for majority" }. */
  referenceValue?: BarReference;
  /** Tooltip label for single values (default "Value"), e.g. "Seats" or "Raised". */
  valueLabel?: string;
  /** Hint at the foot of the tooltip on clickable rows (default "Click for details"). */
  clickHint?: string;
  /** Accessible name of the chart. Default: a generated summary of the rows. */
  ariaLabel?: string;
  /** Replaces the default tooltip body for a row. */
  tooltip?: (row: BarRow) => ReactNode;
}

const DEFAULT_ROW_HEIGHT = 28;
const MIN_ROW_HEIGHT = 12;
/** Tick labels under the last row. */
const AXIS_BAND = 20;
/** Reference-line label above the first row. */
const REF_BAND = 16;
const LABEL_X = 4;
const LABEL_GAP = 8;
const SUB_GAP = 6;
const VALUE_GAP = 4;
/** Surface gap between stacked pieces. */
const SEG_GAP = 2;
/** Padding each side of a label inside a piece. */
const SEG_PAD = 6;
/** Narrowest plot that still gets value labels at the tips. */
const MIN_PLOT = 40;
const DIM_OPACITY = 0.4;
const DEFAULT_COLOR = "var(--m-3)";
/** Focus is drawn as a ring around the whole row instead of the browser outline on the SVG node. */
const NO_OUTLINE = { outline: "none" } as const;

function rowPitch(rowHeight: number | undefined): number {
  return typeof rowHeight === "number" && Number.isFinite(rowHeight) ? Math.max(MIN_ROW_HEIGHT, rowHeight) : DEFAULT_ROW_HEIGHT;
}

/**
 * Height of a BarChart: rows x rowHeight, plus the axis band and, when the reference line has a
 * label, the label band on top. Give ChartFrame this height, with the same rowHeight and axis
 * flag as the chart. `rows` is the row array or its length.
 */
export function barChartHeight(rows: number | readonly unknown[], rowHeight = DEFAULT_ROW_HEIGHT, axis = true, referenceLabel = false): number {
  const n = typeof rows === "number" ? rows : rows.length;
  const count = Number.isFinite(n) ? Math.max(1, Math.floor(n)) : 1;
  return (referenceLabel ? REF_BAND : 0) + count * rowPitch(rowHeight) + (axis ? AXIS_BAND : 0);
}

// Advance widths of Inter (the UI face) for ASCII 32-126, in hundredths of an em, read from the
// font's metrics. Labels are sized from these rather than by measuring the DOM during render.
// Kerning is ignored, so estimates run slightly wide: the safe side for truncation.
const ADVANCE = [
  28, 29, 47, 63, 64, 98, 64, 30, 36, 36, 50, 66, 29, 46, 29, 36, 63, 41, 61, 62, 65, 59, 62, 57, 62, 62, 29, 30, 66, 66, 66, 51,
  97, 69, 65, 73, 72, 60, 59, 75, 74, 27, 57, 67, 57, 90, 75, 76, 64, 76, 64, 64, 65, 74, 69, 99, 68, 68, 63, 36, 36, 36, 47, 46,
  32, 56, 61, 57, 61, 58, 37, 61, 59, 24, 24, 55, 24, 88, 59, 60, 61, 61, 38, 53, 33, 59, 56, 82, 55, 56, 55, 43, 33, 43, 66,
];

function textWidth(text: string, size: number, weight = 400, tabular = false): number {
  let em = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (tabular && c >= 48 && c <= 57) em += 0.63;
    else if (c >= 32 && c <= 126) em += ADVANCE[c - 32] / 100;
    else if (c === 0x2026) em += 0.86; // ellipsis
    else if (c === 0x2014) em += 1; // em dash
    else em += 0.62;
  }
  return em * size * (weight >= 600 ? 1.03 : weight >= 500 ? 1.015 : 1);
}

/** The text, or its longest prefix plus an ellipsis that fits in maxW ("" if nothing does). */
function fitText(text: string, maxW: number, size: number, weight = 400): string {
  if (textWidth(text, size, weight) <= maxW) return text;
  const room = maxW - textWidth("…", size, weight);
  let used = 0;
  let end = 0;
  while (end < text.length) {
    const w = textWidth(text[end], size, weight);
    if (used + w > room) break;
    used += w;
    end++;
  }
  const head = text.slice(0, end).trimEnd();
  return head ? `${head}…` : "";
}

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v));
}

/** Two decimals keep path data short. */
function r2(v: number): number {
  return Math.round(v * 100) / 100;
}

/** A share of a row as a percentage, never claiming 0% or 100% for a non-empty or partial share. */
function pct(share: number): string {
  if (share <= 0) return "0%";
  if (share >= 1) return "100%";
  return fmtProb(share);
}

function pctTick(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/** Inside-label ink for the rating fills, so rating-colored pieces need no textColor. */
const RATING_INK = new Map<string, string>(
  (Object.keys(RATING_COLOR) as (keyof typeof RATING_COLOR)[]).map((k) => [RATING_COLOR[k], RATING_TEXT[k]]),
);

/** Mirror of barPath(..., "right") for bars growing left of the baseline: rounded at x, square at x + w. */
function leftBarPath(x: number, y: number, w: number, h: number, radius = 4): string {
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(radius, h / 2, w);
  return `M${x + w},${y}H${x + r}A${r},${r} 0 0 0 ${x},${y + r}V${y + h - r}A${r},${r} 0 0 0 ${x + r},${y + h}H${x + w}Z`;
}

function rectPath(x: number, y: number, w: number, h: number): string {
  return w > 0 && h > 0 ? `M${x},${y}H${x + w}V${y + h}H${x}Z` : "";
}

/** Keeps every other tick until neighbouring labels clear each other by 8px. */
function thinTicks(ticks: number[], scale: (v: number) => number, fmt: Fmt): number[] {
  const marks = ticks.map((v) => ({ v, x: scale(v), w: textWidth(fmt(v), 10, 400, true) }));
  for (let step = 1; step < Math.max(2, marks.length); step++) {
    const kept = marks.filter((_, i) => i % step === 0);
    if (kept.every((m, i) => i === 0 || m.x - kept[i - 1].x >= (m.w + kept[i - 1].w) / 2 + 8)) return kept.map((m) => m.v);
  }
  return marks.slice(0, 1).map((m) => m.v);
}

type Fmt = (value: number) => string;

interface CleanRow {
  row: BarRow;
  stacked: boolean;
  segs: (BarSegment & { value: number })[];
  /** Sum of positive values (single: max(0, value)). */
  pos: number;
  /** Sum of negative values (single: min(0, value)). */
  neg: number;
  value: number | null;
}

interface SegGeom {
  seg: BarSegment;
  value: number;
  /** Share of the row (normalized rows only). */
  share: number;
  /** Path, "" when the piece is too thin to draw. */
  d: string;
  x0: number;
  x1: number;
  /** Inside label, "" when none. */
  text: string;
  textColor: string;
  textX: number;
}

interface TipGeom {
  text: string;
  x: number;
  anchor: "start" | "end";
  muted: boolean;
}

interface RowGeom {
  row: BarRow;
  index: number;
  /** Top of the row band. */
  y: number;
  /** Vertical center of the row. */
  cy: number;
  /** Label and sublabel as drawn (possibly truncated). */
  label: string;
  sub: string;
  stacked: boolean;
  value: number | null;
  total: number;
  color: string;
  /** Single-bar path. */
  d: string;
  segs: SegGeom[];
  tip: TipGeom | null;
  /** Pixel x of the data end, where a keyboard-focus tooltip anchors. */
  end: number;
  aria: string;
  strong: boolean;
  dim: boolean;
}

interface Layout {
  width: number;
  height: number;
  rowHeight: number;
  top: number;
  rowsBottom: number;
  x0: number;
  x1: number;
  zx: number;
  scale: ScaleLinear<number, number>;
  ticks: number[];
  tickFmt: Fmt;
  axis: boolean;
  zeroLine: boolean;
  rows: RowGeom[];
  ref: { x: number; label: string; labelX: number; valueText: string } | null;
  hasData: boolean;
  hasHref: boolean;
  twoLine: boolean;
  labelSize: number;
  subSize: number;
  valueSize: number;
  segSize: number;
}

interface LayoutInput {
  rows: readonly BarRow[];
  width: number;
  rowHeight: number;
  format: Fmt;
  tickFormat: Fmt;
  max: number | undefined;
  normalize: boolean;
  showValues: boolean;
  segmentLabels: boolean;
  axis: boolean;
  reference: BarReference | undefined;
  highlightKey: string | null | undefined;
}

/** All geometry, computed once per data/size change. Pure: no DOM reads. */
function layoutBars(p: LayoutInput): Layout {
  const { rows, rowHeight, format, normalize } = p;
  const width = isNum(p.width) ? Math.max(0, p.width) : 0;
  const n = rows.length;
  const refLabel = p.reference?.label ?? "";
  const top = refLabel ? REF_BAND : 0;
  const height = barChartHeight(n, rowHeight, p.axis, refLabel !== "");
  const rowsBottom = top + n * rowHeight;
  const barH = Math.max(2, Math.min(18, rowHeight - 8));
  const labelSize = rowHeight >= 22 ? 12 : rowHeight >= 16 ? 11 : 10;
  const subSize = Math.min(11, labelSize);
  const valueSize = rowHeight >= 18 ? 11 : 10;
  const segSize = barH >= 16 ? 11 : 10;
  const twoLine = rowHeight >= 36 && rows.some((r) => r.sublabel);
  const strongKey = p.highlightKey != null && rows.some((r) => r.key === p.highlightKey) ? p.highlightKey : null;

  // 1. Clean values: null/NaN skipped, negatives dropped when normalizing.
  const clean: CleanRow[] = rows.map((row) => {
    if (row.segments && row.segments.length > 0) {
      const segs = row.segments.filter((s): s is BarSegment & { value: number } => isNum(s.value) && (!normalize || s.value >= 0));
      let pos = 0;
      let neg = 0;
      for (const s of segs) {
        if (s.value > 0) pos += s.value;
        else neg += s.value;
      }
      return { row, stacked: true, segs, pos, neg, value: null };
    }
    const value = isNum(row.value) ? row.value : null;
    return { row, stacked: false, segs: [], pos: Math.max(0, value ?? 0), neg: Math.min(0, value ?? 0), value };
  });
  const hasData = clean.some((c) => (c.stacked ? c.segs.length > 0 : c.value != null));

  // 2. Domain: zero is always in it; the reference line widens it unless `max` is explicit.
  let lo = 0;
  let hi = 1;
  if (!normalize) {
    hi = 0;
    for (const c of clean) {
      lo = Math.min(lo, c.neg);
      hi = Math.max(hi, c.pos);
    }
    const rv = p.reference?.value;
    if (isNum(p.max) && p.max > lo) hi = p.max;
    else if (isNum(rv)) {
      lo = Math.min(lo, rv);
      hi = Math.max(hi, rv);
    }
    if (hi <= lo) hi = lo + 1;
  }

  // 3. Label column: the longest label (with an inline sublabel), at most 40% of the width.
  let need = 0;
  for (const r of rows) {
    const lw = textWidth(r.label, labelSize, r.key === strongKey ? 600 : 400);
    const sw = r.sublabel ? textWidth(r.sublabel, subSize) : 0;
    need = Math.max(need, twoLine ? Math.max(lw, sw) : lw + (sw ? SUB_GAP + sw : 0));
  }
  const colW = Math.min(Math.ceil(need), Math.floor(width * 0.4));
  const plotStart = colW > 0 ? LABEL_X + colW + LABEL_GAP : 0;

  // 4. Values at the bar tips reserve room on the side the bars grow toward.
  const tipText = (c: CleanRow): string => {
    if (c.stacked) return normalize || c.segs.length === 0 ? "" : format(c.pos + c.neg);
    return c.value == null ? "" : format(c.value);
  };
  let showTips = p.showValues;
  let padL = 0;
  let padR = 0;
  if (showTips) {
    for (const c of clean) {
      const t = tipText(c);
      if (!t) continue;
      const w = textWidth(t, valueSize, 500, true) + VALUE_GAP + 2;
      if (c.pos > 0 || c.neg === 0) padR = Math.max(padR, w);
      else padL = Math.max(padL, w);
    }
    if (width - plotStart - padL - padR < MIN_PLOT) {
      showTips = false;
      padL = 0;
      padR = 0;
    }
  }
  let x0 = plotStart + padL;
  let x1 = width - padR;

  // 5. Scale and ticks (rounded, thinned until their labels clear each other).
  const tickFmt = normalize ? pctTick : p.tickFormat;
  const scale = scaleLinear().domain([lo, hi]).clamp(true);
  let ticks: number[] = [];
  const axis = p.axis && hasData;
  if (axis) {
    const approx = Math.max(1, x1 - x0);
    if (normalize) ticks = approx >= 200 ? [0, 0.25, 0.5, 0.75, 1] : approx >= 80 ? [0, 0.5, 1] : [0, 1];
    else {
      const sample = Math.max(textWidth(tickFmt(lo), 10, 400, true), textWidth(tickFmt(hi), 10, 400, true));
      const count = Math.max(2, Math.min(8, Math.floor(approx / (sample + 28))));
      if (!isNum(p.max)) scale.nice(count);
      ticks = scale.ticks(count);
    }
    if (ticks.length > 0) {
      // Keep the end tick labels inside the SVG.
      x0 = Math.max(x0, textWidth(tickFmt(ticks[0]), 10, 400, true) / 2 + 1);
      x1 = Math.min(x1, width - textWidth(tickFmt(ticks[ticks.length - 1]), 10, 400, true) / 2 - 1);
    }
  }
  x0 = Math.round(x0);
  x1 = Math.round(Math.max(x0 + 1, x1));
  scale.range([x0, x1]);
  if (axis) ticks = thinTicks(ticks, scale, tickFmt);
  const zx = scale(0);

  // 6. Rows.
  const geoms: RowGeom[] = clean.map((c, i) => {
    const row = c.row;
    const y = top + i * rowHeight;
    const cy = y + rowHeight / 2;
    const by = Math.round(cy - barH / 2);
    const strong = row.key === strongKey;
    const weight = strong ? 600 : 400;

    const label = colW > 0 ? fitText(row.label, colW, labelSize, weight) : "";
    let sub = "";
    if (row.sublabel && colW > 0) {
      if (twoLine) sub = fitText(row.sublabel, colW, subSize);
      else if (label === row.label) {
        const room = colW - textWidth(label, labelSize, weight) - SUB_GAP;
        const fitted = room > 0 ? fitText(row.sublabel, room, subSize) : "";
        sub = fitted === row.sublabel || room >= 28 ? fitted : "";
      }
    }

    const color = row.color ?? DEFAULT_COLOR;
    let d = "";
    let end = zx;
    let tip: TipGeom | null = null;
    const segs: SegGeom[] = [];

    if (!c.stacked) {
      if (c.value != null) {
        const v = normalize ? (c.value > 0 ? 1 : 0) : c.value;
        const vx = r2(scale(v));
        d = vx >= zx ? barPath(zx, by, vx - zx, barH, "right") : leftBarPath(vx, by, zx - vx, barH);
        end = vx;
        if (showTips) {
          tip = { text: format(c.value), x: v >= 0 ? vx + VALUE_GAP : vx - VALUE_GAP, anchor: v >= 0 ? "start" : "end", muted: false };
        }
      } else {
        tip = { text: "—", x: zx + VALUE_GAP, anchor: "start", muted: true };
      }
    } else if (c.segs.length === 0) {
      tip = { text: "—", x: zx + VALUE_GAP, anchor: "start", muted: true };
    } else {
      // Positive pieces stack right of zero and negative ones left, each in the given order.
      const denom = normalize ? c.pos : 1;
      let pc = 0;
      let nc = 0;
      const raw = c.segs.map((s) => {
        const v = denom > 0 ? s.value / denom : 0;
        const a = v >= 0 ? pc : nc;
        if (v >= 0) pc += v;
        else nc += v;
        const b = v >= 0 ? pc : nc;
        const xa = r2(scale(a));
        const xb = r2(scale(b));
        return { side: v >= 0 ? 1 : -1, share: v, lo: Math.min(xa, xb), hi: Math.max(xa, xb) };
      });
      for (let j = 0; j < c.segs.length; j++) {
        segs.push({ seg: c.segs[j], value: c.segs[j].value, share: raw[j].share, d: "", x0: NaN, x1: NaN, text: "", textColor: "", textX: 0 });
      }
      for (const side of [1, -1]) {
        // Pieces at least 1px wide get drawn; a 2px gap is carved at each boundary between them,
        // and only the outermost piece gets the rounded data end.
        const visible: number[] = [];
        raw.forEach((r, j) => {
          if (r.side === side && r.hi - r.lo >= 1) visible.push(j);
        });
        visible.forEach((j, k) => {
          const inner = k > 0;
          const outer = k === visible.length - 1;
          let a = raw[j].lo;
          let b = raw[j].hi;
          if (side > 0) {
            if (inner) a += SEG_GAP / 2;
            if (!outer) b -= SEG_GAP / 2;
          } else {
            if (inner) b -= SEG_GAP / 2;
            if (!outer) a += SEG_GAP / 2;
          }
          const w = b - a;
          if (w < 0.5) return;
          const g = segs[j];
          g.x0 = a;
          g.x1 = b;
          g.d = !outer ? rectPath(a, by, w, barH) : side > 0 ? barPath(a, by, w, barH, "right") : leftBarPath(a, by, w, barH);
          if (p.segmentLabels && barH >= 12) {
            const ink = g.seg.textColor ?? RATING_INK.get(g.seg.color);
            const text = normalize ? pct(g.share) : format(g.value);
            if (ink && textWidth(text, segSize, 600, true) + 2 * SEG_PAD <= w) {
              g.text = text;
              g.textColor = ink;
              g.textX = r2(a + w / 2);
            }
          }
        });
      }
      end = c.pos > 0 ? scale(normalize ? 1 : c.pos) : scale(c.neg);
      if (showTips && !normalize) {
        const text = format(c.pos + c.neg);
        tip =
          c.pos > 0
            ? { text, x: scale(c.pos) + VALUE_GAP, anchor: "start", muted: false }
            : c.neg < 0
              ? { text, x: scale(c.neg) - VALUE_GAP, anchor: "end", muted: false }
              : { text, x: zx + VALUE_GAP, anchor: "start", muted: false };
      }
    }

    const head = row.sublabel ? `${row.label} (${row.sublabel})` : row.label;
    let aria: string;
    if (!c.stacked) aria = `${head}: ${c.value == null ? "no data" : format(c.value)}`;
    else if (segs.length === 0) aria = `${head}: no data`;
    else {
      const parts = segs.map((s) => `${s.seg.label} ${normalize ? pct(s.share) : format(s.value)}`).join(", ");
      aria = `${head}: ${parts}${!normalize && segs.length > 1 ? `, total ${format(c.pos + c.neg)}` : ""}`;
    }

    return {
      row,
      index: i,
      y,
      cy,
      label,
      sub,
      stacked: c.stacked,
      value: c.value,
      total: c.pos + c.neg,
      color,
      d,
      segs,
      tip,
      end,
      aria,
      strong,
      dim: strongKey != null && !strong,
    };
  });

  // 7. Reference line, when it falls inside the domain.
  let ref: Layout["ref"] = null;
  const rv = p.reference?.value;
  if (hasData && isNum(rv)) {
    const [d0, d1] = scale.domain();
    if (rv >= d0 && rv <= d1) {
      const x = scale(rv);
      const lw = refLabel ? textWidth(refLabel, 10, 600) : 0;
      ref = { x, label: refLabel, labelX: clamp(x, lw / 2 + 1, width - lw / 2 - 1), valueText: normalize ? pct(rv) : format(rv) };
    }
  }

  return {
    width,
    height,
    rowHeight,
    top,
    rowsBottom,
    x0,
    x1,
    zx,
    scale,
    ticks,
    tickFmt,
    axis,
    zeroLine: hasData && (p.axis || lo < 0),
    rows: geoms,
    ref,
    hasData,
    hasHref: rows.some((r) => Boolean(r.href)),
    twoLine,
    labelSize,
    subSize,
    valueSize,
    segSize,
  };
}

/** Index of the stacked piece under pointer x (its 2px gap included), or null. */
function segmentAt(g: RowGeom, x: number): number | null {
  for (let j = 0; j < g.segs.length; j++) {
    const s = g.segs[j];
    if (s.d && x >= s.x0 - SEG_GAP / 2 && x <= s.x1 + SEG_GAP / 2) return j;
  }
  return null;
}

/** Row index from the nearest element carrying data-row (focus, click and key events). */
function rowIndexOf(target: EventTarget | null): number | null {
  const el = target instanceof Element ? target.closest("[data-row]") : null;
  const i = el ? Number(el.getAttribute("data-row")) : NaN;
  return Number.isInteger(i) ? i : null;
}

function isFocusVisible(target: EventTarget): boolean {
  try {
    return target instanceof Element ? target.matches(":focus-visible") : false;
  } catch {
    return true;
  }
}

function summarize(L: Layout, listRows: boolean): string {
  const n = L.rows.length;
  let s = `Bar chart, ${n} ${n === 1 ? "row" : "rows"}.`;
  if (listRows) s += ` ${L.rows.slice(0, 8).map((g) => g.aria).join("; ")}${n > 8 ? `; and ${n - 8} more` : ""}.`;
  if (L.ref) s += ` Reference line at ${L.ref.valueText}${L.ref.label ? ` (${L.ref.label})` : ""}.`;
  return s;
}

function renderRow(L: Layout, g: RowGeom, clickable: boolean, interactive: boolean): ReactNode {
  const r = g.row;
  const labelY = L.twoLine && g.sub ? g.cy - 7 : g.cy;
  const body = (
    <>
      {/* The whole row band is the hit target (and the link/button area). */}
      <rect x={0} y={g.y} width={L.width} height={L.rowHeight} fill="transparent" />
      <g opacity={g.dim ? DIM_OPACITY : undefined}>
        {g.d && <path d={g.d} fill={g.color} className="hover:opacity-80" />}
        {g.segs.map((s) => (s.d ? <path key={s.seg.key} d={s.d} fill={s.seg.color} className="hover:opacity-80" /> : null))}
        {g.segs.map((s) =>
          s.text ? (
            <text
              key={`t:${s.seg.key}`}
              x={s.textX}
              y={g.cy}
              dy="0.32em"
              textAnchor="middle"
              fontSize={L.segSize}
              fontWeight={600}
              fill={s.textColor}
              className="tabular-nums"
              pointerEvents="none"
            >
              {s.text}
            </text>
          ) : null,
        )}
      </g>
      {g.label && (
        <text
          x={LABEL_X}
          y={labelY}
          dy="0.32em"
          fontSize={L.labelSize}
          fontWeight={g.strong ? 600 : 400}
          fill={g.dim ? "var(--ink-2)" : "var(--ink)"}
          pointerEvents="none"
        >
          {g.label}
          {!L.twoLine && g.sub && (
            <tspan dx={SUB_GAP} fontSize={L.subSize} fontWeight={400} fill="var(--muted)">
              {g.sub}
            </tspan>
          )}
        </text>
      )}
      {L.twoLine && g.sub && (
        <text x={LABEL_X} y={g.cy + 8} dy="0.32em" fontSize={L.subSize} fill="var(--muted)" pointerEvents="none">
          {g.sub}
        </text>
      )}
      {g.tip && (
        <text
          x={g.tip.x}
          y={g.cy}
          dy="0.32em"
          textAnchor={g.tip.anchor}
          fontSize={L.valueSize}
          fontWeight={g.tip.muted ? 400 : g.strong ? 600 : 500}
          fill={g.tip.muted ? "var(--muted)" : g.strong ? "var(--ink)" : "var(--ink-2)"}
          className="tabular-nums"
          pointerEvents="none"
        >
          {g.tip.text}
        </text>
      )}
    </>
  );
  if (r.href) {
    return (
      <Link key={r.key} href={r.href} aria-label={g.aria} data-row={g.index} className="cursor-pointer" style={NO_OUTLINE}>
        {body}
      </Link>
    );
  }
  if (clickable) {
    return (
      <g key={r.key} role="button" tabIndex={0} aria-label={g.aria} data-row={g.index} className="cursor-pointer" style={NO_OUTLINE}>
        {body}
      </g>
    );
  }
  return (
    <g key={r.key} data-row={g.index} role={interactive ? "img" : undefined} aria-label={interactive ? g.aria : undefined}>
      {body}
    </g>
  );
}

/** Everything that does not change on hover: grid and axis, rows, reference line. */
function renderMarks(L: Layout, clickable: boolean, interactive: boolean): ReactNode {
  return (
    <>
      {L.axis && (
        <g aria-hidden="true">
          <XAxis scale={L.scale} ticks={L.ticks} y={L.rowsBottom} x0={L.x0} x1={L.x1} format={L.tickFmt} grid gridTop={L.top} />
        </g>
      )}
      {L.zeroLine && (
        <line
          x1={Math.round(L.zx) - 0.5}
          x2={Math.round(L.zx) - 0.5}
          y1={L.top}
          y2={L.rowsBottom}
          stroke="var(--axis)"
          strokeWidth={1}
          aria-hidden="true"
        />
      )}
      {L.rows.map((g) => renderRow(L, g, clickable, interactive))}
      {L.ref && (
        <g aria-hidden="true" pointerEvents="none">
          <RefLine x={L.ref.x} y0={Math.max(0, L.top - 2)} y1={L.rowsBottom} strong />
          {L.ref.label && (
            <text x={L.ref.labelX} y={L.top - 5} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--ink)">
              {L.ref.label}
            </text>
          )}
        </g>
      )}
    </>
  );
}

/**
 * Horizontal bar chart, one row per category (single or stacked bars). Render it inside
 * ChartFrame's render prop and give the frame barChartHeight(rows, rowHeight, axis, hasRefLabel).
 */
export function BarChart({
  rows,
  width,
  rowHeight,
  format: formatProp,
  tickFormat,
  max,
  normalize = false,
  showValues = false,
  segmentLabels = true,
  highlightKey,
  onRowClick,
  axis = true,
  referenceValue,
  valueLabel = "Value",
  clickHint = "Click for details",
  ariaLabel,
  tooltip,
}: BarChartProps) {
  const pitch = rowPitch(rowHeight);
  const format = formatProp ?? fmtNum;
  const tickFmt = tickFormat ?? formatProp ?? fmtCompact;
  const layout = useMemo(
    () =>
      layoutBars({
        rows,
        width,
        rowHeight: pitch,
        format,
        tickFormat: tickFmt,
        max,
        normalize,
        showValues,
        segmentLabels,
        axis,
        reference: referenceValue,
        highlightKey,
      }),
    [rows, width, pitch, format, tickFmt, max, normalize, showValues, segmentLabels, axis, referenceValue, highlightKey],
  );
  const clickable = onRowClick != null;
  const interactive = clickable || layout.hasHref;
  const marks = useMemo(() => renderMarks(layout, clickable, interactive), [layout, clickable, interactive]);

  const { tip, show, hide } = useTooltip();
  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);

  const tipContent = (g: RowGeom, seg: number | null): ReactNode => {
    if (tooltip) return tooltip(g.row);
    const r = g.row;
    return (
      <>
        <TipTitle>{r.label}</TipTitle>
        {r.sublabel && <div className="-mt-1 mb-1 text-[11px] text-ink-2">{r.sublabel}</div>}
        {!g.stacked ? (
          <TipRow color={g.color} label={valueLabel} value={g.value == null ? "—" : format(g.value)} />
        ) : g.segs.length === 0 ? (
          <div className="text-muted">No data</div>
        ) : (
          <>
            {g.segs.map((s, j) => (
              <TipRow
                key={s.seg.key}
                color={s.seg.color}
                label={j === seg ? <span className="font-medium text-ink">{s.seg.label}</span> : s.seg.label}
                value={
                  normalize ? (
                    <>
                      {pct(s.share)}
                      <span className="ml-1.5 font-normal text-muted">{format(s.value)}</span>
                    </>
                  ) : (
                    format(s.value)
                  )
                }
              />
            ))}
            {!normalize && g.segs.length > 1 && (
              <div className="mt-1 border-t border-line pt-1">
                <TipRow label="Total" value={format(g.total)} />
              </div>
            )}
          </>
        )}
        {(r.href || clickable) && <div className="mt-1 text-[11px] text-muted">{clickHint}</div>}
      </>
    );
  };

  // One delegated handler: rows tile the plot, so the row is (y - top) / rowHeight.
  const onPointer = (e: React.PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const i = Math.floor((y - layout.top) / layout.rowHeight);
    const g = y >= layout.top && i >= 0 && i < layout.rows.length ? layout.rows[i] : undefined;
    if (!g) {
      setHoverRow(null);
      hide();
      return;
    }
    setHoverRow(i);
    show(x, y, tipContent(g, segmentAt(g, x)));
  };
  const onPointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    // A tap keeps its tooltip until the next tap; mouse and pen clear on leave.
    if (e.pointerType === "touch") return;
    setHoverRow(null);
    hide();
  };
  const onFocus = (e: React.FocusEvent<SVGSVGElement>) => {
    const i = rowIndexOf(e.target);
    const g = i == null ? undefined : layout.rows[i];
    if (!g || !isFocusVisible(e.target)) return;
    setFocusRow(g.index);
    show(clamp(g.end, layout.x0, layout.width - 4), g.cy, tipContent(g, null));
  };
  const onBlur = () => {
    if (focusRow == null) return;
    setFocusRow(null);
    hide();
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!onRowClick) return;
    const i = rowIndexOf(e.target);
    const g = i == null ? undefined : layout.rows[i];
    if (g) onRowClick(g.row.key);
  };
  const onKeyDown = (e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Escape") {
      setHoverRow(null);
      hide();
      return;
    }
    if (!onRowClick || (e.key !== "Enter" && e.key !== " ")) return;
    // Links activate natively (and reach onRowClick through onClick); buttons need the keys.
    const el = e.target instanceof Element ? e.target.closest("[data-row]") : null;
    if (!el || el.getAttribute("role") !== "button") return;
    e.preventDefault();
    const g = layout.rows[Number(el.getAttribute("data-row"))];
    if (g) onRowClick(g.row.key);
  };

  if (!layout.hasData) {
    return (
      <svg width={layout.width} height={layout.height} role="img" aria-label={ariaLabel ? `${ariaLabel}: no data` : "No data"} className="block">
        <text x={layout.width / 2} y={layout.height / 2} dy="0.32em" textAnchor="middle" fontSize={12} fill="var(--muted)">
          No data
        </text>
      </svg>
    );
  }

  const bandIndex = hoverRow ?? focusRow;
  const band = bandIndex == null ? undefined : layout.rows[bandIndex];
  const ring = focusRow == null ? undefined : layout.rows[focusRow];

  return (
    <>
      <svg
        width={layout.width}
        height={layout.height}
        // Focusable rows cannot live inside role="img" (its children are presentational).
        role={interactive ? "group" : "img"}
        aria-label={ariaLabel ?? summarize(layout, !interactive)}
        className="block"
        onPointerMove={onPointer}
        onPointerDown={onPointer}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {band && <rect x={0} y={band.y} width={layout.width} height={layout.rowHeight} rx={4} fill="var(--surface-2)" pointerEvents="none" />}
        {marks}
        {ring && (
          <rect
            x={1}
            y={ring.y + 1}
            width={Math.max(0, layout.width - 2)}
            height={Math.max(0, layout.rowHeight - 2)}
            rx={4}
            fill="none"
            stroke="var(--focus)"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
      </svg>
      <TooltipLayer tip={tip} width={layout.width} height={layout.height} />
    </>
  );
}
