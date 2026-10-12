"use client";

// A geographic map of the 50 states (US Census Bureau shapes via us-atlas, Albers USA with
// Alaska and Hawaii inset). Each state shows its postal code and an optional label; small
// Northeastern states get labeled boxes down the right edge, so every state stays readable and
// clickable. Fills fade to new colors when the scenario changes. Same API as StateTileMap.
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

import usStatesJson from "@/generated/usStates.json";
import { RATING_COLOR, RATING_TEXT } from "@/lib/ratings";
import type { RatingLabel } from "@/lib/data/types";
import { TooltipLayer, useTooltip } from "./tooltip";

interface StateShape {
  postal: string;
  name: string;
  d: string;
  cx: number;
  cy: number;
  area: number;
}

const STATES = usStatesJson as StateShape[];
const BOX_X = 990;
const VIEW_W = 1100;
const VIEW_H = 610;
/** Too small to label inside: labeled boxes on the right, top to bottom roughly by latitude. */
const BOXED = ["VT", "NH", "MA", "RI", "CT", "NJ", "DE", "MD"];
const BOX_H = 34;
const BOX_TOP = 170;
// Label nudges where the largest piece's center is a poor spot for text.
const NUDGE: Record<string, [number, number]> = { FL: [16, 12], LA: [-12, -4], MI: [10, 18], ID: [0, 22], KY: [8, 2], WV: [-3, 4], VA: [10, 4], HI: [0, -26], AK: [0, 6], CA: [-8, 0], MN: [-6, 8] };
// Labels nudged off their state (over the ocean or the page) use ink, not the state's text color.
const OUTSIDE = new Set(["HI"]);

const INK = new Map<string, string>((Object.keys(RATING_COLOR) as RatingLabel[]).map((r) => [RATING_COLOR[r], RATING_TEXT[r]]));
const inkFor = (fill: string | null) => (fill ? (INK.get(fill) ?? "var(--ink)") : "var(--muted)");

export function UsStateMap({
  width,
  fill,
  label,
  hrefFor,
  selected,
  tooltip,
  ariaLabel,
}: {
  width: number;
  /** Fill per state, or null for "no data" (drawn neutral). */
  fill: (postal: string) => string | null;
  /** A short second line under the postal code (e.g. "R 61%"). */
  label?: (postal: string) => string | null;
  hrefFor?: (postal: string) => string | null;
  selected?: Set<string> | null;
  tooltip?: (postal: string) => ReactNode;
  ariaLabel: string;
}) {
  const router = useRouter();
  const { tip, show, hide } = useTooltip();
  const scale = width / VIEW_W;
  const height = VIEW_H * scale;
  // Narrow screens: postal codes only (chances stay in the tooltip and the table view).
  const compact = width < 640;
  const fontPx = (compact ? 9 : 13) / scale; // on-screen label size in px
  const go = (postal: string) => {
    const url = hrefFor?.(postal);
    if (url) router.push(url);
  };
  const onMove = (postal: string) => (e: React.PointerEvent) => {
    if (!tooltip) return;
    const box = (e.currentTarget as SVGElement).ownerSVGElement!.getBoundingClientRect();
    show(e.clientX - box.left, e.clientY - box.top, tooltip(postal));
  };

  const shapes = STATES.map((s) => ({ ...s, color: s.postal === "DC" ? null : fill(s.postal) }));
  const boxed = new Set(BOXED);

  return (
    <div className="relative" style={{ width, height }}>
      <svg width={width} height={height} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} role="img" aria-label={ariaLabel} className="block">
        <g>
          {shapes.map((s) => {
            const linked = !!hrefFor?.(s.postal);
            return (
              <path
                key={s.postal}
                d={s.d}
                style={{ fill: s.color ?? "var(--surface-2)" }}
                className={`map-fill outline-none focus-visible:[stroke:var(--ink)] focus-visible:[stroke-width:3] ${linked ? "cursor-pointer hover:brightness-110" : ""}`}
                stroke="var(--surface)"
                strokeWidth={1.2}
                strokeLinejoin="round"
                role={linked ? "link" : undefined}
                tabIndex={linked ? 0 : undefined}
                aria-label={linked ? s.name : undefined}
                onKeyDown={(e) => e.key === "Enter" && go(s.postal)}
                onPointerMove={onMove(s.postal)}
                onPointerLeave={hide}
                onClick={() => go(s.postal)}
              />
            );
          })}
        </g>
        {/* Selected states: a strong outline on top. */}
        <g pointerEvents="none" fill="none">
          {shapes
            .filter((s) => selected?.has(s.postal))
            .map((s) => (
              <path key={s.postal} d={s.d} stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round" />
            ))}
        </g>
        <g pointerEvents="none" textAnchor="middle" fontWeight={700}>
          {shapes
            .filter((s) => !boxed.has(s.postal) && s.postal !== "DC")
            .map((s) => {
              const [dx, dy] = NUDGE[s.postal] ?? [0, 0];
              const sub = compact ? null : label?.(s.postal);
              return (
                <text key={s.postal} x={s.cx + dx} y={s.cy + dy} fill={OUTSIDE.has(s.postal) ? "var(--ink)" : inkFor(s.color)} fontSize={fontPx}>
                  <tspan x={s.cx + dx} dy={sub ? "-0.2em" : "0.35em"}>
                    {s.postal}
                  </tspan>
                  {sub && (
                    <tspan x={s.cx + dx} dy="1.15em" fontWeight={600} fontSize={fontPx * 0.85}>
                      {sub}
                    </tspan>
                  )}
                </text>
              );
            })}
        </g>
        <g>
          {BOXED.map((postal, i) => {
            const s = shapes.find((x) => x.postal === postal)!;
            const sub = compact ? null : label?.(postal);
            const y = BOX_TOP + i * (BOX_H + 6);
            return (
              <g
                key={postal}
                className={hrefFor?.(postal) ? "cursor-pointer" : undefined}
                onPointerMove={onMove(postal)}
                onPointerLeave={hide}
                onClick={() => go(postal)}
              >
                <rect x={BOX_X} y={y} width={VIEW_W - BOX_X} height={BOX_H} rx={4} style={{ fill: s.color ?? "var(--surface-2)" }} className="map-fill" />
                {selected?.has(postal) && <rect x={BOX_X} y={y} width={VIEW_W - BOX_X} height={BOX_H} rx={4} fill="none" stroke="var(--ink)" strokeWidth={2.5} />}
                <text x={BOX_X + 8} y={y + BOX_H / 2} dy="0.35em" fill={inkFor(s.color)} fontWeight={700} fontSize={fontPx}>
                  {postal}
                </text>
                {sub && (
                  <text x={VIEW_W - 6} y={y + BOX_H / 2} dy="0.35em" textAnchor="end" fill={inkFor(s.color)} fontWeight={600} fontSize={fontPx * 0.85}>
                    {sub}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <TooltipLayer tip={tip} width={width} height={height} />
    </div>
  );
}

/** Height in px of the map drawn at `width`. */
export function usMapHeight(width: number): number {
  return (VIEW_H * width) / VIEW_W;
}

export const US_MAP_CREDIT = "State shapes: US Census Bureau, via us-atlas.";
