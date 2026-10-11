"use client";

// Heatmap: a matrix of cells binned into the non-partisan magnitude ramp (--m-1..--m-6), for
// agreement matrices, cross-tabs and small grids of values. Cells sit on a pixel-snapped grid
// with a 2px surface gap. One delegated pointer handler hit-tests by position, so every cell
// owns half the gap around it and the tooltip never drops between cells. Clickable cells are
// buttons behind a single tab stop (roving tabindex; arrow keys move between cells).
import Link from "next/link";
import {
  memo,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

export interface HeatmapRow {
  /** Stable id, passed back to `value`, `tooltip` and `onCellClick`. */
  key: string;
  /**
   * Drawn left of the row. Truncated with an ellipsis (full text on hover) when longer than the
   * label column: 40% of the width, or more when the capped columns leave room.
   */
  label: string;
  /** Turns the row label into a link. */
  href?: string;
}

export interface HeatmapCol {
  /** Stable id, passed back to `value`, `tooltip` and `onCellClick`. */
  key: string;
  /** Drawn above the column; rotated (-45° or -90°) when neighboring labels would collide. */
  label: string;
}

export interface HeatmapProps {
  /** Plot width in px: the width ChartFrame passes to its render prop. */
  width: number;
  /**
   * Plot height in px. Omit it to size rows from the data (`heatmapHeight` returns that
   * height); when given, rows stretch or shrink to fill it.
   */
  height?: number;
  /** Matrix rows, top to bottom. */
  rows: readonly HeatmapRow[];
  /** Matrix columns, left to right. */
  cols: readonly HeatmapCol[];
  /** Value of one cell. null, NaN or an infinite value draws an empty "No data" cell (surface-2). */
  value: (rowKey: string, colKey: string) => number | null;
  /**
   * [low, high], cut into equal-width color classes; values outside it take the end class.
   * Pass it reversed ([high, low]) to make low values the dark end.
   */
  domain: readonly [number, number];
  /** Formats a value for the tooltip, the cell labels and the accessible summary. */
  format: (v: number) => string;
  /** Number of color classes, 2-6 (default 6), spread over var(--m-1)..var(--m-6). */
  classes?: number;
  /**
   * Print the values inside the cells. All or nothing: they appear only when every cell is at
   * least 26px wide and every formatted value fits its cell with padding (never clipped).
   * Meant for small matrices; otherwise the tooltip and ChartFrame's table carry the values.
   */
  cellLabel?: boolean;
  /**
   * Makes cells buttons: a click, Enter or Space calls this. The matrix becomes one tab stop;
   * arrow keys move between cells and Home/End jump to the ends of a row.
   */
  onCellClick?: (rowKey: string, colKey: string) => void;
  /** "skip" leaves cells whose row key equals their column key blank (symmetric matrices). Default "show". */
  diagonal?: "skip" | "show";
  /** Custom tooltip body for a cell. Default: the row label, then the column label and the value. */
  tooltip?: (rowKey: string, colKey: string, v: number | null) => ReactNode;
  /** Accessible name for the chart. Default: a summary of its size and its extremes. */
  ariaLabel?: string;
}

/** Props of HeatmapScaleLegend. */
export interface HeatmapScaleLegendProps {
  /** The same domain as the Heatmap: its ends label the low and high sides of the scale. */
  domain: readonly [number, number];
  /** The same class count as the Heatmap (2-6, default 6). */
  classes?: number;
  /** Formats the two domain ends. */
  format: (v: number) => string;
  /** Optional caption before the scale, e.g. "Agreement". */
  label?: ReactNode;
  /** When set, adds a swatch for empty cells with this label, e.g. "No data". */
  nullLabel?: ReactNode;
}

const GAP = 2; // surface gap between cells
const FONT = 11; // row and column labels
const CELL_FONT = 10; // values printed inside cells
const LINE = 14; // closest two rotated labels may sit, measured across their baselines
const PAD = 8; // between the row labels and the matrix
const EDGE = 2; // room for the hover ring outside the outermost cells
const MIN_ROW = 24; // auto row pitch floor, so rows stay >= 24px hit targets
const MAX_ROW = 40;
const MAX_ROW_MANY = 28; // tighter rows once a matrix has more than 20 rows
const MAX_COL = 120; // widest column pitch; a wide frame leaves air to the right of the matrix
const MAX_COL_LABEL = 132; // rotated column labels are truncated past this
const MIN_LABEL_CELL = 26; // narrowest cell that may carry a printed value
const EMPTY_HEIGHT = 80;
const SIN45 = Math.SQRT1_2;

type ColMode = "flat" | "diagonal" | "vertical";

interface Cell {
  r: number;
  c: number;
  /** Finite value, or null for an empty cell. */
  v: number | null;
  /** Ramp step 1-6 (var(--m-N)), or 0 for an empty cell. */
  step: number;
  /** Diagonal cell left blank. */
  skip: boolean;
}

interface Layout {
  /** Left edge of the first column; top edge of the first row. */
  left: number;
  top: number;
  pitchX: number;
  pitchY: number;
  gap: number;
  rx: number;
  colMode: ColMode;
  /** Label every nth column (vertical labels on very narrow columns). */
  colStep: number;
  rowText: string[];
  colText: string[];
  /** Pixel-snapped cell boxes: x and width per column, y and height per row. */
  xs: number[];
  ws: number[];
  ys: number[];
  hs: number[];
  gridW: number;
  gridH: number;
  height: number;
}

/**
 * A matrix of values colored in up to six classes of the magnitude ramp. Render it inside
 * ChartFrame's render prop and pass HeatmapScaleLegend to the frame's `legend`.
 *
 * @example
 * <ChartFrame title="How often forecasters agree" height={heatmapHeight(raters, raters, 640)}
 *   legend={<HeatmapScaleLegend domain={[0.5, 1]} format={fmtProb} />}>
 *   {(width) => (
 *     <Heatmap width={width} rows={raters} cols={raters} diagonal="skip" cellLabel
 *       value={(a, b) => agreement(a, b)} domain={[0.5, 1]} format={fmtProb} />
 *   )}
 * </ChartFrame>
 */
export function Heatmap({
  width,
  height,
  rows,
  cols,
  value,
  domain,
  format,
  classes,
  cellLabel = false,
  onCellClick,
  diagonal = "show",
  tooltip,
  ariaLabel,
}: HeatmapProps) {
  const { tip, show, hide } = useTooltip();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);
  // The one cell in the tab order (roving tabindex).
  const [cursor, setCursor] = useState<number | null>(null);

  const d0 = domain[0];
  const d1 = domain[1];
  const k = classCount(classes);
  const nR = rows.length;
  const nC = cols.length;
  const clickable = onCellClick != null;

  const L = useMemo(() => layoutHeatmap(rows, cols, width, height), [rows, cols, width, height]);

  const grid = useMemo(() => {
    const steps = rampSteps(k);
    const list: Cell[] = [];
    let first = -1;
    let lo = -1;
    let hi = -1;
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < cols.length; c++) {
        const i = list.length;
        const skip = diagonal === "skip" && rows[r].key === cols[c].key;
        const raw = skip ? null : value(rows[r].key, cols[c].key);
        const v = typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        list.push({ r, c, v, skip, step: v == null ? 0 : steps[binOf(v, d0, d1, k)] });
        if (!skip && first < 0) first = i;
        if (v != null && (lo < 0 || v < (list[lo].v ?? v))) lo = i;
        if (v != null && (hi < 0 || v > (list[hi].v ?? v))) hi = i;
      }
    }
    return { cells: list, first, lo, hi };
  }, [rows, cols, value, diagonal, d0, d1, k]);
  const cells = grid.cells;

  const live = (i: number | null): i is number => i != null && i >= 0 && i < cells.length && !cells[i].skip;
  const hot = live(hover) ? hover : live(focused) ? focused : null;
  const hotR = hot == null ? -1 : cells[hot].r;
  const hotC = hot == null ? -1 : cells[hot].c;
  const tabCell = live(cursor) ? cursor : grid.first;

  // The static layers stay memoized so hovering re-renders only labels, rings and the tooltip.
  const cellLayer = useMemo(
    () => (
      <g>
        {cells.map((cell, i) =>
          cell.skip ? null : (
            <rect
              key={i}
              data-i={i}
              x={L.xs[cell.c]}
              y={L.ys[cell.r]}
              width={L.ws[cell.c]}
              height={L.hs[cell.r]}
              rx={L.rx}
              fill={cell.step ? `var(--m-${cell.step})` : "var(--surface-2)"}
              {...(clickable
                ? {
                    role: "button",
                    tabIndex: i === tabCell ? 0 : -1,
                    "aria-label": `${rows[cell.r].label}, ${cols[cell.c].label}: ${cell.v == null ? "no data" : format(cell.v)}`,
                    // Focus is drawn by the ring overlay instead (it reads on every ramp step); the
                    // inline style outranks the global :focus-visible outline, a class would not.
                    style: { outline: "none" },
                  }
                : {})}
            />
          ),
        )}
      </g>
    ),
    [cells, L, clickable, tabCell, rows, cols, format],
  );

  const valueLayer = useMemo(() => {
    if (!cellLabel || cells.length === 0) return null;
    const minW = Math.min(...L.ws);
    const minH = Math.min(...L.hs);
    if (minW < MIN_LABEL_CELL || minH < CELL_FONT + 4) return null;
    const texts = cells.map((cell) => (cell.v == null ? null : format(cell.v)));
    // All or nothing: values on some cells and not others would read as missing data. A value
    // that cannot fit its cell with padding is never clipped; the tooltip and table carry it.
    if (texts.some((t) => t != null && textWidth(t, CELL_FONT) + 4 > minW)) return null;
    return (
      <g pointerEvents="none" aria-hidden fontSize={CELL_FONT} fontWeight={600} className="tabular-nums">
        {cells.map((cell, i) => {
          const text = texts[i];
          if (text == null) return null;
          return (
            <text
              key={i}
              x={L.xs[cell.c] + L.ws[cell.c] / 2}
              y={L.ys[cell.r] + L.hs[cell.r] / 2}
              dy="0.35em"
              textAnchor="middle"
              // Steps 4-6 are the dark end in light mode and the light end in dark mode (the
              // ramp flips), so they take the surface color: near-white, or near-black.
              fill={cell.step >= 4 ? "var(--surface)" : "var(--ink)"}
            >
              {text}
            </text>
          );
        })}
      </g>
    );
  }, [cellLabel, cells, L, format]);

  if (nR === 0 || nC === 0) {
    return (
      <svg width={width} height={L.height} role="img" aria-label={`${ariaLabel ?? "Heatmap"}: no data`} className="block">
        <text x={width / 2} y={L.height / 2} dy="0.35em" textAnchor="middle" fill="var(--muted)" fontSize={12}>
          No data
        </text>
      </svg>
    );
  }

  const tipContent = (i: number): ReactNode => {
    const cell = cells[i];
    const row = rows[cell.r];
    const col = cols[cell.c];
    if (tooltip) return tooltip(row.key, col.key, cell.v);
    return (
      <>
        <TipTitle>{row.label}</TipTitle>
        <TipRow label={col.label} value={cell.v == null ? "No data" : format(cell.v)} />
      </>
    );
  };
  const reveal = (i: number, x: number, y: number) => {
    const content = tipContent(i);
    if (content == null || content === false) hide();
    else show(x, y, content);
  };
  const center = (i: number) => {
    const { r, c } = cells[i];
    return { x: L.xs[c] + L.ws[c] / 2, y: L.ys[r] + L.hs[r] / 2 };
  };
  /** The cell under a pointer, by position: each cell owns half of the gap around it. */
  const pick = (e: { clientX: number; clientY: number; currentTarget: SVGSVGElement }) => {
    const box = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - box.left;
    const y = e.clientY - box.top;
    const c = Math.floor((x - L.left + L.gap / 2) / L.pitchX);
    const r = Math.floor((y - L.top + L.gap / 2) / L.pitchY);
    const i = r >= 0 && r < nR && c >= 0 && c < nC ? r * nC + c : null;
    return { i: live(i) ? i : null, x, y };
  };
  /** Next drawn cell from (r, c) stepping by (dr, dc), or null at the edge. */
  const scan = (r: number, c: number, dr: number, dc: number): number | null => {
    for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < nR && cc >= 0 && cc < nC; rr += dr, cc += dc) {
      if (!cells[rr * nC + cc].skip) return rr * nC + cc;
    }
    return null;
  };
  const activate = (i: number) => {
    const { r, c } = cells[i];
    onCellClick?.(rows[r].key, cols[c].key);
  };

  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>) => {
    const { i, x, y } = pick(e);
    setHover(i);
    if (i == null) hide();
    else reveal(i, x, y);
  };
  const onPointerLeave = (e: ReactPointerEvent<SVGSVGElement>) => {
    // A finger "leaves" as it lifts; the tap's click (below) decides what stays shown.
    if (e.pointerType === "touch") return;
    setHover(null);
    hide();
  };
  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    // Assistive tech clicks the cell element itself; pointer clicks land on the hit layer.
    const own = cellIndexOf(e.target);
    const hit = live(own) ? { i: own, ...center(own) } : pick(e);
    setHover(hit.i);
    if (hit.i == null) {
      hide(); // a tap off the matrix dismisses the tooltip
      return;
    }
    reveal(hit.i, hit.x, hit.y); // a tap on a touch screen shows the tooltip too
    if (clickable) activate(hit.i);
  };
  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    const i = cellIndexOf(e.target);
    if (!live(i)) return;
    const { r, c } = cells[i];
    let next: number | null;
    switch (e.key) {
      case "ArrowRight":
        next = scan(r, c, 0, 1);
        break;
      case "ArrowLeft":
        next = scan(r, c, 0, -1);
        break;
      case "ArrowDown":
        next = scan(r, c, 1, 0);
        break;
      case "ArrowUp":
        next = scan(r, c, -1, 0);
        break;
      case "Home":
        next = scan(r, -1, 0, 1);
        break;
      case "End":
        next = scan(r, nC, 0, -1);
        break;
      case "Enter":
      case " ":
        e.preventDefault();
        activate(i);
        return;
      case "Escape":
        hide();
        return;
      default:
        return;
    }
    e.preventDefault();
    if (next == null) return;
    setCursor(next);
    svgRef.current?.querySelector<SVGElement>(`[data-i="${next}"]`)?.focus();
  };
  const onFocus = (e: ReactFocusEvent<SVGSVGElement>) => {
    const i = cellIndexOf(e.target);
    if (!live(i)) return;
    setFocused(i);
    setCursor(i);
    const p = center(i);
    reveal(i, p.x, p.y);
  };
  const onBlur = (e: ReactFocusEvent<SVGSVGElement>) => {
    if (cellIndexOf(e.target) == null) return;
    setFocused(null);
    hide();
  };

  // Hovered or focused cell: an ink ring in the gap plus a surface hairline inside, so it
  // reads on every step of the ramp in both themes.
  const ring = (i: number, key: string) => {
    const { r, c } = cells[i];
    const x = L.xs[c];
    const y = L.ys[r];
    const w = L.ws[c];
    const h = L.hs[r];
    return (
      <g key={key} pointerEvents="none">
        <rect x={x - 1} y={y - 1} width={w + 2} height={h + 2} rx={L.rx + 1} fill="none" stroke="var(--ink)" strokeWidth={2} />
        {w > 2 && h > 2 && (
          <rect x={x + 0.5} y={y + 0.5} width={w - 1} height={h - 1} rx={Math.max(0, L.rx - 0.5)} fill="none" stroke="var(--surface)" strokeWidth={1} />
        )}
      </g>
    );
  };

  // Labels are memoized per row and column, so a hover re-renders only the two whose emphasis changes.
  const colLabels = cols.map((col, c) =>
    c % L.colStep !== 0 ? null : (
      <ColLabel
        key={c}
        label={col.label}
        text={L.colText[c]}
        x={L.xs[c] + L.ws[c] / 2}
        y={L.top - 6}
        mode={L.colMode}
        active={c === hotC}
      />
    ),
  );
  const rowLabels = rows.map((row, r) => (
    <RowLabel
      key={r}
      label={row.label}
      text={L.rowText[r]}
      href={row.href}
      x={L.left - PAD}
      y={L.ys[r] + L.hs[r] / 2}
      slotTop={L.ys[r] - L.gap / 2}
      slotWidth={Math.max(0, L.left - PAD / 2)}
      slotHeight={L.pitchY}
      active={r === hotR}
    />
  ));

  const interactive = clickable || rows.some((row) => row.href);
  const summary = ariaLabel ?? describe(rows, cols, cells, grid.lo, grid.hi, format, clickable);

  return (
    <>
      <svg
        ref={svgRef}
        width={width}
        height={L.height}
        // role="img" would hide the links and buttons inside from assistive tech.
        role={interactive ? "group" : "img"}
        aria-label={summary}
        className="block"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onBlur={onBlur}
      >
        <g fontSize={FONT} pointerEvents="none" aria-hidden>
          {colLabels}
        </g>
        <g fontSize={FONT}>{rowLabels}</g>
        {cellLayer}
        {valueLayer}
        {/* Hit layer: hover and click are resolved by position, gaps included. */}
        <rect
          x={L.left - L.gap / 2}
          y={L.top - L.gap / 2}
          width={L.gridW + L.gap}
          height={L.gridH + L.gap}
          fill="transparent"
          className={clickable && live(hover) ? "cursor-pointer" : undefined}
        />
        {live(hover) && ring(hover, "hover")}
        {live(focused) && focused !== hover && ring(focused, "focus")}
      </svg>
      <TooltipLayer tip={tip} width={width} height={L.height} />
    </>
  );
}

