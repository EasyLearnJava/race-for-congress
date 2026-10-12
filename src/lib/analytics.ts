// Product analytics: counts only. Every event and property is declared below, and none of them
// can carry which party a person picked or favors. PostHog runs only when
// NEXT_PUBLIC_POSTHOG_KEY is set; without it every call here is a no-op.
//
// Privacy settings (see docs/TRACKING.md): no cookies or storage (memory persistence), no person
// profiles, no autocapture (it would record button text such as "Democrat"), no session
// recording, and every URL is cut to its path, because /call URLs hold a person's picks.
import posthog, { type CaptureResult } from "posthog-js";

export type EnvBand = "R+10 or more" | "R+5 to R+10" | "R+0 to R+5" | "Even" | "D+0 to D+5" | "D+5 to D+10" | "D+10 or more";

type Source =
  | "search"
  | "overview"
  | "explorer"
  | "race"
  | "state"
  | "senate"
  | "call"
  | "simulator"
  | "redistricting"
  | "money"
  | "forecasters"
  | "ask"
  | "other"
  | "direct";

export type ModelSetting = "expertWeight" | "incumbency" | "sigmaNational" | "sigmaRace";

/** How a scenario change happened. Callers that know say so; the rest count as "other". */
export interface ChangeOrigin {
  how?: "drag" | "keys" | "preset" | "chart" | "other";
  surface?: "bar" | "simulator" | "chart" | "other";
}

export interface Events {
  vote_slider_changed: { how: NonNullable<ChangeOrigin["how"]>; band: EnvBand; surface: NonNullable<ChangeOrigin["surface"]> };
  model_settings_changed: { setting: ModelSetting | "reset"; surface: NonNullable<ChangeOrigin["surface"]> };
  race_opened: { race: string; chamber: "house" | "senate"; from: Source };
  maps_toggled: { control: "basis" | "compare"; to: string };
  call_progress: { called: number; deck: number; finished: boolean };
  share_clicked: { surface: "call" | "scenario" | "simulator"; method: "native" | "copy" | "image" | "story" };
  shared_visit: { surface: "call" };
  ai_question: { source: "suggestion" | "typed" };
}

let started = false;

/** Start PostHog once, in the browser, when a key is configured. */
export function initAnalytics() {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (started || !key || typeof window === "undefined") return;
  started = true;
  posthog.init(key, {
    api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com",
    persistence: "memory",
    person_profiles: "never",
    autocapture: false,
    rageclick: false,
    capture_dead_clicks: false,
    capture_heatmaps: false,
    capture_exceptions: false,
    capture_performance: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    disable_surveys: true,
    disable_product_tours: true,
    disable_conversations: true,
    disable_web_experiments: true,
    disable_external_dependency_loading: true,
    advanced_disable_flags: true,
    before_send: scrubUrls,
  });
}

/** Record one event. Safe to call anywhere: a no-op on the server or without a key. */
export function track<E extends keyof Events>(event: E, props: Events[E]) {
  if (!started) return;
  try {
    posthog.capture(event, props);
  } catch {
    // Analytics must never break the page.
  }
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Record an event once input settles (slider drags fire on every step). */
export function trackSettled<E extends keyof Events>(event: E, props: Events[E], key: string = event, delay = 800) {
  if (!started) return;
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => track(event, props), delay));
}

/** Count a page view of the current page (its URL is cut to the path before sending). */
export function pageview() {
  if (!started) return;
  posthog.capture("$pageview");
}

/** Symmetric 5-point bands of the national vote. */
export function envBand(env: number): EnvBand {
  if (env === 0) return "Even";
  const a = Math.abs(env);
  if (env > 0) return a >= 10 ? "D+10 or more" : a >= 5 ? "D+5 to D+10" : "D+0 to D+5";
  return a >= 10 ? "R+10 or more" : a >= 5 ? "R+5 to R+10" : "R+0 to R+5";
}

// Where a navigation came from, for race_opened. The router hook records the page being left;
// search marks its own navigations.
let navFrom: { path: string | null; override: Source | null } = { path: null, override: null };

export function noteNavigationFrom(path: string) {
  navFrom = { ...navFrom, path };
}

export function markNavigationSource(source: Source) {
  navFrom = { ...navFrom, override: source };
}

export function takeNavigationSource(): Source {
  const { path, override } = navFrom;
  navFrom = { path: null, override: null };
  if (override) return override;
  if (path == null) return "direct";
  if (path === "/") return "overview";
  const top = path.split("/")[1];
  if (top === "house") return path === "/house" ? "explorer" : "race";
  if (top === "states") return "state";
  if (top === "senate") return path === "/senate" ? "senate" : "race";
  const known: Record<string, Source> = {
    call: "call",
    simulator: "simulator",
    redistricting: "redistricting",
    money: "money",
    forecasters: "forecasters",
    ask: "ask",
  };
  return known[top] ?? "other";
}

/** Cut a URL (absolute or relative) to origin + path: no query string, no hash. */
export function stripUrl(value: unknown): unknown {
  if (typeof value !== "string") return value;
  if (!/^https?:\/\//.test(value)) return value.split(/[?#]/)[0];
  try {
    const u = new URL(value);
    return `${u.origin}${u.pathname}`;
  } catch {
    return value.split(/[?#]/)[0];
  }
}

function scrubProps(props: Record<string, unknown> | undefined) {
  if (!props) return;
  for (const [k, v] of Object.entries(props)) {
    if (typeof v === "string" && /^https?:\/\//.test(v)) props[k] = stripUrl(v);
  }
}

export function scrubUrls(event: CaptureResult | null): CaptureResult | null {
  if (!event) return event;
  // A shared call's page title holds its seat counts, so no event carries a title.
  delete event.properties.title;
  delete event.properties.$title;
  scrubProps(event.properties);
  scrubProps(event.$set);
  scrubProps(event.$set_once);
  return event;
}
