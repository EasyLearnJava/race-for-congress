"use client";

// Histogram: vertical columns over a numeric x domain, such as how many seats a party wins
// across simulated elections. Columns share one baseline, keep a surface gap between
// neighbours, are capped at 24px and rounded at the data end. One delegated pointer handler
// hit-tests by x, so a bin's whole slot (the full plot height) is its target and dense bins
// stay easy to hover. Clickable bins form a single roving tab stop (arrow keys move,
// Enter/Space activates), and the plot can be brushed to select a range. Nothing animates.
import { scaleLinear } from "d3-scale";
import {
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { fmtCompact, fmtNum } from "@/lib/format";
import { barPath, RefLine, XAxis, YAxis } from "./axes";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

/** One bin: the half-open interval [x0, x1) and the height of its column. */
export interface HistogramBin {
  /** Left edge, inclusive, in x units. One-seat bins: `{ x0: k, x1: k + 1 }`. */
  x0: number;
  /** Right edge, exclusive, in x units. */
  x1: number;
  /**
   * Column height: a probability, a share or a count. Bins whose value is null, NaN or
   * infinite are skipped; negative values hang below the zero line.
   */
  value: number | null;
  /** Fill for this bin (a token such as "var(--dem)"). Wins over `colorFor`. */
  color?: string;
}

/** A vertical reference line across the plot, labelled above it. */
export interface HistogramMarker {
  /**
   * Position in x units, on the bin-edge scale: with one-seat bins `{ x0: k, x1: k + 1 }`,
   * x = 218 runs between the 217 and 218 columns.
   */
  x: number;
  /**
   * Short label above the plot. A label that would collide moves up one row; when both
   * rows are taken it is dropped (the line stays).
   */
  label?: string;
  /**
   * The line that matters most (the majority line): ink, 1.5px, in front of the columns.
   * Other markers are recessive hairlines behind them.
   */
  strong?: boolean;
}

export interface HistogramProps<B extends HistogramBin = HistogramBin> {
  /** Width in px, from ChartFrame's render prop. */
  width: number;
  /** Height in px including the axis labels: the same height given to ChartFrame. */
  height: number;
  /** Bins in any order. Bins with a missing or bad value or interval are skipped. */
  bins: B[];
  /** Formats x values: axis ticks, bin labels and ranges. Default: plain numbers (compact ticks from 1,000). */
  xFormat?: (x: number) => string;
  /**
   * Formats y values: axis ticks and, unless `valueFormat` is set, tooltip values.
   * Default: numbers rounded to the tick step, compact from 1,000.
   */
  yFormat?: (y: number) => string;
  /**
   * Formats a bin's value in the tooltip and accessible names when that should differ from
   * the ticks (e.g. `fmtProb`, which prints "<1%" for tiny values). Defaults to `yFormat`.
   */
  valueFormat?: (y: number) => string;
  /** Names the y measure: the axis title and the tooltip row label ("Probability", "Simulations"). */
  yLabel?: string;
  /** Axis title under the x axis ("Democratic seats"). */
  xLabel?: string;
  /** Vertical reference lines: the 218 majority line, the edges of the 80% range. */
  markers?: HistogramMarker[];
  /**
   * Fill for a bin without its own `color`. Default `var(--m-3)`.
   * E.g. `(b) => (b.x0 >= 218 ? "var(--dem)" : "var(--rep)")`.
   */
  colorFor?: (bin: B) => string;
  /** Tooltip title and accessible name of a bin. Default: see `discrete`, otherwise "x0–x1". */
  binLabel?: (bin: B) => string;
  /**
   * The x values are whole numbers (seat counts). A bin then holds the whole numbers from
   * ⌈x0⌉ to ⌈x1⌉ − 1 and is labelled by them ("218", "200–204"), and each tick sits under the
   * centre of its value's column. Default: true when every bin is exactly one unit wide with
   * whole- or half-number edges. Pass false for continuous data in one-unit bins.
   */
  discrete?: boolean;
  /**
   * Fixes the x domain (edge units), so the axis holds still while the data moves, or zooms in.
   * Bins outside it are dropped and bins across an edge are clipped; markers outside it are
   * hidden. Default: the bins' extent, widened to include every marker.
   */
  xDomain?: readonly [number, number];
  /**
   * Makes columns clickable (drill-down): called with the bin on click, or on Enter/Space
   * while the bin has keyboard focus.
   */
  onBinClick?: (bin: B) => void;
  /** Highlights bins whose midpoint lies in [lo, hi] (edge units, as `onBrush` reports) and dims the rest to 35%. */
  selectedRange?: readonly [number, number] | null;
  /**
   * Lets the reader drag across the plot to select a range of bins; a translucent ink band and
   * a tooltip with the range's total follow the drag. Keyboard: Shift+arrows extend a range
   * from the focused bin, Escape clears it.
   */
  brushable?: boolean;
  /**
   * Brush result on release, snapped to whole bins: [x0 of the first bin, x1 of the last].
   * null when a click without a drag clears the selection (when `onBinClick` is also set, a
   * click on a column drills down instead, so only clicks outside the bins clear), or on Escape.
   */
  onBrush?: (range: [number, number] | null) => void;
  /** Accessible description of the chart (the svg's aria-label). Default: a generated summary. */
  summary?: string;
}

const MAX_COLUMN = 24; // px; the rest of a wider slot stays air
const DIMMED = 0.35; // opacity of bins outside selectedRange
const DRAG_PX = 4; // pointer travel that turns a press into a brush
const NO_OUTLINE = { outline: "none" } as const; // hit targets draw their own focus ring

interface Span {
  first: number;
  last: number;
  range: [number, number];
}

const twoDecimals = new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 });

