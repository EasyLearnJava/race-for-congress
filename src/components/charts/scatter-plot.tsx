"use client";

// Scatter plot: one dot per race (or candidate, or state) on two numeric axes, built for the
// densest case on the site (all 435 House seats). One delegated pointer handler serves every
// dot and finds the nearest one within 18px, so nobody has to land on an 8px target. Dots with
// an href are real links; the chart is a single tab stop and the arrow keys move between dots.
// Optional rectangle brushing reports the ids inside it, and a selection dims everything else.
import { scaleLinear, type ScaleLinear } from "d3-scale";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  memo,
  useMemo,
  useRef,
  useState,
  type DragEvent as ReactDragEvent,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { fmtCompact } from "@/lib/format";
import { RefLine, XAxis, YAxis } from "./axes";
import { TipRow, TipTitle, TooltipLayer, type TipState } from "./tooltip";

/** One dot. Points whose x or y is null or not a finite number are skipped. */
export interface ScatterPoint {
  /** Unique, stable id (e.g. a district id such as "PA-07"); keys selection, labels and callbacks. */
  id: string;
  /** Horizontal value. */
  x: number | null;
  /** Vertical value. */
  y: number | null;
  /** Fill as a CSS color token, e.g. "var(--dem)" or RATING_COLOR[rating]. Never a raw hex. */
  color: string;
  /** Display name for the tooltip title, the accessible label and the direct label. Defaults to the id. */
  label?: string;
  /** Destination when the dot is activated: the dot renders as a link (client-side navigation). */
  href?: string;
  /** Dot radius in px, for bubble-style charts. Default 4 (an 8px dot); clamped to 4..24. */
  size?: number;
}

/** A reference line at a data value: `x` draws a vertical line, `y` a horizontal one. */
export interface ScatterRefLine {
  x?: number;
  y?: number;
  /** Short label, e.g. "Even". Vertical lines are labelled above the plot, horizontal ones at the right end. */
  label?: string;
}

export interface ScatterPlotProps {
  /** Width in px: the value ChartFrame passes to its render prop. */
  width: number;
  /** Height in px of the whole chart, axes included: pass the same value as ChartFrame's `height`. */
  height: number;
  points: ScatterPoint[];
  /** Fixed x domain. Default: the extent of the data (and of any reference lines), padded 5% on each side. */
  xDomain?: [number, number];
  /** Fixed y domain. Default: the padded extent, as for x. */
  yDomain?: [number, number];
  /** Put larger x values on the left. Use it for D-minus-R margins so Democrats stay on the left. */
  xReverse?: boolean;
  /** X-axis title; also used in the default tooltip and the accessible labels. */
  xLabel: string;
  /** Y-axis title, written above the plot; also used in the default tooltip and the accessible labels. */
  yLabel: string;
  /** Formats x values for ticks and the default tooltip, e.g. `(v) => fmtMargin(v, 0)`. Default: compact number. */
  xFormat?: (v: number) => string;
  /** Formats y values for ticks and the default tooltip. Default: compact number. */
  yFormat?: (v: number) => string;
  /** Reference lines, e.g. `[{ x: 0, label: "Even" }, { y: 0 }]`. Lines outside the domain are skipped. */
  refLines?: ScatterRefLine[];
  /** Draw the y = x line (before/after comparisons). Without explicit domains, both axes then share one domain. */
  diagonal?: boolean;
  /** Label written along the diagonal, e.g. "No change". */
  diagonalLabel?: string;
  /** Custom tooltip body for a point. Default: the name, then the x and y values. */
  tooltip?: (point: ScatterPoint) => ReactNode;
  /** Called when a dot is clicked or activated with Enter/Space. Dots with an `href` also navigate. */
  onPointClick?: (id: string) => void;
  /** Enable rectangle (drag) selection inside the plot. */
  brushable?: boolean;
  /** Ids inside a dragged rectangle, or null when cleared: Escape, a click on empty space, or a rectangle with no dots. */
  onBrush?: (ids: string[] | null) => void;
  /** When non-empty, other dots are dimmed to 25% opacity; selected dots keep their color and get an ink ring. */
  selectedIds?: ReadonlySet<string> | null;
  /** Ids to label directly, in priority order. Keep it to a few: a label that would collide is skipped. */
  labelIds?: string[];
  /** One dot to emphasize with a ring and a label (the current district, or the row hovered in a linked table). */
  highlightId?: string | null;
  /** Accessible name. Default: "Scatter plot of {yLabel} against {xLabel}, {n} points". */
  ariaLabel?: string;
}

