"use client";

// Equal-area House map (The Downballot's hexmap, CC BY 4.0). One delegated pointer handler
// serves all 435 districts. Districts link to their pages; state labels link to state pages.
// Keyboard and screen-reader users get the same data through the page's tables and search.
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";

import type { HexMap as HexMapData } from "@/lib/data/types";
import { useMeasure } from "./use-measure";
import { TooltipLayer, useTooltip } from "./tooltip";

export function HexMap({
  map,
  fill,
  tooltip,
  hrefFor,
  stateHref,
  highlight,
  selected,
  showStateLabels = true,
  districtLabels = false,
  ariaLabel,
  maxHeight,
}: {
  map: HexMapData;
  fill: (id: string) => string;
  tooltip?: (id: string) => ReactNode;
  hrefFor?: (id: string) => string;
  stateHref?: (postal: string) => string;
  /** When set, districts outside it are dimmed (filters, brushing). */
  highlight?: Set<string> | null;
  /** Districts drawn with a strong outline (the current district on its own page). */
  selected?: Set<string> | null;
  showStateLabels?: boolean;
  /** Write each district number on its shape (single-state views). */
  districtLabels?: boolean;
  ariaLabel: string;
  maxHeight?: number;
}) {
  const router = useRouter();
  const [ref, width] = useMeasure<HTMLDivElement>();
  const { tip, show, hide } = useTooltip();

  // Fit the view box to the features present (the whole country, or one state).
  const box = useMemo(() => {
    if (map.districts.length === 435) return map.viewBox;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const f of [...map.districts, ...map.states]) {
      for (const [, xs, ys] of f.d.matchAll(/[ML](-?[\d.]+)[ ,](-?[\d.]+)/g)) {
        const x = Number(xs), y = Number(ys);
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return map.viewBox;
    const pad = Math.max(x1 - x0, y1 - y0) * 0.06;
    return [x0 - pad, y0 - pad, x1 - x0 + 2 * pad, y1 - y0 + 2 * pad] as [number, number, number, number];
  }, [map]);

  const aspect = box[3] / box[2];
  let height = width * aspect;
  if (maxHeight && height > maxHeight) height = maxHeight;
  // View-box units per screen pixel: strokes and labels are sized in screen pixels.
  const unit = Math.max(box[2] / Math.max(1, width), box[3] / Math.max(1, height));
  const labelSize = 11 * unit;

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const id = (e.target as SVGElement).getAttribute("data-id");
    if (!id || !tooltip) return hide();
    const rect = e.currentTarget.getBoundingClientRect();
    show(e.clientX - rect.left, e.clientY - rect.top, tooltip(id));
  };
  const onClick = (e: React.MouseEvent<SVGSVGElement>) => {
    const id = (e.target as SVGElement).getAttribute("data-id");
    const state = (e.target as SVGElement).getAttribute("data-state");
    if (id && hrefFor) router.push(hrefFor(id));
    else if (state && stateHref) router.push(stateHref(state));
  };

  return (
    <div ref={ref} className="relative w-full">
      {width > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={box.join(" ")}
          role="img"
          aria-label={ariaLabel}
          onPointerMove={onMove}
          onPointerLeave={hide}
          onClick={onClick}
          className="block"
        >
          <g>
            {map.districts.map((d) => {
              const dim = highlight && !highlight.has(d.id);
              return (
                <path
                  key={d.id}
                  d={d.d}
                  data-id={d.id}
                  style={{ fill: fill(d.id), opacity: dim ? 0.18 : undefined }}
                  stroke="var(--surface)"
                  strokeWidth={0.6 * unit}
                  strokeLinejoin="round"
                  className={`map-fill ${hrefFor ? "cursor-pointer hover:opacity-80" : ""}`}
                />
              );
            })}
          </g>
          <g pointerEvents="none">
            {map.states.map((s) => (
              // States are already separated by gaps: a crisp light border, not a dark outline.
              <path key={s.state} d={s.d} fill="none" stroke="var(--surface)" strokeWidth={1.6 * unit} strokeLinejoin="round" />
            ))}
          </g>
          {selected && (
            <g pointerEvents="none">
              {map.districts
                .filter((d) => selected.has(d.id))
                .map((d) => (
                  <path key={d.id} d={d.d} fill="none" stroke="var(--ink)" strokeWidth={2.5 * unit} />
                ))}
            </g>
          )}
          {districtLabels && (
            <g pointerEvents="none">
              {map.districts.map((d) => (
                <text
                  key={d.id}
                  x={d.cx}
                  y={d.cy}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={10 * unit}
                  fontWeight={600}
                  fill="var(--ink)"
                  stroke="var(--surface)"
                  strokeWidth={2.5 * unit}
                  paintOrder="stroke"
                >
                  {d.id.slice(3)}
                </text>
              ))}
            </g>
          )}
          {showStateLabels && (
            <g>
              {/* State labels sit on small rounded chips, readable over any district color. */}
              {map.states.map((s) => {
                const w = (s.state.length * 0.66 + 0.9) * labelSize;
                const h = 1.4 * labelSize;
                return (
                  <g key={s.state} className={stateHref ? "cursor-pointer" : undefined} pointerEvents={stateHref ? "auto" : "none"} data-state={s.state}>
                    <rect
                      x={s.cx - w / 2}
                      y={s.cy - h / 2}
                      width={w}
                      height={h}
                      rx={h / 2}
                      fill="var(--surface)"
                      fillOpacity={0.92}
                      stroke="var(--ink)"
                      strokeOpacity={0.12}
                      strokeWidth={0.75 * unit}
                      data-state={s.state}
                    />
                    <text
                      x={s.cx}
                      y={s.cy}
                      data-state={s.state}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={labelSize}
                      fontWeight={650}
                      letterSpacing="0.02em"
                      fill="var(--ink)"
                    >
                      {s.state}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
      )}
      <TooltipLayer tip={tip} width={width} height={height} />
    </div>
  );
}