/** A column label: flat, diagonal or vertical; ink and semibold while its column is active. */
const ColLabel = memo(function ColLabel({
  label,
  text,
  x,
  y,
  mode,
  active,
}: {
  label: string;
  text: string;
  x: number;
  y: number;
  mode: ColMode;
  active: boolean;
}) {
  const fill = active ? "var(--ink)" : "var(--ink-2)";
  const weight = active ? 600 : 400;
  if (mode === "flat") {
    return (
      <text x={x} y={y} textAnchor="middle" fill={fill} fontWeight={weight}>
        {text}
      </text>
    );
  }
  return (
    <text transform={`translate(${x} ${y}) rotate(${mode === "diagonal" ? -45 : -90})`} dy="0.35em" fill={fill} fontWeight={weight}>
      {text}
      {text !== label && <title>{label}</title>}
    </text>
  );
});

/** A row label, right-aligned against the matrix; a link (with a full-row hit area) when it has an href. */
const RowLabel = memo(function RowLabel({
  label,
  text,
  href,
  x,
  y,
  slotTop,
  slotWidth,
  slotHeight,
  active,
}: {
  label: string;
  text: string;
  href?: string;
  x: number;
  y: number;
  slotTop: number;
  slotWidth: number;
  slotHeight: number;
  active: boolean;
}) {
  const body = (
    <text
      x={x}
      y={y}
      dy="0.35em"
      textAnchor="end"
      fill={active || href ? "var(--ink)" : "var(--ink-2)"}
      fontWeight={active ? 600 : href ? 500 : 400}
      className={href ? "group-hover:underline group-focus-visible:underline" : undefined}
    >
      {text}
      {text !== label && <title>{label}</title>}
    </text>
  );
  if (!href) return <g aria-hidden>{body}</g>;
  return (
    <Link href={href} aria-label={label} className="group">
      <rect x={0} y={slotTop} width={slotWidth} height={slotHeight} fill="transparent" />
      {body}
    </Link>
  );
});