/** Default x format: up to two decimals, compact from 10,000. */
function plainX(v: number): string {
  const n = v === 0 ? 0 : v;
  return Math.abs(n) >= 10_000 ? fmtCompact(n) : twoDecimals.format(n);
}

/** Default value format: whole numbers with separators, otherwise three significant digits. */
function plainValue(v: number): string {
  const n = v === 0 ? 0 : v;
  if (Number.isInteger(n) || Math.abs(n) >= 100) return fmtNum(n);
  return String(Number(n.toPrecision(3)));
}

function decimalsOf(step: number): number {
  for (let d = 0; d < 8; d++) {
    const s = Math.abs(step) * 10 ** d;
    if (Math.abs(s - Math.round(s)) < 1e-6) return d;
  }
  return 8;
}

/** Tick labels rounded to the tick step; compact from 1,000 ("1.5K"). */
function tickFormat(step: number, maxAbs: number): (v: number) => string {
  if (maxAbs >= 1000) return (v) => fmtCompact(v === 0 ? 0 : v);
  const digits = decimalsOf(step);
  const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  return (v) => nf.format(v === 0 ? 0 : v);
}

/**
 * Up to `maxCount` ticks on round steps: 1, 2, 5 × 10^k, plus 25 (so seat axes step by 10,
 * 20 or 25). `minStep` keeps whole-number axes on whole ticks.
 */
function niceTicks(lo: number, hi: number, maxCount: number, minStep = 0): { ticks: number[]; step: number } {
  const span = hi - lo;
  if (!(span > 0)) return { ticks: [], step: 1 };
  const raw = Math.max(span / Math.max(1, maxCount), minStep);
  const mag = 10 ** Math.floor(Math.log10(raw));
  const mults = mag === 10 ? [1, 2, 2.5, 5, 10] : [1, 2, 5, 10];
  const step = (mults.find((m) => m * mag >= raw * (1 - 1e-9)) ?? 10) * mag;
  const ticks: number[] = [];
  const last = Math.floor(hi / step + 1e-9);
  for (let i = Math.ceil(lo / step - 1e-9); i <= last; i++) {
    const t = Number((i * step).toPrecision(12));
    ticks.push(t === 0 ? 0 : t);
  }
  return { ticks, step };
}

/** A nice y scale and its ticks for about `count` ticks. */
function yAxisFor(lo: number, hi: number, count: number, format?: (v: number) => string) {
  const scale = scaleLinear().domain([lo, hi]).nice(count);
  const ticks = scale.ticks(count);
  const fmt = format ?? tickFormat(ticks.length > 1 ? ticks[1] - ticks[0] : 1, Math.max(0, ...ticks.map(Math.abs)));
  return { scale, ticks, fmt };
}

/** True when no two ticks print the same label. */
function distinct(ticks: number[], format: (v: number) => string): boolean {
  return new Set(ticks.map(format)).size === ticks.length;
}

/** "200–204", or "−5 to 0" when a minus sign would sit next to the dash. */
function rangeText(a: string, b: string): string {
  return /^[-−]/.test(a) || /^[-−]/.test(b) ? `${a} to ${b}` : `${a}–${b}`;
}

function spanText(format: (v: number) => string, a: number, b: number): string {
  return a === b ? format(a) : rangeText(format(a), format(b));
}

