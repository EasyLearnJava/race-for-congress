"use client";

// Dot strip: one row per item, several dots on one shared horizontal scale (each forecaster's
// rating for a race, or the races of a group placed by margin). A row can add a reference
// marker (consensus, model) as an ink tick and a min-max range hairline; light background
// zones (rating bands) sit behind every row. One delegated pointer handler does a nearest-dot
// search inside the hovered row, so hundreds of dots stay smooth. Rows with an href are links
// and rows handled by onRowClick are buttons: both are keyboard reachable and show the row's
// summary tooltip on focus. The chart never measures itself: the width comes from ChartFrame's
// render prop and the height from dotStripHeight(rows, rowHeight).
import Link from "next/link";
import { scaleLinear, type ScaleLinear } from "d3-scale";
import {
  useMemo,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { fmtCompact } from "@/lib/format";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

/** One dot: a single value on the row's scale. */
export interface DotStripDot {
  /** Unique within its row. */
  key: string;
  /** Position on the shared scale. null, undefined, NaN and ±Infinity are skipped. */
  value: number | null | undefined;
  /** Fill as a CSS color token, e.g. RATING_COLOR["Lean D"], "var(--dem)" or "var(--m-3)". */
  color: string;
  /** What the dot stands for (a forecaster, a race). Shown in the tooltip. */
  label: string;
}

/** A reference value drawn as a vertical ink tick across its row (consensus, model). */
export interface DotStripMarker {
  /** null, undefined and NaN hide the marker. */
  value: number | null | undefined;
  /** Name for tooltips and screen readers, e.g. "Consensus". */
  label: string;
}

/** One row of the strip. */
export interface DotStripRow {
  /** Unique across rows. */
  key: string;
  /** Label in the left gutter, truncated to fit (tooltips and screen readers get it in full). */
  label: string;
  /** Secondary label in a second gutter column; dropped when the chart is narrow. */
  sublabel?: string;
  /** Makes the whole row a link: the label, the plot band and the dots all click through. */
  href?: string;
  /** The row's dots, drawn in this order (later dots on top). */
  dots: readonly DotStripDot[];
  /** Optional reference tick, drawn above the dots. */
  marker?: DotStripMarker | null;
  /** Draw a hairline from the lowest to the highest dot. */
  range?: boolean;
}

/** An axis tick with its own label, e.g. { value: -3, label: "Safe R" }. */
export interface DotStripTick {
  /** Position on the scale; ticks outside the domain are ignored. */
  value: number;
  /** Tick text; labels that would collide are thinned (the gridline stays). */
  label: string;
}

/** A background zone between two values, filled at 10% opacity behind every row. */
export interface DotStripBand {
  /** One end of the zone (either order); clipped to the domain. */
  from: number;
  /** The other end of the zone. */
  to: number;
  /** CSS color token, e.g. RATING_COLOR.Tossup. */
  color: string;
}

export interface DotStripProps {
  /** Width in px, from ChartFrame's render prop. The height follows from the rows: dotStripHeight(rows, rowHeight). */
  width: number;
  /** One row per item, drawn top to bottom in this order. */
  rows: readonly DotStripRow[];
  /**
   * Scale extent [left edge, right edge]. Pass a descending pair (e.g. [3, -3]) to put higher
   * values on the left (Democrats-left convention). Values outside are drawn at the nearest edge;
   * tooltips keep the true value.
   */
  domain: readonly [number, number];
  /** Labelled axis ticks. Default: round ticks about 70px apart, labelled with tickFormat. Ticks outside the domain are ignored. */
  ticks?: readonly DotStripTick[];
  /** Row height in px. Default 26, minimum 14; keep it >= 24 when rows are clickable (touch targets). */
  rowHeight?: number;
  /** Formats a value for tooltips and screen-reader text, e.g. fmtMargin or a score-to-rating mapper. Default: a plain number. */
  format?: (value: number) => string;
  /** Formats generated tick labels. Default: format. Ignored when `ticks` is given. */
  tickFormat?: (value: number) => string;
  /** Formats the max - min spread in the row tooltip. Default: a plain number. */
  formatSpread?: (spread: number) => string;
  /** Offset dots that share a position vertically by a few px so every dot stays visible. Default false. */
  stackOverlaps?: boolean;
  /** Put the axis above the rows instead of below (useful for long lists). Default false. */
  axisTop?: boolean;
  /**
   * Called when a row is clicked or activated with Enter/Space. Rows without an href become
   * buttons; rows with an href stay links (navigation still happens) and also call it.
   */
  onRowClick?: (row: DotStripRow) => void;
  /** Background zones, e.g. the rating bands of a -3..3 score scale. */
  bands?: readonly DotStripBand[];
  /** Accessible name for the whole chart. Default: a generated summary. */
  ariaLabel?: string;
}

const ROW_HEIGHT = 26;
const MIN_ROW_HEIGHT = 14;
/** Free space beyond the outermost row, so hover outlines are never clipped. */
const EDGE = 6;
/** Axis band: the axis hairline plus one line of tick labels. */
const AXIS = 22;
/** Height of the "No data" state when there are no rows at all. */
const EMPTY_HEIGHT = 56;
/** Dot: an 8px fill (r = 4) wrapped in a 2px surface ring, 12px across in all. */
const DOT_R = 4;
const RING = 2;
const DOT_OUTER = DOT_R + RING;
/** Largest vertical step between stacked dots that share a position. */
const STACK_STEP = 4;
/** Dots whose centers are closer than this (px) share a position: stacked and listed together. */
const SAME_PX = 1;
/** Pointer distance (px) that reaches a dot or the marker: a 24px target. */
const HIT = 12;
/** Side padding so edge dots and their hover outline are never clipped. */
const PAD_X = 10;
const GUTTER_GAP = 12;
const SUB_GAP = 8;
const LABEL_SIZE = 11;
const SUB_SIZE = 10;
const TICK_SIZE = 10;
/** Most dots listed in one tooltip before "+N more". */
const TIP_MAX = 10;
/** Focusable rows draw their own focus ring (a native outline on SVG content is unreliable). */
const NO_OUTLINE = { outline: "none" } as const;
/** The hover tint and focus ring reach this far past the row's ends, into ChartFrame's padding. */
const ROW_BLEED = 4;

/**
 * Height in px of a DotStrip, for ChartFrame's `height`: pass the same rows (or their count) and
 * rowHeight as the chart. Equals the svg height DotStrip renders, the "No data" state included.
 */
export function dotStripHeight(rows: readonly DotStripRow[] | number, rowHeight?: number): number {
  const n = typeof rows === "number" ? (Number.isFinite(rows) ? Math.max(0, Math.floor(rows)) : 0) : rows.length;
  return n === 0 ? EMPTY_HEIGHT : EDGE + n * cleanRowHeight(rowHeight) + AXIS;
}

/** A strip of dots per row on one shared horizontal scale, with optional marker, range and zones. */
export function DotStrip({
  width,
  rows,
  domain,
  ticks,
  rowHeight,
  format = plain,
  tickFormat,
  formatSpread = plain,
  stackOverlaps = false,
  axisTop = false,
  onRowClick,
  bands,
  ariaLabel,
}: DotStripProps) {
  const { tip, show, hide } = useTooltip();
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [focusRow, setFocusRow] = useState<number | null>(null);

  const rh = cleanRowHeight(rowHeight);
  const [d0, d1] = domain;
  const clickable = onRowClick != null;
  const tickFmt = tickFormat ?? format;
  const layout = useMemo(
    () =>
      computeLayout({ width, rows, d0, d1, ticks, rowHeight: rh, format, tickFormat: tickFmt, stack: stackOverlaps, axisTop, clickable }),
    [width, rows, d0, d1, ticks, rh, format, tickFmt, stackOverlaps, axisTop, clickable],
  );
  // The marks never change on hover, so pointer moves re-render only the overlay and tooltip.
  const layers = useMemo(() => drawStatic(layout, bands), [layout, bands]);

  if (!layout.hasData) {
    return (
      <svg width={layout.width} height={layout.height} role="img" aria-label={ariaLabel ?? "No data"} className="block">
        <text x={layout.width / 2} y={layout.height / 2} dy="0.32em" textAnchor="middle" fill="var(--muted)" className="text-xs">
          No data
        </text>
      </svg>
    );
  }

  const clear = () => {
    setHover(null);
    hide();
  };

  const tipFor = (t: HoverTarget): ReactNode => {
    const r = layout.rows[t.row];
    if (!r) return null;
    if (t.kind === "dot") {
      const g = r.groups[t.group];
      return g ? <DotTip r={r} group={g} format={format} /> : null;
    }
    if (t.kind === "marker") return <MarkerTip r={r} format={format} />;
    return <RowTip r={r} format={format} formatSpread={formatSpread} descending={layout.descending} />;
  };

  const track = (e: PointerEvent<SVGSVGElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - box.left;
    const py = e.clientY - box.top;
    const t = hitTest(layout, px, py);
    if (!t) {
      clear();
      return;
    }
    setHover((prev) => (sameTarget(prev, t) ? prev : t));
    show(px, py, tipFor(t));
  };

  /** The row element (link, button or group) an event came from. */
  const rowAt = (target: EventTarget | null): { el: Element; index: number } | null => {
    const el = target instanceof Element ? target.closest("[data-row]") : null;
    if (!el) return null;
    const index = Number(el.getAttribute("data-row"));
    return layout.rows[index] ? { el, index } : null;
  };

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const hit = rowAt(e.target);
    if (!hit || !onRowClick) return;
    const r = layout.rows[hit.index];
    if (r.kind !== "static") onRowClick(r.row);
  };

  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Escape") {
      clear();
      return;
    }
    if ((e.key !== "Enter" && e.key !== " ") || e.repeat) return;
    const hit = rowAt(e.target);
    // Links activate natively (and reach onClick); only role="button" rows need the key handled.
    if (!hit || layout.rows[hit.index].kind !== "button") return;
    e.preventDefault();
    onRowClick?.(layout.rows[hit.index].row);
  };

  const onFocus = (e: FocusEvent<SVGSVGElement>) => {
    const hit = rowAt(e.target);
    if (!hit) return;
    let keyboard = true;
    try {
      keyboard = hit.el.matches(":focus-visible");
    } catch {
      // No :focus-visible support: treat every focus as keyboard focus.
    }
    if (!keyboard) return;
    const r = layout.rows[hit.index];
    const t: HoverTarget = { kind: "row", row: hit.index };
    setFocusRow(hit.index);
    setHover(t);
    show(Math.min(layout.x0, Math.max(0, layout.width - 40)), r.top + layout.rowHeight - 6, tipFor(t));
  };

  const onBlur = () => {
    setFocusRow(null);
    clear();
  };

  const hovered = hover ? layout.rows[hover.row] : undefined;
  const rowTint = hovered ? (
    <rect
      x={-ROW_BLEED}
      y={hovered.top}
      width={layout.width + 2 * ROW_BLEED}
      height={layout.rowHeight}
      fill="var(--ink)"
      fillOpacity={0.05}
      pointerEvents="none"
      aria-hidden="true"
    />
  ) : null;

  let highlight: ReactNode = null;
  if (hovered && hover?.kind === "dot") {
    const g = hovered.groups[hover.group];
    if (g) highlight = <GroupHighlight group={g} />;
  } else if (hovered && hover?.kind === "marker" && hovered.markerX != null) {
    highlight = (
      <g pointerEvents="none" aria-hidden="true">
        <MarkerTick x={hovered.markerX} cy={hovered.cy} rowHeight={layout.rowHeight} strong />
      </g>
    );
  }

  const focused = focusRow != null ? layout.rows[focusRow] : undefined;
  const focusRing = focused ? (
    <rect
      x={-ROW_BLEED}
      y={focused.top + 1}
      width={layout.width + 2 * ROW_BLEED}
      height={layout.rowHeight - 2}
      rx={6}
      fill="none"
      stroke="var(--focus)"
      strokeWidth={2}
      pointerEvents="none"
      aria-hidden="true"
    />
  ) : null;

  return (
    <>
      <svg
        width={layout.width}
        height={layout.height}
        role={layout.interactive ? "group" : "img"}
        aria-label={ariaLabel ?? layout.summary}
        className="block overflow-visible touch-pan-y touch-pinch-zoom"
        onPointerMove={track}
        onPointerDown={track}
        onPointerLeave={(e) => {
          // A lifted finger also "leaves": keep a tapped tooltip until the next touch.
          if (e.pointerType !== "touch") clear();
        }}
        onPointerCancel={clear}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        {layers.zones}
        {rowTint}
        {layers.grid}
        {layers.rows}
        {layers.marks}
        {highlight}
        {focusRing}
      </svg>
      <TooltipLayer tip={tip} width={layout.width} height={layout.height} />
    </>
  );
}

