"use client";

// The 50-state tile map: one equal square per state on the standard 11 x 8 grid, so small
// states weigh as much as large ones. Each tile carries its postal code and an optional value
// line set in white or ink by the fill's luminance. Tiles become links or buttons on request;
// one delegated set of handlers on the svg serves hover, touch, focus and keys for all 50.
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import { STATES, type StateInfo } from "@/lib/data/states";
import { RATING_COLOR, RATING_ORDER, RATING_TEXT } from "@/lib/ratings";
import { TipRow, TipTitle, TooltipLayer, useTooltip } from "./tooltip";

const COLS = 11;
const ROWS = 8;
/** Surface gap between neighbouring tiles. */
const GAP = 2;
/** Room around the grid so the hover/focus ring (2px offset + 2px stroke) is never clipped. */
const PAD = 4;
/** Default cap on a tile's side, so the map stops growing on wide screens. */
const MAX_TILE = 56;

/** A drawable width: NaN, infinite or negative widths draw nothing rather than NaN geometry. */
function safeWidth(width: number): number {
  return Number.isFinite(width) && width > 0 ? width : 0;
}

/** Side of one square tile in whole pixels (crisp edges, even gaps) for a plot `width`. */
function tileSide(width: number, maxTile: number): number {
  const cap = maxTile >= 1 ? Math.floor(maxTile) : MAX_TILE;
  const fit = Math.floor((safeWidth(width) - 2 * PAD - GAP * (COLS - 1)) / COLS);
  return Math.max(0, Math.min(cap, fit));
}

function gridHeight(side: number): number {
  return side > 0 ? 2 * PAD + ROWS * side + GAP * (ROWS - 1) : 0;
}

/**
 * Height in px of a StateTileMap drawn at `width`: tiles are square, so the height follows
 * from the width. ChartFrame treats its `height` as a minimum, so reserve the narrowest
 * width you expect (e.g. `tileMapHeight(320)`); a wider map grows the frame. Pass the same
 * `maxTile` you give the map.
 */
export function tileMapHeight(width: number, maxTile: number = MAX_TILE): number {
  return gridHeight(tileSide(width, maxTile));
}

const RATING_INK = new Map<string, string>(RATING_ORDER.map((r) => [RATING_COLOR[r], RATING_TEXT[r]]));

/**
 * The party fills are lighter than the white/ink crossover in both themes, so their labels
 * stay dark in both. Ink alone turns light in dark mode: 1.9:1 on var(--ind), 3.5:1 on
 * var(--dem). Where light-dark() is unsupported, the attribute is dropped and SVG text
 * falls back to its default black, which is just as readable.
 */
const DARK_TEXT = "light-dark(var(--ink), var(--surface))";
const PARTY_FILLS = new Set(["var(--dem)", "var(--rep)", "var(--ind)"]);

/**
 * A readable color for text set inside a mark filled with `fill`: the matching RATING_TEXT
 * token for a rating fill (RATING_COLOR); ink on the light half of the magnitude ramp
 * (var(--m-1..3)) and surface on the dark half (var(--m-4..6)), which holds in both themes
 * because the dark theme flips the ramp and those two tokens together; dark text in both
 * themes on the party fills (var(--dem), var(--rep), var(--ind)); var(--ink) otherwise.
 */
export function textOnFill(fill: string): string {
  const key = fill.replace(/\s+/g, "");
  const rating = RATING_INK.get(key);
  if (rating) return rating;
  const step = /^var\(--m-([1-6])\)$/.exec(key);
  if (step) return Number(step[1]) <= 3 ? "var(--ink)" : "var(--surface)";
  if (PARTY_FILLS.has(key)) return DARK_TEXT;
  return "var(--ink)";
}

/**
 * A callback's string, or null when it carries no value: empty, a dash placeholder ("—" from
 * the format helpers), or a stringified missing number such as "NaN%" or "var(--m-undefined)".
 */
function usable(value: string | null | undefined): string | null {
  if (value == null) return null;
  const s = value.trim();
  return s === "" || /^[—–-]+$/.test(s) || /\b(?:NaN|undefined|null)\b/.test(s) ? null : s;
}

