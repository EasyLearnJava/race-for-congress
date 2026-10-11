"use client";

// One tooltip per chart. Values lead (strong), labels follow; series are keyed with a short
// line stroke, never a filled box. Positioned inside the chart's relative container and
// flipped so it never overflows the right or bottom edge.
import { useCallback, useState, type ReactNode } from "react";

export interface TipState {
  x: number;
  y: number;
  content: ReactNode;
}

export function useTooltip() {
  const [tip, setTip] = useState<TipState | null>(null);
  const show = useCallback((x: number, y: number, content: ReactNode) => setTip({ x, y, content }), []);
  const hide = useCallback(() => setTip(null), []);
  return { tip, show, hide };
}

export function TooltipLayer({ tip, width, height }: { tip: TipState | null; width: number; height?: number }) {
  if (!tip) return null;
  const flipX = tip.x > width - 220;
  const flipY = height != null && tip.y > height - 80;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-20 min-w-36 max-w-72 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
      style={{
        left: flipX ? undefined : tip.x + 14,
        right: flipX ? Math.max(0, width - tip.x + 14) : undefined,
        top: flipY ? undefined : tip.y + 14,
        bottom: flipY && height != null ? Math.max(0, height - tip.y + 14) : undefined,
      }}
    >
      {tip.content}
    </div>
  );
}

export function TipTitle({ children }: { children: ReactNode }) {
  return <div className="mb-1 font-semibold text-ink">{children}</div>;
}

/** A tooltip row: the value is the strong element, the label is secondary. */
export function TipRow({ color, label, value }: { color?: string; label: ReactNode; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-0.5">
      <span className="flex items-center gap-2 text-ink-2">
        {color && <span aria-hidden className="inline-block h-0.5 w-3 rounded-full" style={{ background: color }} />}
        {label}
      </span>
      <span className="font-semibold tabular-nums text-ink">{value}</span>
    </div>
  );
}