// ---------------------------------------------------------------------------------------------
// Layout

type HoverTarget = { kind: "row" | "marker"; row: number } | { kind: "dot"; row: number; group: number };

interface Placed {
  dot: DotStripDot;
  value: number;
  x: number;
  y: number;
}

interface Group {
  /** Mean x of the members. */
  x: number;
  /** Members in stack order (top to bottom), which is their input order. */
  dots: Placed[];
}

interface RowLayout {
  row: DotStripRow;
  index: number;
  key: string;
  top: number;
  cy: number;
  href: string | null;
  kind: "link" | "button" | "static";
  /** Gutter texts, already truncated to fit ("" when hidden). */
  label: string;
  sublabel: string;
  /** Valid dots in drawing (input) order. */
  dots: Placed[];
  /** Dots sharing a position, left to right. */
  groups: Group[];
  /** Extremes of the valid dots (Infinity / -Infinity when there are none). */
  min: number;
  max: number;
  markerValue: number | null;
  markerX: number | null;
  markerLabel: string;
  /** Screen-reader summary of the row. */
  summary: string;
}

interface TickLayout {
  value: number;
  x: number;
  label: string;
  show: boolean;
}

interface Layout {
  width: number;
  height: number;
  rowHeight: number;
  x0: number;
  x1: number;
  subX: number;
  plotTop: number;
  plotBottom: number;
  axisY: number;
  axisTop: boolean;
  /** Higher values sit on the left. */
  descending: boolean;
  scale: ScaleLinear<number, number>;
  ticks: TickLayout[];
  zeroX: number | null;
  rows: RowLayout[];
  hasData: boolean;
  /** Some row is a link or a button. */
  interactive: boolean;
  summary: string;
}