/**
 * Scale key for a Heatmap, for ChartFrame's `legend` slot: the color classes from low to high
 * between the formatted domain ends, plus an optional swatch for empty cells.
 */
export function HeatmapScaleLegend({ domain, classes, format, label, nullLabel }: HeatmapScaleLegendProps) {
  const steps = rampSteps(classCount(classes));
  const lo = format(domain[0]);
  const hi = format(domain[1]);
  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
        {label != null && <span>{label}</span>}
        <span
          role="img"
          aria-label={`Color scale in ${steps.length} steps, from ${lo} to ${hi}`}
          className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 tabular-nums"
        >
          <span>{lo}</span>
          <span className="inline-flex gap-0.5">
            {steps.map((s) => (
              <span key={s} className="h-2.5 w-4 rounded-[2px]" style={{ background: `var(--m-${s})` }} />
            ))}
          </span>
          <span>{hi}</span>
        </span>
      </span>
      {nullLabel != null && (
        <span className="inline-flex items-center gap-1.5">
          <span
            aria-hidden
            className="h-2.5 w-4 rounded-[2px]"
            // Surface-2 nearly matches the card, so the key gets a hairline to show its extent.
            style={{ background: "var(--surface-2)", boxShadow: "inset 0 0 0 1px var(--border)" }}
          />
          {nullLabel}
        </span>
      )}
    </>
  );
}

