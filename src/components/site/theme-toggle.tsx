"use client";

// Light / dark / system. The choice is stored per browser; an inline script in the root
// layout applies it before first paint so there is no flash.
import { useSyncExternalStore } from "react";

type Theme = "system" | "light" | "dark";
const KEY = "theme";
const EVENT = "themechange";

function read(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function apply(theme: Theme) {
  try {
    if (theme === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    // storage unavailable (private mode): the choice lasts for this page only
  }
  if (theme === "system") delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
  window.dispatchEvent(new Event(EVENT));
}

const NEXT: Record<Theme, Theme> = { system: "light", light: "dark", dark: "system" };
const LABEL: Record<Theme, string> = { system: "Auto", light: "Light", dark: "Dark" };

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <button
      type="button"
      onClick={() => apply(NEXT[theme])}
      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-2.5 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]]}`}
    >
      <svg aria-hidden width="14" height="14" viewBox="0 0 16 16">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
      </svg>
      {LABEL[theme]}
    </button>
  );
}

/** Runs before paint (inlined in <head>): applies a stored theme choice. */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