interface LayoutInput {
  width: number;
  rows: readonly DotStripRow[];
  d0: number;
  d1: number;
  ticks: readonly DotStripTick[] | undefined;
  rowHeight: number;
  format: (value: number) => string;
  tickFormat: (value: number) => string;
  stack: boolean;
  axisTop: boolean;
  clickable: boolean;
}

function computeLayout(o: LayoutInput): Layout {
  const width = Number.isFinite(o.width) ? Math.max(0, Math.floor(o.width)) : 0;
  const rh = o.rowHeight;
  const n = o.rows.length;
  const plotTop = o.axisTop ? AXIS : EDGE;
  const plotBottom = plotTop + n * rh;
  const axisY = o.axisTop ? plotTop : plotBottom;
  const [a, b] = cleanDomain(o.d0, o.d1, o.rows);
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);

  // Label gutter: as wide as the longest label, capped to a share of the width (truncated past it).
  let maxLabel = 0;
  let maxSub = 0;
  for (const r of o.rows) {
    if (r.label) maxLabel = Math.max(maxLabel, textWidth(r.label, LABEL_SIZE));
    if (r.sublabel) maxSub = Math.max(maxSub, textWidth(r.sublabel, SUB_SIZE));
  }
  const cap = width < 140 ? 0 : Math.round(width * (width < 480 ? 0.38 : 0.32));
  let labelW = Math.min(Math.ceil(maxLabel), cap);
  let subW = 0;
  if (labelW > 0 && maxSub > 0 && width >= 320) {
    const want = Math.ceil(maxSub);
    if (labelW + SUB_GAP + want <= cap) {
      subW = want;
    } else {
      labelW = Math.min(labelW, Math.max(Math.round(cap * 0.6), cap - SUB_GAP - want));
      subW = cap - labelW - SUB_GAP;
      if (subW < 28) {
        subW = 0;
        labelW = Math.min(Math.ceil(maxLabel), cap);
      }
    }
  }
  const gutter = labelW > 0 ? labelW + (subW > 0 ? SUB_GAP + subW : 0) + GUTTER_GAP : 0;

  // The scale, then room for tick labels that would poke past either edge of the svg.
  let x0 = Math.max(gutter, PAD_X);
  let x1 = Math.max(x0 + 10, width - PAD_X);
  const scale = scaleLinear().domain([a, b]).range([x0, x1]).clamp(true);
  const eps = (hi - lo) * 1e-9;
  const defs = o.ticks
    ? o.ticks
        .filter((t) => finite(t.value) && t.value >= lo - eps && t.value <= hi + eps)
        .map((t) => ({ value: t.value, label: String(t.label ?? "") }))
    : scale.ticks(Math.max(2, Math.min(10, Math.round((x1 - x0) / 70)))).map((v) => ({ value: v, label: o.tickFormat(v) }));
  let leftNeed = 0;
  let rightNeed = 0;
  for (const t of defs) {
    const x = scale(t.value);
    const half = textWidth(t.label, TICK_SIZE) / 2;
    leftNeed = Math.max(leftNeed, half - x);
    rightNeed = Math.max(rightNeed, x + half - width);
  }
  if (leftNeed > 0 || rightNeed > 0) {
    x0 += leftNeed;
    x1 = Math.max(x0 + 10, x1 - rightNeed);
    scale.range([x0, x1]);
  }

  // Thin the tick labels (every 2nd, 3rd, ...) until none collide; gridlines stay for all.
  const placedTicks = defs
    .map((t) => ({ value: t.value, label: t.label, x: scale(t.value), half: textWidth(t.label, TICK_SIZE) / 2 }))
    .sort((p, q) => p.x - q.x);
  let every = 1;
  while (every < placedTicks.length && !ticksFit(placedTicks, every)) every++;
  const tickLayout = placedTicks.map((t, i) => ({ value: t.value, x: t.x, label: t.label, show: i % every === 0 && t.label !== "" }));

  const room = Math.max(0, rh - 2 * DOT_OUTER - 2);
  const seen = new Set<string>();
  let gmin = Infinity;
  let gmax = -Infinity;
  const rowsOut = o.rows.map((row, index): RowLayout => {
    let key = String(row.key);
    if (seen.has(key)) key = `${key}~${index}`;
    seen.add(key);
    const top = plotTop + index * rh;
    const cy = top + rh / 2;

    const dots: Placed[] = [];
    for (const dot of row.dots ?? []) {
      const v = dot?.value;
      if (finite(v)) dots.push({ dot, value: v, x: scale(v), y: cy });
    }
    let min = Infinity;
    let max = -Infinity;
    for (const p of dots) {
      if (p.value < min) min = p.value;
      if (p.value > max) max = p.value;
    }
    gmin = Math.min(gmin, min);
    gmax = Math.max(gmax, max);

    const groups = groupDots(dots);
    if (o.stack) {
      for (const g of groups) {
        const k = g.dots.length;
        if (k < 2) continue;
        const step = Math.min(STACK_STEP, room / (k - 1));
        g.dots.forEach((p, m) => {
          p.y = cy + (m - (k - 1) / 2) * step;
        });
      }
    }

    const mv = row.marker?.value;
    const markerValue = finite(mv) ? mv : null;
    const href = row.href ? row.href : null;
    return {
      row,
      index,
      key,
      top,
      cy,
      href,
      kind: href ? "link" : o.clickable ? "button" : "static",
      label: labelW > 0 && row.label ? fitText(row.label, labelW, LABEL_SIZE) : "",
      sublabel: subW > 0 && row.sublabel ? fitText(row.sublabel, subW, SUB_SIZE) : "",
      dots,
      groups,
      min,
      max,
      markerValue,
      markerX: markerValue == null ? null : scale(markerValue),
      markerLabel: row.marker?.label ?? "",
      summary: rowSummary(row, dots.length, min, max, markerValue, o.format),
    };
  });

  const summary =
    `${n} ${n === 1 ? "row" : "rows"}` + (gmin <= gmax ? `, values from ${o.format(gmin)} to ${o.format(gmax)}` : ", no values");

  return {
    width,
    height: dotStripHeight(n, rh),
    rowHeight: rh,
    x0,
    x1,
    subX: labelW + SUB_GAP,
    plotTop,
    plotBottom,
    axisY,
    axisTop: o.axisTop,
    descending: a > b,
    scale,
    ticks: tickLayout,
    zeroX: lo < 0 && hi > 0 ? scale(0) : null,
    rows: rowsOut,
    hasData: rowsOut.some((r) => r.dots.length > 0 || r.markerX != null),
    interactive: rowsOut.some((r) => r.kind !== "static"),
    summary,
  };
}