/**
 * Height the Heatmap takes at `width` when its `height` prop is omitted: the column-label band
 * plus one row pitch per row. Use it for ChartFrame's `height` (call it from client code).
 */
export function heatmapHeight(rows: readonly HeatmapRow[], cols: readonly HeatmapCol[], width: number): number {
  return layoutHeatmap(rows, cols, width).height;
}

function layoutHeatmap(rows: readonly HeatmapRow[], cols: readonly HeatmapCol[], width: number, height?: number): Layout {
  const W = Number.isFinite(width) ? Math.max(0, width) : 0;
  const fixedH = typeof height === "number" && Number.isFinite(height) && height > 0 ? height : null;
  const nR = rows.length;
  const nC = cols.length;

  // Row labels: as wide as the longest, up to 40% of the width or whatever the capped columns
  // leave free, whichever is more (longer labels are truncated).
  let rowMax = 0;
  for (const row of rows) rowMax = Math.max(rowMax, textWidth(row.label, FONT));
  const rowW = Math.min(rowMax, Math.max(W * 0.4, W - EDGE - PAD - nC * MAX_COL));
  const rowText = rows.map((row) => fitText(row.label, rowW, FONT));
  const left = rowW > 0 ? Math.ceil(rowW + PAD) : EDGE;

  // Columns split the rest, capped so a few columns do not stretch across a wide frame.
  const avail = Math.max(0, W - left - EDGE);
  let pitchX = nC ? Math.min(MAX_COL, (avail + GAP) / nC) : 0;

  // Column labels lie flat when neighbors clear each other. Otherwise they run diagonally
  // (narrowing the matrix a little so the last ones stay inside the chart), or, when that
  // would cost too much width, vertically, thinned out on very narrow columns.
  const flatW = cols.map((col) => textWidth(col.label, FONT));
  let colMode: ColMode = "flat";
  let colStep = 1;
  if (!flatLabelsFit(flatW, left, pitchX, W)) {
    let p = pitchX;
    for (let i = 0; i < nC; i++) {
      const reach = (Math.min(flatW[i], MAX_COL_LABEL) + FONT) * SIN45;
      p = Math.min(p, (W - EDGE - left - reach) / (i + 0.5));
    }
    if (p * SIN45 >= LINE && p >= pitchX * 0.8) {
      colMode = "diagonal";
      pitchX = p;
    } else {
      colMode = "vertical";
      colStep = Math.max(1, Math.ceil(LINE / Math.max(1, pitchX)));
    }
  }
  const colText = cols.map((col) => (colMode === "flat" ? col.label : fitText(col.label, MAX_COL_LABEL, FONT)));
  let labelMax = 0;
  for (const t of colText) labelMax = Math.max(labelMax, textWidth(t, FONT));
  const top =
    labelMax === 0
      ? EDGE
      : colMode === "flat"
        ? FONT + 8
        : colMode === "diagonal"
          ? Math.ceil((labelMax + FONT) * SIN45) + 8
          : Math.ceil(labelMax) + 8;

  const pitchY = !nR
    ? 0
    : fixedH != null
      ? Math.max(1, (fixedH - top - EDGE + GAP) / nR)
      : Math.min(nR > 20 ? MAX_ROW_MANY : MAX_ROW, Math.max(MIN_ROW, Math.round(pitchX)));
  // Keep the 2px gap unless the cells themselves get tiny.
  const gap = Math.min(GAP, Math.floor(Math.min(pitchX, pitchY) / 3));

  const xs: number[] = [];
  const ws: number[] = [];
  for (let c = 0; c < nC; c++) {
    const x = Math.round(left + c * pitchX);
    xs.push(x);
    ws.push(Math.max(1, Math.round(left + (c + 1) * pitchX) - gap - x));
  }
  const ys: number[] = [];
  const hs: number[] = [];
  for (let r = 0; r < nR; r++) {
    const y = Math.round(top + r * pitchY);
    ys.push(y);
    hs.push(Math.max(1, Math.round(top + (r + 1) * pitchY) - gap - y));
  }
  const gridW = nC ? xs[nC - 1] + ws[nC - 1] - left : 0;
  const gridH = nR ? ys[nR - 1] + hs[nR - 1] - top : 0;
  const side = nR && nC ? Math.min(Math.min(...ws), Math.min(...hs)) : 0;
  const rx = side >= 12 ? 2 : side >= 6 ? 1 : 0;

  return {
    left,
    top,
    pitchX,
    pitchY,
    gap,
    rx,
    colMode,
    colStep,
    rowText,
    colText,
    xs,
    ws,
    ys,
    hs,
    gridW,
    gridH,
    height: fixedH ?? (nR && nC ? top + gridH + EDGE : EMPTY_HEIGHT),
  };
}

