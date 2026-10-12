"use client";

// Light / dark / system. The choice is stored per browser; an inline script in the root
// layout applies it before first paint so there is no flash.
import { useSyncExternalStore } from "react";

import { Segmented } from "@/components/ui/segmented";

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
  // Ease the switch instead of flashing the whole page (globals.css, html.theme-easing).
  const root = document.documentElement;
  root.classList.add("theme-easing");
  window.setTimeout(() => root.classList.remove("theme-easing"), 300);
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
  window.dispatchEvent(new Event(EVENT));
}


const ICON = { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const };

/** Auto / Light / Dark as a sliding segmented control (system setting by default). */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, read, () => "system" as Theme);
  return (
    <Segmented
      label="Color theme"
      size="xs"
      value={theme}
      onChange={apply}
      className="[&>button]:px-2"
      options={[
        {
          value: "system",
          ariaLabel: "Automatic (follow the device)",
          label: (
            <svg aria-hidden {...ICON}>
              <circle cx="8" cy="8" r="6" />
              <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" />
            </svg>
          ),
        },
        {
          value: "light",
          ariaLabel: "Light",
          label: (
            <svg aria-hidden {...ICON}>
              <circle cx="8" cy="8" r="3" />
              <path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1 1M11.6 11.6l1 1M3.4 12.6l1-1M11.6 4.4l1-1" />
            </svg>
          ),
        },
        {
          value: "dark",
          ariaLabel: "Dark",
          label: (
            <svg aria-hidden {...ICON}>
              <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7z" />
            </svg>
          ),
        },
      ]}
    />
  );
}

/** Runs before paint (inlined in <head>): applies a stored theme choice. */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("${KEY}");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}catch(e){}`;