/** Dots that share a position (within SAME_PX), left to right; members keep their input order. */
function groupDots(dots: Placed[]): Group[] {
  const order = dots.map((p, i) => ({ p, i })).sort((m, k) => m.p.x - k.p.x || m.i - k.i);
  const groups: Group[] = [];
  let run: { p: Placed; i: number }[] = [];
  const flush = () => {
    if (run.length === 0) return;
    let sx = 0;
    for (const m of run) sx += m.p.x;
    run.sort((m, k) => m.i - k.i);
    groups.push({ x: sx / run.length, dots: run.map((m) => m.p) });
    run = [];
  };
  for (const m of order) {
    if (run.length > 0 && m.p.x - run[0].p.x > SAME_PX) flush();
    run.push(m);
  }
  flush();
  return groups;
}

function ticksFit(ticks: { x: number; half: number }[], every: number): boolean {
  let right = -Infinity;
  for (let i = 0; i < ticks.length; i += every) {
    const t = ticks[i];
    if (t.half === 0) continue;
    if (t.x - t.half < right + 6) return false;
    right = t.x + t.half;
  }
  return true;
}

/** Nearest dot group (or the marker) within HIT px in the row under the pointer; else the row itself. */
function hitTest(L: Layout, px: number, py: number): HoverTarget | null {
  if (py < L.plotTop || py >= L.plotBottom || px < 0 || px > L.width) return null;
  const row = Math.floor((py - L.plotTop) / L.rowHeight);
  const r = L.rows[row];
  if (!r) return null;
  let best: HoverTarget = { kind: "row", row };
  let bestD = HIT;
  for (let g = 0; g < r.groups.length; g++) {
    const group = r.groups[g];
    const dx = Math.abs(px - group.x);
    if (dx > bestD) continue;
    for (const p of group.dots) {
      const d = Math.hypot(dx, py - p.y);
      if (d <= bestD) {
        bestD = d;
        best = { kind: "dot", row, group: g };
      }
    }
  }
  if (r.markerX != null && Math.abs(px - r.markerX) < bestD) best = { kind: "marker", row };
  return best;
}

