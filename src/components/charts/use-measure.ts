"use client";

import { useCallback, useState } from "react";

/**
 * Width of an element: measured as soon as it mounts, then kept current with a
 * ResizeObserver. 0 only before the browser has laid the element out.
 */
export function useMeasure<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0);
  const ref = useCallback((node: T | null) => {
    if (!node) return;
    const update = (w: number) => setWidth((prev) => (prev === w ? prev : w));
    update(Math.floor(node.getBoundingClientRect().width));
    const observer = new ResizeObserver((entries) => update(Math.floor(entries[0].contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
