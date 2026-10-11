"use client";

// Tiny URL-search-param state. Reads location.search through useSyncExternalStore, so
// prerendered pages need no Suspense boundary: the server (and the first client render)
// sees the defaults, then the browser's URL takes over. Writes use history.replaceState,
// which keeps every view shareable without adding history entries on each slider move.
import { useCallback, useMemo, useSyncExternalStore } from "react";

const EVENT = "urlstatechange";

function subscribe(onChange: () => void) {
  window.addEventListener("popstate", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

const getSearch = () => window.location.search;
const getServerSearch = () => "";

/** The raw query string ("" on the server and during hydration). */
export function useSearchString(): string {
  return useSyncExternalStore(subscribe, getSearch, getServerSearch);
}

export function useSearch(): URLSearchParams {
  const search = useSearchString();
  return useMemo(() => new URLSearchParams(search), [search]);
}

/** Replace some query params (null or "" removes one) without a navigation. */
export function setSearchParams(updates: Record<string, string | null | undefined>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(updates)) {
    if (value == null || value === "") params.delete(key);
    else params.set(key, value);
  }
  const query = params.toString();
  const url = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event(EVENT));
}

/** One query param as typed state. */
export function useQueryParam<T>(
  key: string,
  fallback: T,
  parse: (raw: string) => T | undefined,
  serialize: (value: T) => string = String,
): [T, (value: T | null) => void] {
  const search = useSearch();
  const raw = search.get(key);
  const parsed = raw == null ? undefined : parse(raw);
  const value = parsed === undefined ? fallback : parsed;
  const set = useCallback(
    (next: T | null) => setSearchParams({ [key]: next == null ? null : serialize(next) }),
    [key, serialize],
  );
  return [value, set];
}

export const parseNumber = (raw: string) => {
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
};

export const parseList = (raw: string) => raw.split(",").filter(Boolean);
export const serializeList = (list: string[]) => list.join(",");