const NARROW = " .,:;'’|!()[]ijlrtfI";
const WIDE = "%MWmw@—";
const MEDIUM = "ABCDEFGHJKLNOPQRSTUVXYZ0123456789$+-−<>=#?&";

/** Rough advance width of `text` in the UI sans at `size` px, so labels that won't fit are dropped, never clipped. */
function textWidth(text: string, size: number): number {
  let em = 0;
  for (const ch of text) em += NARROW.includes(ch) ? 0.34 : WIDE.includes(ch) ? 0.9 : MEDIUM.includes(ch) ? 0.66 : 0.58;
  return em * size;
}

interface Tile {
  state: StateInfo;
  /** Top-left corner, in px. */
  x: number;
  y: number;
  /** Fill color, or null when the state is not in play. */
  fill: string | null;
  label: string | null;
  /** Whether the label fits inside the tile at the current size. */
  showLabel: boolean;
  /** Color of the text set on the tile. */
  ink: string;
  href: string | null;
  /** Activated through onSelect (no href). */
  button: boolean;
}

const isInteractive = (t: Tile): boolean => t.href != null || t.button;

const ARROWS: Record<string, readonly [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};

/** The nearest tile from `from` in grid direction (dx, dy), favoring the straight line. */
function nearestTile(from: Tile, [dx, dy]: readonly [number, number], tiles: Tile[]): Tile | null {
  const [c0, r0] = from.state.tile;
  let best: Tile | null = null;
  let bestScore = Infinity;
  for (const t of tiles) {
    const dc = t.state.tile[0] - c0;
    const dr = t.state.tile[1] - r0;
    const along = dc * dx + dr * dy;
    if (along <= 0) continue;
    const score = along + 1.5 * Math.abs(dx !== 0 ? dr : dc);
    if (score < bestScore) {
      best = t;
      bestScore = score;
    }
  }
  return best;
}

function isFocusVisible(target: EventTarget): boolean {
  if (!(target instanceof Element)) return false;
  try {
    return target.matches(":focus-visible");
  } catch {
    return true;
  }
}

function defaultTip(t: Tile): ReactNode {
  return t.label ? (
    <TipRow color={t.fill ?? undefined} label={t.state.name} value={t.label} />
  ) : (
    <TipTitle>{t.state.name}</TipTitle>
  );
}

export interface StateTileMapProps {
  /** Plot width in px (ChartFrame's render-prop argument). The height follows: see `tileMapHeight`. */
  width: number;
  /** Tile color for a state, as a CSS color token (e.g. RATING_COLOR[r], "var(--m-3)"), or null when the state is not in play: drawn in var(--surface-2) with a muted label. Empty strings and stringified missing values ("var(--m-NaN)") count as null. */
  fill: (postal: string) => string | null | undefined;
  /** Optional second line under the postal code, e.g. "62%" or "D+3"; return null to leave a tile unlabelled (label selectively). Empty, "—" and "NaN" labels are skipped. Drawn only where it fits (tiles of 34px and up); the tooltip and table carry it otherwise. */
  label?: (postal: string) => string | null | undefined;
  /** Tooltip content for a state (use TipTitle / TipRow). Defaults to the state's name with its label. Return null for no tooltip. */
  tooltip?: (postal: string) => ReactNode;
  /** Link target for a state; tiles with an href render as next/link anchors (keyboard focusable). Return null to leave a tile unlinked. */
  hrefFor?: (postal: string) => string | null | undefined;
  /** Called when an interactive tile is clicked or activated by keyboard. In-play tiles without an href become buttons (Enter/Space); linked tiles call it too on click (e.g. for analytics) and still navigate. */
  onSelect?: (postal: string) => void;
  /** States drawn with a strong inset outline (the current state, or a selection). Linked tiles expose it as aria-current, button tiles as aria-pressed. */
  selected?: ReadonlySet<string> | null;
  /** Text color for an in-play tile's labels: white or ink by fill luminance. Defaults to `textOnFill(fill)`, which is var(--ink) for fills it doesn't know. */
  textColor?: (postal: string) => string;
  /** Accessible summary of what the map shows. Defaults to a generic count of shaded states. */
  ariaLabel?: string;
  /** Cap on the tile side in px (default 56). Pass the same value to `tileMapHeight`. */
  maxTile?: number;
  /** Shown centered over the map when no state is in play. Default "No data"; null hides it. */
  emptyMessage?: string | null;
}