/** Flat column labels fit when neighbors keep 6px apart and the end labels stay in the chart. */
function flatLabelsFit(widths: number[], left: number, pitch: number, width: number): boolean {
  for (let i = 0; i < widths.length; i++) {
    const cx = left + (i + 0.5) * pitch;
    if (cx - widths[i] / 2 < 0 || cx + widths[i] / 2 > width) return false;
    if (i > 0 && (widths[i - 1] + widths[i]) / 2 + 6 > pitch) return false;
  }
  return true;
}

/** The accessible summary: size, extremes, and how to move around when cells are buttons. */
function describe(
  rows: readonly HeatmapRow[],
  cols: readonly HeatmapCol[],
  cells: Cell[],
  lo: number,
  hi: number,
  format: (v: number) => string,
  clickable: boolean,
): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const name = (i: number) => `${rows[cells[i].r].label}, ${cols[cells[i].c].label}`;
  const valueOf = (i: number) => format(cells[i].v ?? 0);
  let text = `Heatmap, ${plural(rows.length, "row")} by ${plural(cols.length, "column")}.`;
  if (hi < 0) text += " No values.";
  else if (lo === hi) text += ` Value: ${name(hi)}, ${valueOf(hi)}.`;
  else text += ` Highest: ${name(hi)}, ${valueOf(hi)}. Lowest: ${name(lo)}, ${valueOf(lo)}.`;
  if (clickable) text += " Arrow keys move between cells; Enter selects one.";
  return text;
}