/** Rough width of a 10px label. */
const textWidth = (s: string) => s.length * 6.2;
const round2 = (n: number) => Math.round(n * 100) / 100;

function toRange(a: number | undefined, b: number | undefined): [number, number] | null {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a <= b ? [a, b] : [b, a];
}

/** A column hanging below zero: square at the zero line, 4px rounded at the data end. */
function hangPath(x: number, y: number, w: number, h: number, radius = 4): string {
  if (w <= 0 || h <= 0) return "";
  const r = Math.min(radius, w / 2, h);
  return `M${x},${y}V${y + h - r}A${r},${r} 0 0 0 ${x + r},${y + h}H${x + w - r}A${r},${r} 0 0 0 ${x + w},${y + h - r}V${y}Z`;
}

function readIndex(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const raw = target.getAttribute("data-i");
  return raw == null ? null : Number(raw);
}

/** Where an arrow, Page or Home/End key moves keyboard focus, or null for other keys. */
function keyTarget(key: string, j: number, n: number): number | null {
  switch (key) {
    case "ArrowRight":
      return Math.min(n - 1, j + 1);
    case "ArrowLeft":
      return Math.max(0, j - 1);
    case "PageUp":
      return Math.min(n - 1, j + 10);
    case "PageDown":
      return Math.max(0, j - 10);
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return null;
  }
}

// Keeps a press from focusing a bin (keyboard focus only) or selecting text while brushing.
const preventDefault = (e: { preventDefault: () => void }) => e.preventDefault();