function sameTarget(a: HoverTarget | null, b: HoverTarget): boolean {
  if (!a || a.kind !== b.kind || a.row !== b.row) return false;
  return (a.kind === "dot" ? a.group : -1) === (b.kind === "dot" ? b.group : -1);
}

// ---------------------------------------------------------------------------------------------
// Drawing

/** Everything that does not change on hover: zones, grid and axis, row labels and hit areas, marks. */
function drawStatic(L: Layout, bands: readonly DotStripBand[] | undefined) {
  const { width, x0, x1, plotTop, plotBottom, rowHeight: rh } = L;

  const zones =
    bands && bands.length > 0 ? (
      <g aria-hidden="true" pointerEvents="none">
        {bands.map((band, i) => {
          if (!finite(band.from) || !finite(band.to)) return null;
          const xa = L.scale(band.from);
          const xb = L.scale(band.to);
          const w = Math.abs(xb - xa);
          return w > 0 ? (
            <rect key={i} x={Math.min(xa, xb)} y={plotTop} width={w} height={plotBottom - plotTop} fill={band.color} fillOpacity={0.1} />
          ) : null;
        })}
      </g>
    ) : null;

  const labelY = L.axisTop ? L.axisY - 8 : L.axisY + 14;
  const grid = (
    <g aria-hidden="true" pointerEvents="none">
      {L.ticks.map((t, i) =>
        L.zeroX != null && Math.abs(t.x - L.zeroX) < 0.5 ? null : (
          <line key={i} x1={crisp(t.x)} x2={crisp(t.x)} y1={plotTop} y2={plotBottom} stroke="var(--grid)" strokeWidth={1} />
        ),
      )}
      {L.rows.map((r) => (
        <line key={r.key} x1={x0} x2={x1} y1={crisp(r.cy)} y2={crisp(r.cy)} stroke="var(--grid)" strokeWidth={1} />
      ))}
      {L.zeroX != null && (
        <line x1={crisp(L.zeroX)} x2={crisp(L.zeroX)} y1={plotTop} y2={plotBottom} stroke="var(--axis)" strokeWidth={1} />
      )}
      <line x1={x0} x2={x1} y1={crisp(L.axisY)} y2={crisp(L.axisY)} stroke="var(--axis)" strokeWidth={1} />
      <g fill="var(--muted)" className="text-[10px] tabular-nums">
        {L.ticks.map((t, i) =>
          t.show ? (
            <text key={i} x={t.x} y={labelY} textAnchor="middle">
              {t.label}
            </text>
          ) : null,
        )}
      </g>
    </g>
  );

  const rowsLayer = (
    <g>
      {L.rows.map((r) => {
        const body = (
          <>
            {r.kind !== "static" && <rect x={0} y={r.top} width={width} height={rh} fill="transparent" />}
            {r.label && (
              <text
                x={0}
                y={r.cy}
                dy="0.32em"
                fill="var(--ink)"
                className={r.kind === "static" ? "text-[11px] font-medium" : "text-[11px] font-medium group-hover:underline"}
              >
                {r.label}
              </text>
            )}
            {r.sublabel && (
              <text x={L.subX} y={r.cy} dy="0.32em" fill="var(--muted)" className="text-[10px]">
                {r.sublabel}
              </text>
            )}
          </>
        );
        if (r.href != null) {
          return (
            <Link key={r.key} href={r.href} data-row={r.index} aria-label={r.summary} className="group cursor-pointer" style={NO_OUTLINE}>
              {body}
            </Link>
          );
        }
        if (r.kind === "button") {
          return (
            <g
              key={r.key}
              data-row={r.index}
              role="button"
              tabIndex={0}
              aria-label={r.summary}
              className="group cursor-pointer"
              style={NO_OUTLINE}
            >
              {body}
            </g>
          );
        }
        // Inside an interactive (role="group") chart, plain rows still announce their summary.
        return (
          <g key={r.key} data-row={r.index} role={L.interactive ? "img" : undefined} aria-label={L.interactive ? r.summary : undefined}>
            {body}
          </g>
        );
      })}
    </g>
  );

  const marks = (
    <g aria-hidden="true" pointerEvents="none">
      {L.rows.map((r) =>
        r.dots.length === 0 && r.markerX == null ? null : (
          <g key={r.key}>
            {r.row.range && r.max > r.min && (
              <line x1={L.scale(r.min)} x2={L.scale(r.max)} y1={crisp(r.cy)} y2={crisp(r.cy)} stroke="var(--muted)" strokeWidth={1} />
            )}
            {r.dots.map((p, j) => dotMark(p, j))}
            {r.markerX != null && <MarkerTick x={r.markerX} cy={r.cy} rowHeight={rh} />}
          </g>
        ),
      )}
    </g>
  );

  return { zones, grid, rows: rowsLayer, marks };
}

