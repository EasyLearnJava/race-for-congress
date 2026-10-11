// Explorer filters: parsed from the query string (the URL contract in docs/ANALYTICS.md),
// applied to the House races, and written back with setSearchParams. Pure apart from the
// setters, so the filter bar can read the live URL while the charts read a deferred copy.
import { STATE_BY_POSTAL } from "@/lib/data/states";
import type { HouseRace, RatingLabel } from "@/lib/data/types";
import { RATING_ORDER, isCompetitive } from "@/lib/ratings";
import { parseList, serializeList, setSearchParams } from "@/lib/url-state";

export type Held = "D" | "R";
export type SortDir = "asc" | "desc";

export interface Filters {
  q: string;
  states: string[];
  ratings: RatingLabel[];
  held: Held | null;
  open: boolean;
  newLines: boolean;
  competitive: boolean;
  /** Race ids from insights, brushing or "compare". Unknown ids are dropped. */
  ids: string[];
  sort: string | null;
  dir: SortDir;
}

/** Every query key the explorer owns ("Clear all" removes these and keeps the scenario). */
export const FILTER_KEYS = ["q", "state", "rating", "held", "open", "new", "competitive", "ids"] as const;

const flag = (v: string | null) => v === "1" || v === "true";

export function parseFilters(search: string, knownIds: ReadonlySet<string>): Filters {
  const p = new URLSearchParams(search);
  const list = (key: string) => parseList(p.get(key) ?? "").map((s) => s.trim()).filter(Boolean);
  const held = (p.get("held") ?? "").toUpperCase();
  const dir = p.get("dir");
  return {
    q: p.get("q") ?? "",
    states: unique(list("state").map((s) => s.toUpperCase()).filter((s) => STATE_BY_POSTAL[s])),
    ratings: RATING_ORDER.filter((r) => list("rating").some((x) => x.toLowerCase() === r.toLowerCase())),
    held: held === "D" || held === "R" ? held : null,
    open: flag(p.get("open")),
    newLines: flag(p.get("new")),
    competitive: flag(p.get("competitive")),
    ids: unique(list("ids").map((s) => s.toUpperCase()).filter((s) => knownIds.has(s))),
    sort: p.get("sort"),
    dir: dir === "asc" || dir === "desc" ? dir : "desc",
  };
}

function unique<T>(xs: T[]): T[] {
  return [...new Set(xs)];
}

/** Lowercased text a search query is matched against, built once per race. */
export function searchText(r: HouseRace): string {
  const short = r.district ? `${r.state}-${r.district}` : `${r.state}-al`;
  return [r.id, r.id.replace("-", ""), short, r.state, r.stateName, r.incumbent, r.heldByMember, r.dem, r.rep, r.others]
    .join(" | ")
    .toLowerCase();
}

export type FilterKey = "q" | "states" | "ratings" | "held" | "open" | "newLines" | "competitive" | "ids";

/**
 * Races passing every filter, optionally ignoring one (cross-filter charts count their own
 * dimension without their own filter, so a reader can add a second rating, say).
 */
export function applyFilters(
  races: HouseRace[],
  f: Filters,
  haystack: ReadonlyMap<string, string>,
  ignore?: FilterKey,
): HouseRace[] {
  const tokens = ignore === "q" ? [] : f.q.toLowerCase().split(/\s+/).filter(Boolean);
  const states = ignore === "states" || !f.states.length ? null : new Set(f.states);
  const ratings = ignore === "ratings" || !f.ratings.length ? null : new Set<string>(f.ratings);
  const ids = ignore === "ids" || !f.ids.length ? null : new Set(f.ids);
  return races.filter((r) => {
    if (states && !states.has(r.state)) return false;
    if (ratings && !ratings.has(r.rating)) return false;
    if (ignore !== "held" && f.held && r.heldBy !== f.held) return false;
    if (ignore !== "open" && f.open && !r.openSeat) return false;
    if (ignore !== "newLines" && f.newLines && !r.newLines) return false;
    if (ignore !== "competitive" && f.competitive && !isCompetitive(r.rating)) return false;
    if (ids && !ids.has(r.id)) return false;
    if (tokens.length) {
      const text = haystack.get(r.id) ?? "";
      if (!tokens.every((t) => text.includes(t))) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: Filters): number {
  return (
    (f.q.trim() ? 1 : 0) +
    f.states.length +
    f.ratings.length +
    (f.held ? 1 : 0) +
    (f.open ? 1 : 0) +
    (f.newLines ? 1 : 0) +
    (f.competitive ? 1 : 0) +
    (f.ids.length ? 1 : 0)
  );
}

// ---- Writers ---------------------------------------------------------------------------------

export const setQuery = (q: string) => setSearchParams({ q: q || null });
export const setStates = (states: string[]) => setSearchParams({ state: states.length ? serializeList(states) : null });
export const setRatings = (ratings: RatingLabel[]) =>
  setSearchParams({ rating: ratings.length ? serializeList(RATING_ORDER.filter((r) => ratings.includes(r))) : null });
export const setHeld = (held: Held | null) => setSearchParams({ held });
export const setFlag = (key: "open" | "new" | "competitive", on: boolean) => setSearchParams({ [key]: on ? "1" : null });
export const setIds = (ids: string[]) => setSearchParams({ ids: ids.length ? serializeList(ids) : null });
export const setSort = (sort: string | null, dir: SortDir) => setSearchParams({ sort, dir: sort ? dir : null });
export const clearFilters = () => setSearchParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])));

export function toggle<T>(list: T[], item: T): T[] {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}
