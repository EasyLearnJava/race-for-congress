"use client";

// A number that rolls to its new value instead of jumping: it eases from what is on screen now
// (so a new target mid-roll continues smoothly) along the site's critically damped spring.
// React renders the final text; a layout effect (before paint) rewinds the same text node to
// the old value and rolls it forward, so there is never a flash of the final number. The first
// render shows the value directly, and reduced motion skips the roll.
import { useEffect, useLayoutEffect, useRef } from "react";

const SETTLE_MS = 590; // matches --spring in globals.css
const W = (2 * Math.PI) / 0.4; // spring response 0.4 s

function spring(ms: number): number {
  const x = (ms / 1000) * W;
  return 1 - (1 + x) * Math.exp(-x);
}

export function Ticker({ value, format, className }: { value: number; format: (n: number) => string; className?: string }) {
  const el = useRef<HTMLSpanElement>(null);
  const shown = useRef(value);
  const formatRef = useRef(format);
  useEffect(() => {
    formatRef.current = format;
  });

  useLayoutEffect(() => {
    const text = el.current?.firstChild;
    if (!(text instanceof Text)) return;
    const from = shown.current;
    const to = value;
    if (from === to || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      shown.current = to;
      return;
    }
    const fmt = formatRef.current;
    text.nodeValue = fmt(from);
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const ms = Math.min(now - start, SETTLE_MS);
      const v = ms >= SETTLE_MS ? to : from + (to - from) * spring(ms);
      shown.current = v;
      text.nodeValue = fmt(v);
      if (ms < SETTLE_MS) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      text.nodeValue = fmt(to);
    };
  }, [value]);

  return (
    <span ref={el} className={`tabular-nums ${className ?? ""}`}>
      {format(value)}
    </span>
  );
}