const DOT_R = 4; // default radius: an 8px dot
const MAX_R = 24;
const RING = 2; // surface ring around every dot
const HIT = 18; // nearest-point search radius (a 36px target)
const DIM = 0.25;
const DRAG_MIN = 4; // px a press must travel before it becomes a brush
const TICK_PX = 10;
const TITLE_PX = 11;
const LABEL_PX = 11;
// Keyboard focus is drawn as an ink ring around the dot (plus the tooltip), not a box outline.
const NO_OUTLINE = { outline: "none" } as const;
const HALO = { stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round", paintOrder: "stroke" } as const;

type Anchor = "start" | "middle" | "end";

interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface Mark {
  /** Position in `marks` (data order); written to the dot as data-i. */
  i: number;
  id: string;
  p: ScatterPoint;
  x: number;
  y: number;
  px: number;
  py: number;
  r: number;
}

interface Placed {
  text: string;
  x: number;
  y: number;
  anchor: Anchor;
}

interface PlacedLabel extends Placed {
  id: string;
}

interface RefMark {
  key: string;
  vertical: boolean;
  /** Pixel x (vertical) or y (horizontal) of the line. */
  pos: number;
  label?: Placed;
}

interface Layout {
  plot: Box;
  sx: ScaleLinear<number, number>;
  sy: ScaleLinear<number, number>;
  xTicks: number[];
  yTicks: number[];
  xTitle: string;
  yTitle: string;
  marks: Mark[];
  refs: RefMark[];
  /** Boxes taken by reference-line labels inside the plot, which point labels must avoid. */
  reserved: Box[];
  diag: { x1: number; y1: number; x2: number; y2: number } | null;
}

interface LayoutInput {
  width: number;
  height: number;
  points: ScatterPoint[];
  xDomain?: [number, number];
  yDomain?: [number, number];
  xReverse: boolean;
  xLabel: string;
  yLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
  refLines?: ScatterRefLine[];
  diagonal: boolean;
}

interface Drag {
  pointer: number;
  x: number;
  y: number;
  moved: boolean;
}

export function ScatterPlot({
  width,
  height,
  points,
  xDomain,
  yDomain,
  xReverse = false,
  xLabel,
  yLabel,
  xFormat = fmtCompact,
  yFormat = fmtCompact,
  refLines,
  diagonal = false,
  diagonalLabel,
  tooltip,
  onPointClick,
  brushable = false,
  onBrush,
  selectedIds,
  labelIds,
  highlightId,
  ariaLabel,
}: ScatterPlotProps) {
  const router = useRouter();
  const [hoverId, setHoverId] = useState<string | null>(null);
  // The dot holding keyboard focus (only while focus is visible), and the chart's single tab stop.
  const [focusId, setFocusId] = useState<string | null>(null);
  const [rovingId, setRovingId] = useState<string | null>(null);
  // Escape hides the tooltip of the active dot until another dot becomes active.
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [brush, setBrush] = useState<Box | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const suppressClickRef = useRef(false);
  const keyboardRef = useRef(false);

  const layout = useMemo(
    () =>
      computeLayout({ width, height, points, xDomain, yDomain, xReverse, xLabel, yLabel, xFormat, yFormat, refLines, diagonal }),
    [width, height, points, xDomain, yDomain, xReverse, xLabel, yLabel, xFormat, yFormat, refLines, diagonal],
  );
  const { marks, plot } = layout;
  const byId = useMemo(() => new Map(marks.map((m) => [m.id, m] as const)), [marks]);
  const clickable = onPointClick != null;

  // Keyboard order: left to right, then top to bottom. Only dots that do something are focusable.
  const keyOrder = useMemo(
    () =>
      marks
        .filter((m) => m.p.href || clickable)
        .sort((a, b) => a.px - b.px || a.py - b.py)
        .map((m) => m.i),
    [marks, clickable],
  );
  const pointLabels = useMemo(
    () => marks.map((m) => `${m.p.label ?? m.id}. ${xLabel}: ${xFormat(m.x)}. ${yLabel}: ${yFormat(m.y)}`),
    [marks, xLabel, yLabel, xFormat, yFormat],
  );

  // While a rectangle is being dragged, it previews the selection it will make.
  const preview = useMemo(
    () => (brush ? new Set(marks.filter((m) => inBox(m, brush)).map((m) => m.id)) : null),
    [brush, marks],
  );
  const sel: ReadonlySet<string> | null = preview ?? (selectedIds && selectedIds.size > 0 ? selectedIds : null);

  const labels = useMemo(() => {
    const ids = highlightId ? [highlightId] : [];
    for (const id of labelIds ?? []) if (!ids.includes(id)) ids.push(id);
    return placeLabels(layout, byId, ids, width);
  }, [layout, byId, highlightId, labelIds, width]);
  const labelled = useMemo(() => new Set(labels.map((l) => l.id)), [labels]);

  const roving = rovingId != null ? byId.get(rovingId) : undefined;
  const tabStop = roving && (roving.p.href || clickable) ? roving.i : (keyOrder[0] ?? -1);

  // Dimmed dots first, then the rest, labelled dots above their neighbours, the highlight on top.
  // Memoized so that hovering re-renders only the overlay and the tooltip, never 450 dots.
  const dots = useMemo(() => {
    const dimmed = (m: Mark) => sel != null && !sel.has(m.id) && m.id !== highlightId;
    const tier = (m: Mark) => (m.id === highlightId ? 4 : (dimmed(m) ? 0 : 2) + (labelled.has(m.id) ? 1 : 0));
    return marks
      .slice()
      .sort((a, b) => tier(a) - tier(b) || a.i - b.i)
      .map((m) => (
        <Dot
          key={m.id}
          i={m.i}
          cx={m.px}
          cy={m.py}
          r={m.r}
          color={m.p.color}
          dim={dimmed(m)}
          selected={sel != null && sel.has(m.id)}
          href={m.p.href || undefined}
          button={clickable && !m.p.href}
          label={pointLabels[m.i]}
          tabbable={m.i === tabStop}
        />
      ));
  }, [marks, sel, highlightId, labelled, clickable, pointLabels, tabStop]);

  const chrome = useMemo(() => {
    const { plot: pl, sx, sy, xTicks, yTicks, refs, diag } = layout;
    return (
      <g pointerEvents="none">
        <YAxis scale={sy} ticks={yTicks} x={pl.x0} x1={pl.x1} format={yFormat} />
        <XAxis scale={sx} ticks={xTicks} y={pl.y1} x0={pl.x0} x1={pl.x1} format={xFormat} label={layout.xTitle} grid gridTop={pl.y0} />
        {layout.yTitle && (
          <text x={0} y={12} fill="var(--ink-2)" className="text-[11px]">
            {layout.yTitle}
          </text>
        )}
        {refs.map((r) =>
          r.vertical ? (
            <RefLine key={r.key} x={r.pos} y0={pl.y0} y1={pl.y1} />
          ) : (
            <RefLine key={r.key} y={r.pos} x0={pl.x0} x1={pl.x1} />
          ),
        )}
        {diag && <line x1={diag.x1} y1={diag.y1} x2={diag.x2} y2={diag.y2} stroke="var(--axis)" strokeWidth={1} />}
      </g>
    );
  }, [layout, xFormat, yFormat]);

  const activeId = brush ? null : (hoverId ?? focusId);
  const active = activeId != null ? byId.get(activeId) : undefined;
  const tip: TipState | null =
    active && active.id !== dismissedId
      ? {
          x: active.px,
          y: active.py,
          content: tooltip ? (
            tooltip(active.p)
          ) : (
            <DefaultTip m={active} xLabel={xLabel} yLabel={yLabel} xFormat={xFormat} yFormat={yFormat} />
          ),
        }
      : null;
  const hovered = hoverId != null ? byId.get(hoverId) : undefined;
  const highlight = highlightId != null ? byId.get(highlightId) : undefined;
  const diagText = layout.diag && diagonalLabel ? alongDiagonal(layout.diag, diagonalLabel) : null;

  // ---- Delegated event handlers: one set on the svg serves every dot. ----

  const markAt = (svg: SVGSVGElement, target: EventTarget | null, x: number, y: number) =>
    markOf(svg, target, marks) ?? nearest(marks, x, y);
  const clampToPlot = (x: number, y: number): [number, number] => [clamp(x, plot.x0, plot.x1), clamp(y, plot.y0, plot.y1)];

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>) => {
    keyboardRef.current = false;
    suppressClickRef.current = false;
    const [x, y] = localPoint(e);
    if (e.pointerType === "touch") {
      // No hover on touch: a tap shows the tooltip of the nearest dot.
      setHoverId(markAt(e.currentTarget, e.target, x, y)?.id ?? null);
      setDismissedId(null);
    }
    if (!brushable || !e.isPrimary || e.button !== 0) return;
    const [cx, cy] = clampToPlot(x, y);
    dragRef.current = { pointer: e.pointerId, x: cx, y: cy, moved: false };
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const [x, y] = localPoint(e);
    const drag = dragRef.current;
    if (drag && drag.pointer === e.pointerId) {
      if (!drag.moved && Math.hypot(x - drag.x, y - drag.y) >= DRAG_MIN) {
        drag.moved = true;
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // The pointer is already gone; the brush still follows the moves we receive.
        }
        setHoverId(null);
      }
      if (drag.moved) {
        const [cx, cy] = clampToPlot(x, y);
        setBrush(boxFrom(drag.x, drag.y, cx, cy));
        return;
      }
    }
    const id = markAt(e.currentTarget, e.target, x, y)?.id ?? null;
    if (id !== hoverId) {
      setHoverId(id);
      setDismissedId(null);
    }
  };

  const onPointerUp = (e: ReactPointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointer !== e.pointerId) return;
    dragRef.current = null;
    if (!drag.moved) return;
    suppressClickRef.current = true; // the click that ends a drag is not a click on a dot
    const [x, y] = localPoint(e);
    const [cx, cy] = clampToPlot(x, y);
    const box = boxFrom(drag.x, drag.y, cx, cy);
    setBrush(null);
    const ids = marks.filter((m) => inBox(m, box)).map((m) => m.id);
    onBrush?.(ids.length ? ids : null);
  };

  const onPointerCancel = () => {
    dragRef.current = null;
    setBrush(null);
  };

  const onPointerLeave = (e: ReactPointerEvent<SVGSVGElement>) => {
    // A lifted finger "leaves" too; keep a tapped tooltip until the next tap.
    if (e.pointerType !== "touch") setHoverId(null);
  };

  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const svg = e.currentTarget;
    const [x, y] = localPoint(e);
    const m = markAt(svg, e.target, x, y);
    if (!m || !(m.p.href || clickable)) {
      if (brushable) onBrush?.(null);
      return;
    }
    onPointClick?.(m.id);
    const href = m.p.href;
    // A click on the dot's own link is handled by next/link (and a modified click by the browser).
    const link = e.target instanceof Element ? e.target.closest("a") : null;
    if (!href || (link && svg.contains(link))) return;
    if (e.metaKey || e.ctrlKey) window.open(href, "_blank", "noopener");
    else router.push(href);
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    keyboardRef.current = true;
    if (e.key === "Escape") {
      dragRef.current = null;
      if (brush) setBrush(null);
      if (activeId) setDismissedId(activeId);
      if (brushable) onBrush?.(null);
      return;
    }
    const m = markOf(e.currentTarget, e.target, marks);
    if (!m) return;
    if (e.key === "Enter" || e.key === " ") {
      // Links activate natively (Enter fires a click); dots without a link act as buttons.
      if (!m.p.href && onPointClick) {
        e.preventDefault();
        onPointClick(m.id);
      }
      return;
    }
    const next = step(keyOrder, marks, m.i, e.key);
    if (next == null) return;
    e.preventDefault();
    if (next !== m.i) e.currentTarget.querySelector<SVGElement>(`[data-i="${next}"]`)?.focus();
  };

  const onFocus = (e: ReactFocusEvent<SVGSVGElement>) => {
    const m = markOf(e.currentTarget, e.target, marks);
    if (!m) return;
    setRovingId(m.id);
    if (keyboardRef.current || isFocusVisible(e.target)) {
      setFocusId(m.id);
      setDismissedId(null);
    }
  };

  const onBlur = (e: ReactFocusEvent<SVGSVGElement>) => {
    const next = e.relatedTarget;
    const stays = next instanceof Element && e.currentTarget.contains(next) && next.closest("[data-i]") != null;
    if (!stays) setFocusId(null);
  };

  const onDragStart = (e: ReactDragEvent<SVGSVGElement>) => {
    // Dragging from a dot draws a rectangle instead of dragging the link's URL.
    if (brushable) e.preventDefault();
  };

  const name = ariaLabel ?? `Scatter plot of ${yLabel} against ${xLabel}, ${marks.length} ${marks.length === 1 ? "point" : "points"}`;

  if (!marks.length) {
    return (
      <>
        <svg width={width} height={height} role="img" aria-label={`${ariaLabel ?? `Scatter plot of ${yLabel} against ${xLabel}`}: no data`} className="block">
          <text x={width / 2} y={height / 2} textAnchor="middle" dominantBaseline="central" fill="var(--muted)" className="text-xs">
            No data
          </text>
        </svg>
        <TooltipLayer tip={null} width={width} height={height} />
      </>
    );
  }

  const selectedCount = sel ? marks.reduce((n, m) => n + (sel.has(m.id) ? 1 : 0), 0) : 0;
  const svgLabel = `${name}${sel ? `, ${selectedCount} selected` : ""}${keyOrder.length ? ". Arrow keys move between points" : ""}`;
  const cursor = brush
    ? "crosshair"
    : hovered && (hovered.p.href || clickable)
      ? "pointer"
      : brushable
        ? "crosshair"
        : undefined;

  return (
    <>
      <svg
        width={width}
        height={height}
        // Interactive dots must stay in the accessibility tree, which role="img" would hide.
        role={keyOrder.length ? "group" : "img"}
        aria-label={svgLabel}
        // Focusable by script and click (not Tab) so Escape can clear a brush drawn with the mouse.
        tabIndex={brushable ? -1 : undefined}
        className={brushable ? "block select-none" : "block"}
        style={{ cursor, touchAction: brushable ? "pan-y pinch-zoom" : undefined }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
        onDragStart={onDragStart}
      >
        {chrome}
        <g>{dots}</g>
        <g pointerEvents="none">
          {highlight && (
            <circle cx={highlight.px} cy={highlight.py} r={highlight.r + RING + 1} fill="none" stroke="var(--ink)" strokeWidth={2} />
          )}
          <g className="text-[10px] font-semibold">
            {layout.refs.map(
              (r) =>
                r.label && (
                  <text key={r.key} x={r.label.x} y={r.label.y} textAnchor={r.label.anchor} fill="var(--ink)" {...HALO}>
                    {r.label.text}
                  </text>
                ),
            )}
            {diagText && (
              <text transform={diagText.transform} textAnchor={diagText.anchor} dy="-0.45em" fill="var(--ink)" {...HALO}>
                {diagonalLabel}
              </text>
            )}
          </g>
          <g className="text-[11px] font-semibold">
            {labels.map((l) => {
              const faded = sel != null && !sel.has(l.id) && l.id !== highlightId;
              return (
                <text key={l.id} x={l.x} y={l.y} textAnchor={l.anchor} fill="var(--ink)" opacity={faded ? 0.5 : undefined} {...HALO}>
                  {l.text}
                </text>
              );
            })}
          </g>
        </g>
        {brush && (
          <rect
            x={brush.x0}
            y={brush.y0}
            width={brush.x1 - brush.x0}
            height={brush.y1 - brush.y0}
            fill="var(--ink)"
            fillOpacity={0.08}
            stroke="var(--ink-2)"
            strokeWidth={1}
            pointerEvents="none"
          />
        )}
        {active && (
          // The active dot lifts: drawn on top, one pixel larger, with an ink ring.
          <g pointerEvents="none">
            <circle cx={active.px} cy={active.py} r={active.r + 1} fill={active.p.color} stroke="var(--surface)" strokeWidth={RING * 2} paintOrder="stroke" />
            <circle cx={active.px} cy={active.py} r={active.r + 1 + RING + 1} fill="none" stroke="var(--ink)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <TooltipLayer tip={tip} width={width} height={height} />
    </>
  );
}

interface DotProps {
  i: number;
  cx: number;
  cy: number;
  r: number;
  color: string;
  dim: boolean;
  selected: boolean;
  href?: string;
  /** Activatable without a link: rendered with role="button". */
  button: boolean;
  label: string;
  /** The chart's single tab stop (roving tabindex). */
  tabbable: boolean;
}

/** One dot: an 8px fill with a 2px surface ring (painted under the fill), plus an ink ring when selected. */
const Dot = memo(function Dot({ i, cx, cy, r, color, dim, selected, href, button, label, tabbable }: DotProps) {
  const body = (
    <>
      <circle
        cx={cx}
        cy={cy}
        r={r}
        fill={color}
        stroke="var(--surface)"
        strokeWidth={RING * 2}
        paintOrder="stroke"
        opacity={dim ? DIM : undefined}
      />
      {selected && <circle cx={cx} cy={cy} r={r + RING + 0.75} fill="none" stroke="var(--ink)" strokeWidth={1.5} />}
    </>
  );
  if (href) {
    return (
      <Link href={href} prefetch={false} data-i={i} aria-label={label} tabIndex={tabbable ? 0 : -1} style={NO_OUTLINE}>
        {body}
      </Link>
    );
  }
  if (button) {
    return (
      <g data-i={i} role="button" aria-label={label} tabIndex={tabbable ? 0 : -1} style={NO_OUTLINE}>
        {body}
      </g>
    );
  }
  return <g data-i={i}>{body}</g>;
});

function DefaultTip({
  m,
  xLabel,
  yLabel,
  xFormat,
  yFormat,
}: {
  m: Mark;
  xLabel: string;
  yLabel: string;
  xFormat: (v: number) => string;
  yFormat: (v: number) => string;
}) {
  return (
    <>
      <TipTitle>{m.p.label ?? m.id}</TipTitle>
      <TipRow color={m.p.color} label={xLabel} value={xFormat(m.x)} />
      <TipRow label={yLabel} value={yFormat(m.y)} />
      {m.p.href && <div className="mt-1 text-[11px] text-muted">Click to open</div>}
    </>
  );
}

// ---- Layout (pure) ----

function computeLayout(o: LayoutInput): Layout {
  const { width, height, xFormat, yFormat } = o;
  const refLines = o.refLines ?? [];

  // Usable points: finite x and y, first occurrence of each id.
  const seen = new Set<string>();
  const valid: { p: ScatterPoint; x: number; y: number }[] = [];
  for (const p of o.points) {
    const { x, y } = p;
    if (x == null || y == null || !Number.isFinite(x) || !Number.isFinite(y) || seen.has(p.id)) continue;
    seen.add(p.id);
    valid.push({ p, x, y });
  }

  // Rows above the plot: the y-axis title, then labels of vertical reference lines.
  const vLabels = refLines.some((r) => isNum(r.x) && !!r.label);
  const top = (o.yLabel ? 18 : 0) + (vLabels ? 14 : 0) + 6;
  const bottom = o.xLabel ? 38 : 22;
  const plotH = Math.max(10, height - top - bottom);

  // Domains: explicit, or the padded extent of the data plus any reference values.
  const xs = valid.map((v) => v.x);
  const ys = valid.map((v) => v.y);
  for (const r of refLines) {
    if (isNum(r.x)) xs.push(r.x);
    if (isNum(r.y)) ys.push(r.y);
  }
  const ownX = okDomain(o.xDomain);
  const ownY = okDomain(o.yDomain);
  const shared = o.diagonal && !ownX && !ownY ? padded(xs.concat(ys)) : null;
  const xDom = ownX ?? shared ?? padded(xs);
  const yDom = ownY ?? shared ?? padded(ys);

  const sy = scaleLinear().domain(yDom).range([top + plotH, top]);
  const yTicks = sy.ticks(clamp(Math.round(plotH / 50), 2, 8));
  const yTickW = yTicks.reduce((w, t) => Math.max(w, textWidth(yFormat(t), TICK_PX)), 0);

  // Horizontal space: y tick labels on the left; x tick labels thinned until they fit and kept
  // inside the svg at both ends.
  let left = Math.ceil(yTickW) + 10;
  let right = 12;
  let plotW = Math.max(10, width - left - right);
  const sx = scaleLinear().domain(xDom);
  const widest = (ts: number[]) => ts.reduce((w, t) => Math.max(w, textWidth(xFormat(t), TICK_PX)), 0);
  let count = clamp(Math.round(plotW / 72), 2, 10);
  let xTicks = sx.ticks(count);
  while (count > 2 && xTicks.length * (widest(xTicks) + 12) > plotW) {
    count -= 1;
    xTicks = sx.ticks(count);
  }
  const [d0, d1] = o.xReverse ? [xDom[1], xDom[0]] : xDom;
  for (const t of xTicks) {
    const f = (t - d0) / (d1 - d0); // 0 at the left edge of the plot, 1 at the right
    const half = textWidth(xFormat(t), TICK_PX) / 2;
    left = Math.max(left, Math.ceil(half + 1 - f * plotW));
    right = Math.max(right, Math.ceil(half + 1 - (1 - f) * plotW));
  }
  plotW = Math.max(10, width - left - right);
  sx.range(o.xReverse ? [left + plotW, left] : [left, left + plotW]);
  const plot: Box = { x0: left, y0: top, x1: left + plotW, y1: top + plotH };

  // Marks inside the domain (an explicit domain may leave some out).
  const [xlo, xhi] = ordered(xDom);
  const [ylo, yhi] = ordered(yDom);
  const inX = (v: number) => v >= xlo - (xhi - xlo) * 1e-9 && v <= xhi + (xhi - xlo) * 1e-9;
  const inY = (v: number) => v >= ylo - (yhi - ylo) * 1e-9 && v <= yhi + (yhi - ylo) * 1e-9;
  const marks: Mark[] = [];
  for (const v of valid) {
    if (!inX(v.x) || !inY(v.y)) continue;
    const s = v.p.size;
    const r = s != null && Number.isFinite(s) ? clamp(s, DOT_R, MAX_R) : DOT_R;
    marks.push({ i: marks.length, id: v.p.id, p: v.p, x: v.x, y: v.y, px: round1(sx(v.x)), py: round1(sy(v.y)), r });
  }

  // Reference lines. A line given both x and y carries its label on the vertical line only.
  const refs: RefMark[] = [];
  const reserved: Box[] = [];
  refLines.forEach((rl, k) => {
    const vx = isNum(rl.x) && inX(rl.x) ? rl.x : null;
    const vy = isNum(rl.y) && inY(rl.y) ? rl.y : null;
    if (vx != null) {
      const X = round1(sx(vx));
      let label: Placed | undefined;
      if (rl.label) {
        const half = textWidth(rl.label, TICK_PX) * 0.55;
        label = { text: rl.label, x: clamp(X, half + 1, width - half - 1), y: top - 4, anchor: "middle" };
      }
      refs.push({ key: `x${k}`, vertical: true, pos: X, label });
    }
    if (vy != null) {
      const Y = round1(sy(vy));
      let label: Placed | undefined;
      if (rl.label && vx == null) {
        const w = textWidth(rl.label, TICK_PX) * 1.1;
        const ly = Y - 13 < top ? Y + 12 : Y - 4; // above the line, or below it at the very top
        label = { text: rl.label, x: plot.x1 - 2, y: ly, anchor: "end" };
        reserved.push({ x0: plot.x1 - 2 - w, y0: ly - 9, x1: plot.x1, y1: ly + 3 });
      }
      refs.push({ key: `y${k}`, vertical: false, pos: Y, label });
    }
  });

  let diag: Layout["diag"] = null;
  if (o.diagonal) {
    const lo = Math.max(xlo, ylo);
    const hi = Math.min(xhi, yhi);
    if (lo < hi) diag = { x1: round1(sx(lo)), y1: round1(sy(lo)), x2: round1(sx(hi)), y2: round1(sy(hi)) };
  }

  return {
    plot,
    sx,
    sy,
    xTicks,
    yTicks,
    xTitle: fit(o.xLabel, width - 8, TITLE_PX),
    yTitle: fit(o.yLabel, width - 4, TITLE_PX),
    marks,
    refs,
    reserved,
    diag,
  };
}

/**
 * Direct labels in priority order. Each tries eight spots around its dot and takes the one that
 * covers the fewest other dots; it is skipped if every spot leaves the plot, overlaps a label
 * already placed, or covers another labelled dot.
 */
function placeLabels(layout: Layout, byId: Map<string, Mark>, ids: string[], width: number): PlacedLabel[] {
  const { marks, plot } = layout;
  const bounds: Box = { x0: plot.x0, y0: plot.y0, x1: width - 2, y1: plot.y1 };
  const anchors: Mark[] = [];
  for (const id of ids) {
    const m = byId.get(id);
    if (m) anchors.push(m);
  }
  const taken = layout.reserved.slice();
  const out: PlacedLabel[] = [];
  for (const m of anchors) {
    const text = m.p.label ?? m.id;
    const w = textWidth(text, LABEL_PX) * 1.06 + 2;
    const g = m.r + RING + 3;
    const d = Math.round(g * 0.8);
    const spots: [number, number, Anchor][] = [
      [m.px + g, m.py + 4, "start"],
      [m.px - g, m.py + 4, "end"],
      [m.px, m.py - g - 1, "middle"],
      [m.px, m.py + g + 9, "middle"],
      [m.px + d, m.py - d - 1, "start"],
      [m.px - d, m.py - d - 1, "end"],
      [m.px + d, m.py + d + 9, "start"],
      [m.px - d, m.py + d + 9, "end"],
    ];
    let best: (Placed & { box: Box }) | null = null;
    let bestCost = Infinity;
    for (let k = 0; k < spots.length; k++) {
      const [x, y, anchor] = spots[k];
      const x0 = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
      const box: Box = { x0, y0: y - 9, x1: x0 + w, y1: y + 3 };
      if (box.x0 < bounds.x0 || box.x1 > bounds.x1 || box.y0 < bounds.y0 || box.y1 > bounds.y1) continue;
      if (taken.some((t) => overlaps(t, box, 2))) continue;
      if (anchors.some((a) => a !== m && dotTouches(a, box))) continue;
      let cost = k * 0.1; // earlier spots win ties
      for (const o of marks) if (o !== m && dotTouches(o, box)) cost += 1;
      if (cost < bestCost) {
        bestCost = cost;
        best = { text, x, y, anchor, box };
      }
    }
    if (best) {
      taken.push(best.box);
      out.push({ id: m.id, text, x: best.x, y: best.y, anchor: best.anchor });
    }
  }
  return out;
}

/** Position for a label read left to right along the diagonal, near its upper end. */
function alongDiagonal(d: NonNullable<Layout["diag"]>, text: string): { transform: string; anchor: Anchor } | null {
  const [a, b] = d.x1 <= d.x2 ? [[d.x1, d.y1], [d.x2, d.y2]] : [[d.x2, d.y2], [d.x1, d.y1]];
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len < textWidth(text, TICK_PX) + 24) return null;
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  const rightIsUpper = b[1] <= a[1];
  const inset = 10 / len;
  const [px, py] = rightIsUpper ? [b[0] - dx * inset, b[1] - dy * inset] : [a[0] + dx * inset, a[1] + dy * inset];
  return { transform: `translate(${round1(px)},${round1(py)}) rotate(${round1(angle)})`, anchor: rightIsUpper ? "end" : "start" };
}

// ---- Interaction helpers ----

/** Pointer position relative to the svg (and to ChartFrame's plot container). */
function localPoint(e: { clientX: number; clientY: number; currentTarget: Element }): [number, number] {
  const b = e.currentTarget.getBoundingClientRect();
  return [e.clientX - b.left, e.clientY - b.top];
}

/** The dot an event target belongs to (exact hits respect drawing order). */
function markOf(svg: SVGSVGElement, target: EventTarget | null, marks: Mark[]): Mark | undefined {
  const el = target instanceof Element ? target.closest("[data-i]") : null;
  if (!el || !svg.contains(el)) return undefined;
  return marks[Number(el.getAttribute("data-i"))];
}

/** The nearest dot whose center is within reach of (x, y): 18px, or the dot's own radius plus its ring. */
function nearest(marks: Mark[], x: number, y: number): Mark | undefined {
  let best: Mark | undefined;
  let bestD = Infinity;
  for (const m of marks) {
    const reach = Math.max(HIT, m.r + RING + 2);
    const dx = m.px - x;
    if (dx > reach || dx < -reach) continue;
    const dy = m.py - y;
    if (dy > reach || dy < -reach) continue;
    const dist = dx * dx + dy * dy;
    if (dist <= reach * reach && dist < bestD) {
      bestD = dist;
      best = m;
    }
  }
  return best;
}

/** Roving focus: Left/Right walk the dots in x order, Up/Down jump to the nearest dot above/below. */
function step(order: number[], marks: Mark[], from: number, key: string): number | null {
  if (!order.length) return null;
  const k = order.indexOf(from);
  switch (key) {
    case "ArrowRight":
      return order[Math.min(order.length - 1, k + 1)];
    case "ArrowLeft":
      return order[Math.max(0, k - 1)];
    case "Home":
      return order[0];
    case "End":
      return order[order.length - 1];
    case "ArrowUp":
    case "ArrowDown": {
      const a = marks[from];
      let best = from;
      let bestScore = Infinity;
      for (const i of order) {
        const b = marks[i];
        const dy = key === "ArrowUp" ? a.py - b.py : b.py - a.py;
        if (dy <= 0) continue;
        const score = dy + 2 * Math.abs(b.px - a.px);
        if (score < bestScore) {
          bestScore = score;
          best = i;
        }
      }
      return best;
    }
    default:
      return null;
  }
}

function isFocusVisible(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

// ---- Small geometry and text helpers ----

function isNum(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function ordered(d: [number, number]): [number, number] {
  return d[0] <= d[1] ? d : [d[1], d[0]];
}

function okDomain(d: [number, number] | undefined): [number, number] | null {
  return d && isNum(d[0]) && isNum(d[1]) && d[0] !== d[1] ? [d[0], d[1]] : null;
}

/** Extent padded 5% on each side; a single value gets room around it. */
function padded(values: number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  if (!(lo <= hi)) return [0, 1];
  if (lo === hi) {
    const d = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= d;
    hi += d;
  }
  const pad = (hi - lo) * 0.05;
  return [lo - pad, hi + pad];
}

function boxFrom(x0: number, y0: number, x1: number, y1: number): Box {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

function inBox(m: Mark, b: Box): boolean {
  return m.px >= b.x0 && m.px <= b.x1 && m.py >= b.y0 && m.py <= b.y1;
}

function overlaps(a: Box, b: Box, pad: number): boolean {
  return a.x0 < b.x1 + pad && b.x0 < a.x1 + pad && a.y0 < b.y1 + pad && b.y0 < a.y1 + pad;
}

function dotTouches(m: Mark, b: Box): boolean {
  const dx = m.px - clamp(m.px, b.x0, b.x1);
  const dy = m.py - clamp(m.py, b.y0, b.y1);
  const r = m.r + 1;
  return dx * dx + dy * dy < r * r;
}

/** Approximate rendered width of Inter text, for layout decisions before anything is drawn. */
function textWidth(s: string, px: number): number {
  let em = 0;
  for (const ch of s) {
    if (ch >= "0" && ch <= "9") em += 0.6;
    else if (ch >= "a" && ch <= "z") em += "ijlft".includes(ch) ? 0.3 : ch === "m" || ch === "w" ? 0.82 : 0.55;
    else if (ch >= "A" && ch <= "Z") em += ch === "I" ? 0.3 : ch === "M" || ch === "W" ? 0.88 : 0.68;
    else if (" .,:;'|!".includes(ch)) em += 0.28;
    else if ("%—@".includes(ch)) em += 0.9;
    else em += 0.6;
  }
  return em * px;
}

/** Shorten text with an ellipsis until it fits maxW (empty when nothing fits). */
function fit(text: string, maxW: number, px: number): string {
  if (textWidth(text, px) <= maxW) return text;
  let s = text;
  while (s.length > 1 && textWidth(`${s}…`, px) > maxW) s = s.slice(0, -1);
  return s.length > 1 ? `${s.trimEnd()}…` : "";
}