function dotMark(p: Placed, key: number) {
  return (
    <circle key={key} cx={p.x} cy={p.y} r={DOT_R + RING / 2} fill={p.dot.color || "var(--muted)"} stroke="var(--surface)" strokeWidth={RING} />
  );
}

/** The reference tick: 2px ink with round caps over a surface halo, so it reads across dots. */
function MarkerTick({ x, cy, rowHeight, strong = false }: { x: number; cy: number; rowHeight: number; strong?: boolean }) {
  const half = Math.min(rowHeight - 6, 20) / 2;
  return (
    <>
      <line x1={x} x2={x} y1={cy - half} y2={cy + half} stroke="var(--surface)" strokeWidth={strong ? 5 : 4} strokeLinecap="round" />
      <line x1={x} x2={x} y1={cy - half} y2={cy + half} stroke="var(--ink)" strokeWidth={strong ? 3 : 2} strokeLinecap="round" />
    </>
  );
}

/** Hovered dots: redrawn on top and wrapped in one ink outline (a circle, or a capsule for a stack). */
function GroupHighlight({ group }: { group: Group }) {
  let top = Infinity;
  let bottom = -Infinity;
  for (const p of group.dots) {
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  const r = DOT_OUTER + 2.5;
  return (
    <g pointerEvents="none" aria-hidden="true">
      {group.dots.map((p, j) => dotMark(p, j))}
      <rect x={group.x - r} y={top - r} width={2 * r} height={bottom - top + 2 * r} rx={r} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
    </g>
  );
}

// ---------------------------------------------------------------------------------------------
// Tooltips: values lead (TipRow), labels follow.

function DotTip({ r, group, format }: { r: RowLayout; group: Group; format: (value: number) => string }) {
  const listed = group.dots.slice(0, TIP_MAX);
  const more = group.dots.length - listed.length;
  return (
    <>
      {r.row.label && <TipTitle>{r.row.label}</TipTitle>}
      {listed.map((p, j) => (
        <TipRow key={j} color={p.dot.color} label={p.dot.label} value={format(p.value)} />
      ))}
      {more > 0 && <div className="py-0.5 text-[11px] text-muted">+{more} more</div>}
      {r.markerValue != null && (
        <div className="mt-1 border-t border-line pt-1">
          <TipRow color="var(--ink)" label={r.markerLabel} value={format(r.markerValue)} />
        </div>
      )}
      {r.kind === "link" && <div className="mt-1 text-[11px] text-muted">Click to open</div>}
    </>
  );
}

function MarkerTip({ r, format }: { r: RowLayout; format: (value: number) => string }) {
  if (r.markerValue == null) return null;
  return (
    <>
      {r.row.label && <TipTitle>{r.row.label}</TipTitle>}
      <TipRow color="var(--ink)" label={r.markerLabel} value={format(r.markerValue)} />
      {r.kind === "link" && <div className="mt-1 text-[11px] text-muted">Click to open</div>}
    </>
  );
}

/** Row summary: min and max (ordered as on the axis) with who holds them, spread, marker. */
function RowTip({
  r,
  format,
  formatSpread,
  descending,
}: {
  r: RowLayout;
  format: (value: number) => string;
  formatSpread: (spread: number) => string;
  descending: boolean;
}) {
  const n = r.dots.length;
  let body: ReactNode;
  if (n === 0) {
    body = <div className="py-0.5 text-ink-2">No values</div>;
  } else if (n === 1) {
    const p = r.dots[0];
    body = <TipRow color={p.dot.color} label={p.dot.label} value={format(p.value)} />;
  } else if (r.min === r.max) {
    body = (
      <>
        <TipRow label={`All ${n}`} value={format(r.min)} />
        <TipRow label="Spread" value={formatSpread(0)} />
      </>
    );
  } else {
    const low = <TipRow key="min" label={extremeLabel("Min", whoAt(r, r.min))} value={format(r.min)} />;
    const high = <TipRow key="max" label={extremeLabel("Max", whoAt(r, r.max))} value={format(r.max)} />;
    body = (
      <>
        {descending ? [high, low] : [low, high]}
        <TipRow label="Spread" value={formatSpread(r.max - r.min)} />
      </>
    );
  }
  const notes = [n > 1 ? `${n} values` : "", r.kind === "link" ? "Click to open" : ""].filter(Boolean).join(" · ");
  return (
    <>
      {r.row.label && <TipTitle>{r.row.label}</TipTitle>}
      {r.row.sublabel && <div className="-mt-0.5 mb-1 text-[11px] text-ink-2">{r.row.sublabel}</div>}
      {body}
      {r.markerValue != null && <TipRow color="var(--ink)" label={r.markerLabel} value={format(r.markerValue)} />}
      {notes && <div className="mt-1 text-[11px] text-muted">{notes}</div>}
    </>
  );
}

function extremeLabel(name: string, who: string): ReactNode {
  return who ? (
    <>
      {name}
      <span className="text-muted"> · {who}</span>
    </>
  ) : (
    name
  );
}

/** Who holds a value: "Cook", or "Cook +2" when several dots share it. */
function whoAt(r: RowLayout, v: number): string {
  const names = r.dots.filter((p) => p.value === v && p.dot.label).map((p) => p.dot.label);
  if (names.length === 0) return "";
  return names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
}

// ---------------------------------------------------------------------------------------------
// Helpers

function finite(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function cleanRowHeight(h: number | undefined): number {
  return h != null && Number.isFinite(h) && h > 0 ? Math.max(MIN_ROW_HEIGHT, Math.round(h)) : ROW_HEIGHT;
}

/** A usable [left, right] domain: the data extent when the given one is not finite, widened when it is a single value. */
function cleanDomain(d0: number, d1: number, rows: readonly DotStripRow[]): [number, number] {
  let a = d0;
  let b = d1;
  if (!finite(a) || !finite(b)) {
    let lo = Infinity;
    let hi = -Infinity;
    for (const r of rows) {
      for (const d of r.dots ?? []) {
        const v = d?.value;
        if (finite(v)) {
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
      }
      const m = r.marker?.value;
      if (finite(m)) {
        lo = Math.min(lo, m);
        hi = Math.max(hi, m);
      }
    }
    if (lo > hi) {
      lo = 0;
      hi = 1;
    }
    a = lo;
    b = hi;
  }
  if (a === b) {
    const pad = Math.abs(a) * 0.1 || 1;
    return [a - pad, b + pad];
  }
  return [a, b];
}

function rowSummary(
  row: DotStripRow,
  count: number,
  min: number,
  max: number,
  markerValue: number | null,
  format: (value: number) => string,
): string {
  const name = row.sublabel ? `${row.label} (${row.sublabel})` : row.label;
  const values =
    count === 0
      ? "no values"
      : count === 1
        ? `1 value, ${format(min)}`
        : min === max
          ? `${count} values, all ${format(min)}`
          : `${count} values from ${format(min)} to ${format(max)}`;
  const marker = markerValue != null && row.marker ? `; ${row.marker.label} ${format(markerValue)}` : "";
  return `${name}: ${values}${marker}`;
}

/** Plain number: compact from 1,000 up, otherwise at most two decimals ("3", "2.5", "-0.25"). */
function plain(v: number): string {
  return Math.abs(v) >= 1000 ? fmtCompact(v) : String(Number(v.toFixed(2)));
}

/** Center a 1px hairline on a pixel so it renders crisp. */
function crisp(v: number): number {
  return Math.floor(v) + 0.5;
}

const NARROW = new Set(" .,:;'!|()[]iljtfrI");
const WIDE = new Set("mwMW%@");

/** Rough rendered width of a label in the UI sans (Inter): enough to size gutters and thin ticks. */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) {
    if (NARROW.has(ch)) em += 0.31;
    else if (WIDE.has(ch)) em += 0.86;
    else if (ch >= "A" && ch <= "Z") em += 0.68;
    else if (ch >= "0" && ch <= "9") em += 0.62;
    else em += 0.56;
  }
  return em * size;
}

/** The text, or its longest prefix plus "…" that fits in maxWidth. */
function fitText(text: string, maxWidth: number, size: number): string {
  if (maxWidth <= 0) return "";
  if (textWidth(text, size) <= maxWidth) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textWidth(`${text.slice(0, mid).trimEnd()}…`, size) <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return lo > 0 ? `${text.slice(0, lo).trimEnd()}…` : "";
}
