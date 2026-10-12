"use client";

// The one segmented control for the whole site: a light thumb that slides between options on a
// recessed track, like iOS. The thumb is positioned by writing to its style (measured from the
// selected option), so it glides on a spring without re-rendering, never animates on first paint,
// and follows the option if the layout changes. Keyboard: arrow keys move the selection.
import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Accessible name when the label is an icon. */
  ariaLabel?: string;
  /** A color dot before the label (e.g. a party). */
  dot?: string;
}

const SIZES = {
  xs: "h-7 text-[11px]",
  sm: "h-8 text-xs",
  md: "h-9 text-sm",
};

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  size = "sm",
  className = "",
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: readonly SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: keyof typeof SIZES;
  className?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const t = track.current;
    const th = thumb.current;
    if (!t || !th) return;
    const place = (animate: boolean) => {
      const active = t.querySelector<HTMLButtonElement>('[aria-checked="true"]');
      if (!active) {
        th.style.opacity = "0";
        return;
      }
      th.style.transition = animate
        ? "transform var(--spring-fast) var(--ease-spring), width var(--spring-fast) var(--ease-spring), opacity 150ms ease"
        : "none";
      th.style.width = `${active.offsetWidth}px`;
      th.style.transform = `translateX(${active.offsetLeft}px)`;
      th.style.opacity = "1";
    };
    place(placed.current);
    placed.current = true;
    // Fonts loading or the container resizing move the options: follow without animating.
    const ro = new ResizeObserver(() => place(false));
    ro.observe(t);
    return () => ro.disconnect();
  }, [value, options]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length];
    onChange(next.value);
    requestAnimationFrame(() => track.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]')?.focus());
  };

  return (
    <div
      ref={track}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`relative inline-flex max-w-full items-stretch rounded-full bg-(--seg-track) p-0.5 ${SIZES[size]} ${className}`}
    >
      <span
        ref={thumb}
        aria-hidden
        className="pointer-events-none absolute top-0.5 bottom-0.5 left-0 rounded-full bg-(--seg-thumb) opacity-0 shadow-(--seg-shadow)"
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.ariaLabel}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={`relative inline-flex items-center justify-center gap-1.5 rounded-full px-3 font-medium whitespace-nowrap transition-colors duration-200 ${
              on ? "text-ink" : "text-ink-2 hover:text-ink"
            }`}
          >
            {o.dot && <span aria-hidden className="size-2 rounded-full" style={{ background: o.dot }} />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