/** The data-i index of an event target that is a cell, else null. */
function cellIndexOf(target: EventTarget | null): number | null {
  if (!(target instanceof Element)) return null;
  const raw = target.getAttribute("data-i");
  if (raw == null) return null;
  const i = Number(raw);
  return Number.isInteger(i) ? i : null;
}

/** Class count clamped to the six ramp tokens (default 6). */
function classCount(classes: number | undefined): number {
  const k = typeof classes === "number" && Number.isFinite(classes) ? Math.round(classes) : 6;
  return Math.min(6, Math.max(2, k));
}

/** Ramp steps (1-6) for k classes, spread evenly from the low end to the high end. */
function rampSteps(k: number): number[] {
  return Array.from({ length: k }, (_, i) => Math.round(1 + (i * 5) / (k - 1)));
}

/** Equal-width class (0..k-1) of v over [d0, d1]; out-of-range values take the end classes. */
function binOf(v: number, d0: number, d1: number, k: number): number {
  const span = d1 - d0;
  const t = span !== 0 && Number.isFinite(span) ? (v - d0) / span : 0.5;
  return Math.min(k - 1, Math.max(0, Math.floor(t * k)));
}

/** Advance width of one character in em: Inter's semibold widths, rounded up, by class. */
function charEm(ch: string): number {
  if ("ijlI".includes(ch)) return 0.27;
  if (ch === " ") return 0.28;
  if (".,:;!'’|".includes(ch)) return 0.33;
  if ("t()[]/".includes(ch)) return 0.37;
  if ("fr1".includes(ch)) return 0.42;
  if ("{}-".includes(ch)) return 0.47;
  if ("mw".includes(ch)) return 0.9;
  if ("MW%@".includes(ch)) return 1.02;
  if (ch === "…") return 0.96;
  if (ch >= "0" && ch <= "9") return 0.66;
  if (ch >= "A" && ch <= "Z") return 0.73;
  if (ch >= "a" && ch <= "z") return 0.61;
  return 0.72;
}

/**
 * Rendered width of a string in the UI sans, erring slightly wide: sized for semibold so a
 * label still fits when hover emphasis makes it bolder.
 */
function textWidth(s: string, size: number): number {
  if (!s) return 0;
  let em = 0;
  for (const ch of s) em += charEm(ch);
  return em * size + 1;
}

/** The string, cut with an ellipsis so it fits in maxW. */
function fitText(s: string, maxW: number, size: number): string {
  if (maxW <= 0) return "";
  if (textWidth(s, size) <= maxW) return s;
  const chars = Array.from(s);
  while (chars.length > 1 && textWidth(`${chars.join("")}…`, size) > maxW) chars.pop();
  return `${chars.join("").trimEnd()}…`;
}