/** Vertical columns over a numeric x domain. Render inside ChartFrame's render prop. */
export function Histogram<B extends HistogramBin = HistogramBin>({
  width,
  height,
  bins,
  xFormat,
  yFormat,
  valueFormat,
  yLabel,
  xLabel,
  markers,
  colorFor,
  binLabel,
  discrete,
  xDomain,
  onBinClick,
  selectedRange,
  brushable = false,
  onBrush,
  summary,
}: HistogramProps<B>) {
  const { tip, show, hide } = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  const [active, setActive] = useState<number | null>(null);
  const [drag, setDrag] = useState<{ from: number; to: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const press = useRef<{ id: number; x: number; moved: boolean } | null>(null);
  const swallowClick = useRef(false);
  const anchor = useRef<number | null>(null);

  const domLo = xDomain?.[0];
  const domHi = xDomain?.[1];
  const selLo = selectedRange?.[0];
  const selHi = selectedRange?.[1];
  const interactive = !!onBinClick || brushable;

  const layout = useMemo(() => {
    const fmtX = xFormat ?? plainX;
    const fmtV = valueFormat ?? yFormat ?? plainValue;

    // Usable bins in x order: a finite value over a finite, non-empty interval.
    const clean: { bin: B; x0: number; x1: number; v: number }[] = [];
    for (const bin of bins) {
      const v = bin?.value;
      if (v == null || !Number.isFinite(v) || !Number.isFinite(bin.x0) || !Number.isFinite(bin.x1)) continue;
      const x0 = Math.min(bin.x0, bin.x1);
      const x1 = Math.max(bin.x0, bin.x1);
      if (x1 > x0) clean.push({ bin, x0, x1, v });
    }
    clean.sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);

    // x domain: fixed by the caller, or the bins' extent widened to every marker.
    const fixed = domLo != null && domHi != null && Number.isFinite(domLo) && Number.isFinite(domHi) && domLo !== domHi;
    let lo = 0;
    let hi = 0;
    let shown = clean;
    if (fixed) {
      const a = Math.min(domLo, domHi);
      const b = Math.max(domLo, domHi);
      shown = clean.filter((c) => c.x1 > a && c.x0 < b);
      lo = a;
      hi = b;
    } else if (clean.length) {
      lo = clean[0].x0;
      hi = Math.max(...clean.map((c) => c.x1));
      if (clean.length === 1) {
        // A lone bin gets room on both sides so it reads as one bin, not a wall.
        const w = hi - lo;
        lo = lo >= 0 ? Math.max(0, lo - 2 * w) : lo - 2 * w;
        hi += 2 * w;
      }
      for (const m of markers ?? []) {
        if (m && Number.isFinite(m.x)) {
          lo = Math.min(lo, m.x);
          hi = Math.max(hi, m.x);
        }
      }
    }
    if (!shown.length) return null;

    // Whole-number data (seat counts): ticks sit under the centre of their value's column.
    const frac = shown[0].x0 - Math.floor(shown[0].x0);
    const unitBins =
      (frac < 1e-9 || Math.abs(frac - 0.5) < 1e-9) &&
      shown.every((c) => Math.abs(c.x1 - c.x0 - 1) < 1e-9 && Math.abs(c.x0 - Math.floor(c.x0) - frac) < 1e-9);
    const isDiscrete = discrete ?? unitBins;
    const offset = !isDiscrete ? 0 : frac > 1e-9 ? frac - 0.5 : 0.5;

    // y: one scale from the lower of zero and the data to the higher.
    let yMin = 0;
    let yMax = 0;
    for (const c of shown) {
      if (c.v < yMin) yMin = c.v;
      if (c.v > yMax) yMax = c.v;
    }
    if (yMin === yMax) yMax = 1; // every value is zero
    // The most ticks (up to one per ~36px) whose labels stay distinct: a whole-percent
    // format cannot label half-percent steps.
    const yCount = Math.max(2, Math.min(6, Math.floor((height - 50) / 36)));
    let yAxis = yAxisFor(yMin, yMax, yCount, yFormat);
    for (let c = yCount - 1; c >= 2 && !distinct(yAxis.ticks, yAxis.fmt); c--) yAxis = yAxisFor(yMin, yMax, c, yFormat);
    const { scale: y, fmt: yTickFormat } = yAxis;
    // Still clashing at two ticks (a tiny range under a coarse format): keep each label once.
    const yTicks = yAxis.ticks.filter((t, i, all) => all.findIndex((u) => yTickFormat(u) === yTickFormat(t)) === i);

    // Margins from the labels they hold.
    const showYTitle = !!yLabel && width >= 200;
    const tickW = Math.max(8, ...yTicks.map((t) => textWidth(yTickFormat(t))));
    const left = Math.ceil(tickW + 10 + (showYTitle ? 16 : 0));
    const xLabelW = Math.max(12, textWidth(fmtX(lo)), textWidth(fmtX(hi)));
    const right = Math.ceil(Math.max(8, xLabelW / 2 + 2));
    const bottom = xLabel ? 38 : 22;
    const plotLeft = Math.min(left, Math.max(0, width - right - 1));
    const plotRight = Math.max(plotLeft + 1, width - right);
    const x = scaleLinear().domain([lo, hi]).range([plotLeft, plotRight]);

    const maxAbsX = Math.max(Math.abs(lo), Math.abs(hi));
    const maxTicks = Math.max(1, Math.floor((plotRight - plotLeft) / (xLabelW + 20)));
    let xt = niceTicks(lo - offset, hi - offset, maxTicks, isDiscrete ? 1 : 0);
    let xTickFormat = xFormat ?? tickFormat(xt.step, maxAbsX);
    for (let c = maxTicks - 1; c >= 1 && !distinct(xt.ticks, xTickFormat); c--) {
      xt = niceTicks(lo - offset, hi - offset, c, isDiscrete ? 1 : 0);
      xTickFormat = xFormat ?? tickFormat(xt.step, maxAbsX);
    }

    // Markers: strong labels claim the row next to the plot first; a collision moves a label
    // up a row, and a label with no free row is dropped.
    const ms = (markers ?? [])
      .filter((m) => m && Number.isFinite(m.x) && m.x >= lo && m.x <= hi)
      .map((m, k) => ({ key: k, px: round2(x(m.x)), label: m.label, strong: !!m.strong, lx: 0, row: -1 }));
    const rows: [number, number][][] = [[], []];
    const byPriority = [...ms].sort((a, b) => Number(b.strong) - Number(a.strong) || a.key - b.key);
    for (const m of byPriority) {
      if (!m.label) continue;
      const w = textWidth(m.label) + 4;
      const lx = Math.min(Math.max(m.px, w / 2 + 1), width - w / 2 - 1);
      const box: [number, number] = [lx - w / 2 - 4, lx + w / 2 + 4];
      const row = rows.findIndex((r) => r.every(([a, b]) => box[1] <= a || box[0] >= b));
      if (row < 0) continue;
      rows[row].push(box);
      m.lx = round2(lx);
      m.row = row;
    }
    const plotTop = rows[1].length ? 30 : rows[0].length ? 18 : 8;
    const plotBottom = Math.max(plotTop + 10, height - bottom);
    y.range([plotBottom, plotTop]);
    const base = y(0);

    // Columns: a 2px surface gap between neighbours, 1px once bins get thin, none once they
    // are thinner than a gap (a solid silhouette, overlapped half a pixel so no seams show).
    const slots = shown.map((c) => x(Math.min(c.x1, hi)) - x(Math.max(c.x0, lo)));
    const typical = [...slots].sort((a, b) => a - b)[Math.floor(slots.length / 2)];
    const gap = typical >= 6 ? 2 : typical >= 2.5 ? 1 : 0;
    const items = shown.map((c, j) => {
      const sx = x(Math.max(c.x0, lo));
      const sw = slots[j];
      let cw = gap ? Math.max(sw - gap, Math.min(sw, 1)) : sw + 0.5;
      let cx = gap ? sx + (sw - cw) / 2 : sx;
      if (cw > MAX_COLUMN) {
        cx = sx + (sw - MAX_COLUMN) / 2;
        cw = MAX_COLUMN;
      }
      const vy = y(c.v);
      const lowV = Math.ceil(c.x0 - 1e-9);
      const highV = Math.max(lowV, Math.ceil(c.x1 - 1e-9) - 1);
      return {
        bin: c.bin,
        x0: c.x0,
        x1: c.x1,
        v: c.v,
        lowV,
        highV,
        mid: (c.x0 + c.x1) / 2,
        fill: c.bin.color ?? colorFor?.(c.bin) ?? "var(--m-3)",
        label: binLabel ? binLabel(c.bin) : isDiscrete ? spanText(fmtX, lowV, highV) : rangeText(fmtX(c.x0), fmtX(c.x1)),
        sx,
        sw,
        cx,
        cw,
        top: Math.min(vy, base),
        d:
          c.v >= 0
            ? barPath(round2(cx), round2(vy), round2(cw), round2(base - vy), "up")
            : hangPath(round2(cx), round2(base), round2(cw), round2(vy - base)),
      };
    });
    const n = items.length;

    let mode = 0;
    for (let j = 1; j < n; j++) if (Math.abs(items[j].v) > Math.abs(items[mode].v)) mode = j;

    /** Label for the bins first..last: one bin's own label, or the span they cover. */
    const spanLabel = (first: number, last: number): string => {
      if (first === last) return items[first].label;
      return isDiscrete
        ? spanText(fmtX, items[first].lowV, items[last].highV)
        : rangeText(fmtX(items[first].x0), fmtX(items[last].x1));
    };

    const labelled = ms.filter((m) => m.label).map((m) => m.label);
    const description = [
      `Histogram${yLabel ? ` of ${yLabel.toLowerCase()}` : ""}, ${n} bin${n === 1 ? "" : "s"} covering ${spanLabel(0, n - 1)}.`,
      n > 1 ? `Highest: ${items[mode].label} at ${fmtV(items[mode].v)}.` : `${items[0].label}: ${fmtV(items[0].v)}.`,
      labelled.length ? `Reference lines: ${labelled.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");

    return {
      items,
      n,
      x,
      y,
      lo,
      hi,
      offset,
      xTicks: xt.ticks,
      yTicks,
      xTickFormat,
      yTickFormat,
      fmtX,
      fmtV,
      spanLabel,
      plotLeft,
      plotRight,
      plotTop,
      plotBottom,
      base,
      negative: yMin < 0,
      markers: ms,
      showYTitle,
      mode,
      description,
    };
  }, [bins, width, height, domLo, domHi, markers, xFormat, yFormat, valueFormat, yLabel, xLabel, colorFor, binLabel, discrete]);

  // The ~450 columns re-render only when the data, size or selection changes, never on hover.
  const columns = useMemo(() => {
    if (!layout) return null;
    const sel = toRange(selLo, selHi);
    return (
      <g>
        {layout.items.map((it, j) =>
          it.d ? (
            <path
              key={j}
              d={it.d}
              fill={it.fill}
              opacity={sel && (it.mid < sel[0] || it.mid > sel[1]) ? DIMMED : undefined}
            />
          ) : null,
        )}
      </g>
    );
  }, [layout, selLo, selHi]);

  const chrome = useMemo(() => {
    if (!layout) return null;
    const L = layout;
    const tickX = (v: number) => L.x(v + L.offset);
    return {
      back: (
        <>
          <YAxis scale={L.y} ticks={L.yTicks} x={L.plotLeft} x1={L.plotRight} format={L.yTickFormat} />
          {L.showYTitle && (
            <text
              transform={`translate(9,${round2((L.plotTop + L.plotBottom) / 2)}) rotate(-90)`}
              dy="0.35em"
              textAnchor="middle"
              fill="var(--ink-2)"
              className="text-[11px]"
            >
              {yLabel}
            </text>
          )}
          {L.markers
            .filter((m) => !m.strong)
            .map((m) => (
              <RefLine key={m.key} x={m.px} y0={L.plotTop} y1={L.plotBottom} />
            ))}
        </>
      ),
      front: (
        <>
          {L.negative && (
            <line x1={L.plotLeft} x2={L.plotRight} y1={L.base} y2={L.base} stroke="var(--axis)" strokeWidth={1} />
          )}
          <XAxis
            scale={tickX}
            ticks={L.xTicks}
            y={L.plotBottom}
            x0={L.plotLeft}
            x1={L.plotRight}
            format={L.xTickFormat}
            label={xLabel}
          />
          {L.markers
            .filter((m) => m.strong)
            .map((m) => (
              <RefLine key={m.key} x={m.px} y0={L.plotTop} y1={L.plotBottom} strong />
            ))}
          {L.markers
            .filter((m) => m.row >= 0)
            .map((m) => (
              <text
                key={`label-${m.key}`}
                x={m.lx}
                y={L.plotTop - 6 - m.row * 12}
                textAnchor="middle"
                fill={m.strong ? "var(--ink)" : "var(--ink-2)"}
                className={m.strong ? "text-[10px] font-semibold" : "text-[10px]"}
              >
                {m.label}
              </text>
            ))}
        </>
      ),
    };
  }, [layout, yLabel, xLabel]);

  // Roving tab stop: the last bin focused, else the first selected bin, else the tallest.
  const defaultActive = useMemo(() => {
    if (!layout) return 0;
    const sel = toRange(selLo, selHi);
    if (sel) {
      const j = layout.items.findIndex((it) => it.mid >= sel[0] && it.mid <= sel[1]);
      if (j >= 0) return j;
    }
    return layout.mode;
  }, [layout, selLo, selHi]);
  const activeIndex = layout && active != null && active < layout.n ? active : defaultActive;

  // Transparent full-height slots: keyboard and screen-reader targets for each bin.
  const hits = useMemo(() => {
    if (!layout || !interactive) return null;
    const L = layout;
    const sel = toRange(selLo, selHi);
    const h = L.plotBottom - L.plotTop;
    return (
      <g>
        {L.items.map((it, j) => (
          <rect
            key={j}
            data-i={j}
            x={round2(it.sx)}
            y={L.plotTop}
            width={round2(Math.max(it.sw, 1))}
            height={h}
            fill="transparent"
            role="button"
            tabIndex={j === activeIndex ? 0 : -1}
            aria-label={`${it.label}: ${yLabel ? `${yLabel} ` : ""}${L.fmtV(it.v)}${
              sel && it.mid >= sel[0] && it.mid <= sel[1] ? ", selected" : ""
            }`}
            style={NO_OUTLINE}
          />
        ))}
      </g>
    );
  }, [layout, interactive, activeIndex, yLabel, selLo, selHi]);

  if (!layout) {
    return (
      <>
        <svg width={width} height={height} role="img" aria-label={summary ?? "No data"} className="block">
          <text
            x={width / 2}
            y={height / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill="var(--muted)"
            className="text-xs"
          >
            No data
          </text>
        </svg>
        <TooltipLayer tip={null} width={width} height={height} />
      </>
    );
  }

  const L = layout;
  const { items, n } = L;
  const plotH = L.plotBottom - L.plotTop;
  const hint = onBinClick
    ? brushable
      ? "Click to drill down, drag to select"
      : "Click to drill down"
    : brushable
      ? "Drag to select a range"
      : null;

  const binTip = (j: number): ReactNode => {
    const it = items[j];
    return (
      <>
        <TipTitle>{it.label}</TipTitle>
        <TipRow color={it.fill} label={yLabel ?? "Value"} value={L.fmtV(it.v)} />
        {hint && <div className="mt-1 text-[11px] text-muted">{hint}</div>}
      </>
    );
  };
  const spanTip = (s: Span): ReactNode => {
    let total = 0;
    for (let j = s.first; j <= s.last; j++) total += items[j].v;
    const count = s.last - s.first + 1;
    return (
      <>
        <TipTitle>{L.spanLabel(s.first, s.last)}</TipTitle>
        <TipRow label={yLabel ?? "Total"} value={L.fmtV(total)} />
        <div className="mt-1 text-[11px] text-muted">
          {count} {count === 1 ? "bin" : "bins"}
        </div>
      </>
    );
  };

  const span = (a: number, b: number): Span => {
    const first = Math.max(0, Math.min(a, b));
    const last = Math.min(n - 1, Math.max(a, b));
    return { first, last, range: [items[first].x0, items[last].x1] };
  };
  /** The whole bins under a horizontal pixel interval, or null when it covers none. */
  const snap = (pa: number, pb: number): Span | null => {
    const p0 = Math.min(pa, pb);
    const p1 = Math.max(pa, pb);
    let first = -1;
    let last = -1;
    for (let j = 0; j < n; j++) {
      if (items[j].sx + items[j].sw > p0 && items[j].sx < p1) {
        if (first < 0) first = j;
        last = j;
      }
    }
    return first < 0 ? null : span(first, last);
  };
  /** The bin whose slot holds px (binary search), else the nearest one within 12px. */
  const hitTest = (px: number, py: number): number | null => {
    if (py < L.plotTop - 2 || py > L.plotBottom + 2) return null;
    let a = 0;
    let b = n - 1;
    let k = -1;
    while (a <= b) {
      const m = (a + b) >> 1;
      if (items[m].sx <= px) {
        k = m;
        a = m + 1;
      } else {
        b = m - 1;
      }
    }
    if (k >= 0 && px < items[k].sx + items[k].sw) return k;
    let best: number | null = null;
    let bestDistance = 12;
    for (const c of [k, k + 1]) {
      if (c < 0 || c >= n) continue;
      const distance = px < items[c].sx ? items[c].sx - px : px - (items[c].sx + items[c].sw);
      if (distance <= bestDistance) {
        bestDistance = distance;
        best = c;
      }
    }
    return best;
  };
  const local = (e: { clientX: number; clientY: number; currentTarget: Element }): [number, number] => {
    const box = e.currentTarget.getBoundingClientRect();
    return [e.clientX - box.left, e.clientY - box.top];
  };
  const clampPx = (px: number) => Math.min(L.plotRight, Math.max(L.plotLeft, px));
  const track = (px: number, py: number) => {
    const j = hitTest(px, py);
    if (j == null) {
      setHover(null);
      hide();
      return;
    }
    setHover(j);
    show(px, py, binTip(j));
  };

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    swallowClick.current = false;
    const svg = e.currentTarget;
    // The pointer takes over from the keyboard: drop focus (and its ring) from any bin.
    const focusedEl = document.activeElement;
    if (focusedEl instanceof SVGElement && focusedEl !== svg && svg.contains(focusedEl)) focusedEl.blur();
    if (!e.isPrimary || e.button !== 0) return;
    const [px, py] = local(e);
    const inPlot = px >= L.plotLeft - 4 && px <= L.plotRight + 4 && py >= L.plotTop - 4 && py <= L.plotBottom + 4;
    press.current = inPlot ? { id: e.pointerId, x: clampPx(px), moved: false } : null;
    if (inPlot && brushable) {
      try {
        svg.setPointerCapture(e.pointerId);
      } catch {
        // The pointer is already gone; the drag simply ends at the edge.
      }
    }
    if (e.pointerType !== "mouse") track(px, py); // touch has no hover: show the bin under the finger
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const [px, py] = local(e);
    const p = press.current;
    if (brushable && p && p.id === e.pointerId && (p.moved || Math.abs(px - p.x) >= DRAG_PX)) {
      if (!p.moved) press.current = { ...p, moved: true };
      const to = clampPx(px);
      setDrag({ from: p.x, to });
      setHover(null);
      const s = snap(p.x, to);
      if (s) show(px, py, spanTip(s));
      else hide();
      return;
    }
    track(px, py);
  };
  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const p = press.current;
    press.current = null;
    if (!brushable || !p || p.id !== e.pointerId || !p.moved) return;
    const s = snap(p.x, clampPx(local(e)[0]));
    setDrag(null);
    hide();
    swallowClick.current = true; // the click that ends a drag is not a "clear"
    onBrush?.(s ? s.range : null);
  };
  const onPointerCancel = () => {
    press.current = null;
    setDrag(null);
    setHover(null);
    hide();
  };
  const onPointerLeave = () => {
    if (press.current?.moved) return; // a captured drag keeps its band and readout
    setHover(null);
    hide();
  };
  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    if (swallowClick.current) {
      swallowClick.current = false;
      return;
    }
    // Clicks a screen reader dispatches land on a bin's hit target; pointer clicks use x.
    let j = readIndex(e.target);
    if (j == null && e.detail > 0) {
      const [px, py] = local(e);
      j = hitTest(px, py);
    }
    if (j != null && j < n && onBinClick) {
      onBinClick(items[j].bin);
      return;
    }
    if (brushable) {
      anchor.current = null;
      onBrush?.(null);
    }
  };

  const showFocusTip = (j: number) => {
    const it = items[j];
    const from = anchor.current;
    show(it.cx + it.cw / 2, it.top, from != null && from !== j ? spanTip(span(from, j)) : binTip(j));
  };
  const focusBin = (j: number) => {
    svgRef.current?.querySelector<SVGElement>(`[data-i="${j}"]`)?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<SVGSVGElement>) => {
    const j = readIndex(e.target);
    if (j == null || j >= n) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (onBinClick) {
        onBinClick(items[j].bin);
      } else if (brushable) {
        anchor.current = j;
        onBrush?.(span(j, j).range);
      }
      return;
    }
    if (e.key === "Escape") {
      anchor.current = null;
      if (brushable) onBrush?.(null);
      setHover(null);
      hide();
      return;
    }
    const next = keyTarget(e.key, j, n);
    if (next == null) return;
    e.preventDefault();
    if (e.shiftKey && brushable) {
      if (anchor.current == null) anchor.current = j;
      onBrush?.(span(anchor.current, next).range);
    } else {
      anchor.current = null;
    }
    if (next === j) showFocusTip(j);
    else focusBin(next);
  };
  const onFocus = (e: FocusEvent<SVGSVGElement>) => {
    const j = readIndex(e.target);
    if (j == null || j >= n) return;
    setActive(j);
    setFocused(j);
    setHover(null); // one current bin: the keyboard's, until the pointer moves again
    showFocusTip(j);
  };
  const onBlur = (e: FocusEvent<SVGSVGElement>) => {
    if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
    anchor.current = null;
    setFocused(null);
    hide();
  };

  const hovered = hover != null && hover < n && !drag ? items[hover] : null;
  const ring = focused != null && focused < n ? items[focused] : null;
  const ringW = ring ? Math.max(ring.sw + 2, 8) : 0;
  let band: { x: number; w: number } | null = null;
  if (drag) {
    const s = snap(drag.from, drag.to);
    const a = s ? L.x(Math.max(s.range[0], L.lo)) : Math.min(drag.from, drag.to);
    const b = s ? L.x(Math.min(s.range[1], L.hi)) : Math.max(drag.from, drag.to);
    band = { x: a, w: Math.max(1, b - a) };
  }

  const sel = toRange(selLo, selHi);
  let selFirst = -1;
  let selLast = -1;
  if (sel) {
    for (let j = 0; j < n; j++) {
      if (items[j].mid >= sel[0] && items[j].mid <= sel[1]) {
        if (selFirst < 0) selFirst = j;
        selLast = j;
      }
    }
  }
  const keys = interactive
    ? ` Arrow keys move between bins${onBinClick ? "; Enter opens one" : ""}${
        brushable ? "; Shift+arrows select a range, Escape clears it" : ""
      }.`
    : "";
  const ariaLabel = `${summary ?? `${L.description}${selFirst >= 0 ? ` Selected: ${L.spanLabel(selFirst, selLast)}.` : ""}`}${keys}`;

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        className={brushable ? "block select-none" : "block"}
        style={{
          cursor: onBinClick ? "pointer" : brushable ? "crosshair" : undefined,
          touchAction: brushable ? "pan-y" : undefined,
        }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onMouseDown={interactive ? preventDefault : undefined}
        onClick={onClick}
        onKeyDown={interactive ? onKeyDown : undefined}
        onFocus={interactive ? onFocus : undefined}
        onBlur={interactive ? onBlur : undefined}
      >
        {chrome?.back}
        {hovered && (
          <rect
            x={round2(hovered.sx)}
            y={L.plotTop}
            width={round2(Math.max(hovered.sw, 2))}
            height={plotH}
            fill="var(--ink)"
            fillOpacity={0.06}
            pointerEvents="none"
          />
        )}
        {columns}
        {hovered?.d ? <path d={hovered.d} fill="var(--surface)" fillOpacity={0.2} pointerEvents="none" /> : null}
        {chrome?.front}
        {band && (
          <rect
            x={round2(band.x)}
            y={L.plotTop}
            width={round2(band.w)}
            height={plotH}
            fill="var(--ink)"
            fillOpacity={0.1}
            pointerEvents="none"
          />
        )}
        {ring && (
          <rect
            x={round2(ring.sx + ring.sw / 2 - ringW / 2)}
            y={L.plotTop - 2}
            width={round2(ringW)}
            height={plotH + 4}
            rx={3}
            fill="none"
            stroke="var(--focus)"
            strokeWidth={2}
            pointerEvents="none"
          />
        )}
        {hits}
      </svg>
      <TooltipLayer tip={tip} width={width} height={height} />
    </>
  );
}
