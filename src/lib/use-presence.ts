"use client";

// Keeps a popover mounted while it animates out, so it can leave the way it came in
// (see .popover / .scrim in globals.css). Reopening mid-exit reverses from the current value,
// because the animation is a CSS transition between two states.
import { useEffect, useState } from "react";

export function usePresence(open: boolean, exitMs = 450): { mounted: boolean; state: "open" | "closed" } {
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);
  // Mount in the same render that opens (derived state), then flip to "open" on a later frame
  // so the closed styles paint first and the transition runs.
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (open) {
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    const frame = requestAnimationFrame(() => setShown(false));
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [open, exitMs]);

  return { mounted: mounted || open, state: open && shown ? "open" : "closed" };
}