/**
 * The 50-state square tile map (11 x 8 grid, 2px surface gaps, 4px rounded tiles). Renders an
 * svg plus its tooltip layer, sized by `width`; place it in ChartFrame's render prop.
 *
 * The svg is role="img" when no tile is interactive. When tiles are links or buttons it is a
 * labelled role="group" instead, so assistive tech can reach them (an img's children are
 * presentational); plain tiles that carry data are then announced as images. Tab order follows
 * the grid row by row, and arrow keys move between interactive tiles spatially. Escape
 * dismisses the tooltip; on touch, a tap's tooltip stays until the next tap anywhere.
 */
export function StateTileMap({
  width,
  fill,
  label,
  tooltip,
  hrefFor,
  onSelect,
  selected,
  textColor,
  ariaLabel,
  maxTile = MAX_TILE,
  emptyMessage = "No data",
}: StateTileMapProps) {
  const { tip, show, hide } = useTooltip();
  const [hovered, setHovered] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  /** The hover came from a tap. Touch has no hover to end, so a tap outside the map does. */
  const [tapped, setTapped] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const w = safeWidth(width);

  useEffect(() => {
    if (!tapped) return;
    const onOutside = (e: PointerEvent) => {
      if (e.target instanceof Node && svgRef.current?.contains(e.target)) return; // the map's own handler takes it
      setTapped(false);
      setHovered(null);
      hide();
    };
    document.addEventListener("pointerdown", onOutside, true);
    return () => document.removeEventListener("pointerdown", onOutside, true);
  }, [tapped, hide]);

  const map = useMemo(() => {
    const s = tileSide(w, maxTile);
    const x0 = Math.max(PAD, Math.floor((w - (COLS * s + GAP * (COLS - 1))) / 2));
    // Postal codes stay ~12px bold and only shrink when the widest ("WV") would not fit.
    const postalSize = Math.min(12, (s - 4) / 1.7);
    const labelSize = s >= 42 ? 10 : s >= 34 ? 9 : 0;
    // Two-line block centered on the tile, measured by cap height.
    const capP = 0.72 * postalSize;
    const capL = 0.72 * labelSize;
    const block = capP + (labelSize >= 10 ? 4 : 3) + capL;
    const canSelect = onSelect != null;
    const tiles = STATES.map((state): Tile => {
      const { postal } = state;
      const f = usable(fill(postal));
      const text = usable(label?.(postal));
      const href = hrefFor?.(postal) || null;
      return {
        state,
        x: x0 + state.tile[0] * (s + GAP),
        y: PAD + state.tile[1] * (s + GAP),
        fill: f,
        label: text,
        showLabel: text != null && labelSize > 0 && textWidth(text, labelSize) <= s - 8,
        ink: f ? textColor?.(postal) || textOnFill(f) : "var(--muted)",
        href,
        button: !href && f != null && canSelect,
      };
    });
    return {
      s,
      r: Math.min(4, s / 4),
      postalSize,
      labelSize,
      postalDy: capP / 2 - block / 2,
      labelDy: block / 2 - capL / 2,
      height: gridHeight(s),
      tiles,
      byPostal: new Map(tiles.map((t) => [t.state.postal, t])),
      focusable: tiles.filter(isInteractive),
    };
  }, [w, maxTile, fill, label, hrefFor, textColor, onSelect]);

  const interactive = map.focusable.length > 0;

  // The tiles only change with data, size or selection; pointer moves re-render just the overlays.
  const tileLayer = useMemo(() => {
    const { s, r, postalSize, labelSize, postalDy, labelDy } = map;
    return map.tiles.map((t) => {
      const { postal, name } = t.state;
      const cx = t.x + s / 2;
      const cy = t.y + s / 2;
      const isSelected = selected?.has(postal) ?? false;
      const face = (
        <>
          {/* The transparent stroke widens the hit area across half of each surrounding gap. */}
          <rect x={t.x} y={t.y} width={s} height={s} rx={r} fill={t.fill ?? "var(--surface-2)"} stroke="transparent" strokeWidth={GAP} />
          {isSelected && s >= 8 && (
            // Ink ring plus a surface ring inside it: one of the two clears 3:1 on every fill.
            <g pointerEvents="none" fill="none">
              <rect x={t.x + 1} y={t.y + 1} width={s - 2} height={s - 2} rx={Math.max(0, r - 1)} stroke="var(--ink)" strokeWidth={2} />
              {s >= 12 && (
                <rect x={t.x + 2.75} y={t.y + 2.75} width={s - 5.5} height={s - 5.5} rx={Math.max(0, r - 2.75)} stroke="var(--surface)" strokeWidth={1.5} />
              )}
            </g>
          )}
          {postalSize >= 7 && (
            <text
              x={cx}
              y={t.showLabel ? cy + postalDy : cy}
              dy="0.35em"
              textAnchor="middle"
              fontSize={postalSize}
              fontWeight={700}
              fill={t.ink}
              pointerEvents="none"
            >
              {postal}
            </text>
          )}
          {t.showLabel && (
            <text
              x={cx}
              y={cy + labelDy}
              dy="0.35em"
              textAnchor="middle"
              fontSize={labelSize}
              fontWeight={500}
              fill={t.ink}
              pointerEvents="none"
              className="tabular-nums"
            >
              {t.label}
            </text>
          )}
        </>
      );
      const accessibleName = t.label ? `${name}, ${t.label}` : name;
      if (t.href) {
        return (
          <Link
            key={postal}
            href={t.href}
            aria-label={accessibleName}
            aria-current={isSelected ? "true" : undefined}
            data-postal={postal}
            className="cursor-pointer focus-visible:outline-hidden!"
          >
            {face}
          </Link>
        );
      }
      if (t.button) {
        return (
          <g
            key={postal}
            role="button"
            tabIndex={0}
            aria-label={accessibleName}
            aria-pressed={selected ? isSelected : undefined}
            data-postal={postal}
            className="cursor-pointer focus-visible:outline-hidden!"
          >
            {face}
          </g>
        );
      }
      // Inside an interactive (role="group") map, a plain tile that carries data still announces
      // it; blank tiles stay out of the accessibility tree.
      const announce = interactive && (t.fill != null || t.label != null);
      return (
        <g
          key={postal}
          data-postal={postal}
          role={announce ? "img" : undefined}
          aria-label={announce ? accessibleName : undefined}
          aria-hidden={interactive && !announce ? true : undefined}
        >
          {face}
        </g>
      );
    });
  }, [map, selected, interactive]);

  const tileAt = (target: EventTarget | null): Tile | undefined => {
    if (!(target instanceof Element)) return undefined;
    const postal = target.closest("[data-postal]")?.getAttribute("data-postal");
    return postal ? map.byPostal.get(postal) : undefined;
  };

  /** Show `t`'s tooltip at (x, y) in plot px, or none when its content is empty. */
  const showTip = (t: Tile, x: number, y: number) => {
    const content = tooltip ? tooltip(t.state.postal) : defaultTip(t);
    if (content == null || content === false) hide();
    else show(x, y, content);
  };

  const focusedTile = focused ? map.byPostal.get(focused) : undefined;
  const focusTile = focusedTile && isInteractive(focusedTile) ? focusedTile : undefined;

  /** With no tile under the pointer, the tooltip goes back to the keyboard-focused tile, if any. */
  const settle = () => {
    if (focusTile) showTip(focusTile, focusTile.x + map.s / 2, focusTile.y + map.s / 2);
    else hide();
  };

  const onPoint = (e: ReactPointerEvent<SVGSVGElement>) => {
    const t = tileAt(e.target);
    setTapped(t != null && e.pointerType === "touch");
    if (!t) {
      setHovered(null);
      settle();
      return;
    }
    setHovered(t.state.postal);
    const box = e.currentTarget.getBoundingClientRect();
    showTip(t, e.clientX - box.left, e.clientY - box.top);
  };

  const clearPointer = () => {
    setHovered(null);
    setTapped(false);
    settle();
  };

  const onFocus = (e: ReactFocusEvent<SVGSVGElement>) => {
    // Mouse focus already has the hover state; keyboard focus gets the ring and the same tooltip.
    const t = tileAt(e.target);
    if (!t || !isFocusVisible(e.target)) return;
    setFocused(t.state.postal);
    showTip(t, t.x + map.s / 2, t.y + map.s / 2);
  };

  const onBlur = () => {
    if (focused == null) return;
    setFocused(null);
    hide();
  };

  const onKeyDown = (e: ReactKeyboardEvent<SVGSVGElement>) => {
    if (e.key === "Escape") {
      if (tip) {
        e.stopPropagation(); // the first Escape closes the tooltip, not an enclosing dialog
        hide();
      }
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return; // leave shortcuts such as Alt+Left (Back) alone
    const t = tileAt(e.target);
    if (!t) return;
    if (t.button && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      onSelect?.(t.state.postal);
      return;
    }
    const dir = ARROWS[e.key];
    if (!dir) return;
    const next = nearestTile(t, dir, map.focusable);
    if (!next) return;
    e.preventDefault();
    e.currentTarget.querySelector<SVGElement>(`[data-postal="${next.state.postal}"]`)?.focus();
  };

  const onClick = (e: ReactMouseEvent<SVGSVGElement>) => {
    const t = tileAt(e.target);
    if (t && onSelect && isInteractive(t)) onSelect(t.state.postal);
  };

  /** Outer ring 2px off the tile edge: the hovered or keyboard-focused tile. */
  const ring = (t: Tile | undefined, color: string) => {
    if (!t || map.s < 4) return null;
    return <rect x={t.x - 3} y={t.y - 3} width={map.s + 6} height={map.s + 6} rx={map.r + 3} stroke={color} strokeWidth={2} />;
  };

  const inPlay = map.tiles.reduce((n, t) => n + (t.fill ? 1 : 0), 0);
  const { height } = map;
  const showEmpty = inPlay === 0 && !!emptyMessage && height >= 32;
  const pillW = showEmpty ? Math.min(w - 2 * PAD, textWidth(emptyMessage, 12) + 24) : 0;
  const summary = ariaLabel ?? `Tile map of the 50 states, ${inPlay} shaded`;

  return (
    <>
      <svg
        ref={svgRef}
        width={w}
        height={height}
        role={interactive ? "group" : "img"}
        aria-label={showEmpty ? `${summary}. ${emptyMessage}` : summary}
        className="block"
        onPointerMove={onPoint}
        onPointerDown={onPoint}
        onPointerLeave={(e) => {
          // A tap's tooltip stays up until the next tap; a mouse leaving clears it.
          if (e.pointerType !== "touch") clearPointer();
        }}
        onPointerCancel={clearPointer}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
        onClick={onClick}
      >
        {tileLayer}
        <g pointerEvents="none" fill="none" aria-hidden="true">
          {ring(hovered ? map.byPostal.get(hovered) : undefined, "var(--ink)")}
          {focused !== hovered && ring(focusTile, "var(--focus)")}
        </g>
        {showEmpty && (
          <g pointerEvents="none" aria-hidden="true">
            <rect x={(w - pillW) / 2} y={height / 2 - 12} width={pillW} height={24} rx={6} fill="var(--surface)" />
            <text x={w / 2} y={height / 2} dy="0.35em" textAnchor="middle" fontSize={12} fontWeight={500} fill="var(--ink-2)">
              {emptyMessage}
            </text>
          </g>
        )}
      </svg>
      <TooltipLayer tip={tip} width={w} height={height} />
    </>
  );
}
