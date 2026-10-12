"use client";

// Global search (Ctrl/Cmd+K or "/"): districts, candidates, states and Senate races.
// The index is a small static JSON file, fetched the first time the dialog opens.
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { markNavigationSource } from "@/lib/analytics";

interface Entry {
  kind: "State" | "Senate" | "House";
  label: string;
  sub: string;
  href: string;
  terms: string;
}

const normalize = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

let cache: Promise<Entry[]> | null = null;
function loadIndex(): Promise<Entry[]> {
  cache ??= fetch("/data/search.json")
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => {
      cache = null;
      return [];
    });
  return cache;
}

export function SearchButton() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]");
      if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !typing)) {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-8 items-center gap-2 rounded-md border border-line px-2.5 text-xs text-ink-2 hover:bg-surface-2 hover:text-ink"
        aria-label="Search districts, candidates and states"
      >
        <svg aria-hidden width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="7" cy="7" r="5" />
          <path d="m11 11 3.5 3.5" strokeLinecap="round" />
        </svg>
        <span className="hidden md:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 text-[10px] text-muted md:inline">Ctrl K</kbd>
      </button>
      {open && <SearchDialog onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [index, setIndex] = useState<Entry[] | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let live = true;
    loadIndex().then((entries) => live && setIndex(entries));
    inputRef.current?.focus();
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(() => {
    if (!index) return [];
    const words = normalize(query).split(/\s+/).filter(Boolean);
    if (!words.length) return index.filter((e) => e.kind !== "House").slice(0, 8);
    const scored: { e: Entry; score: number }[] = [];
    for (const e of index) {
      const hay = normalize(`${e.label} ${e.terms}`);
      if (!words.every((w) => hay.includes(w))) continue;
      const label = normalize(e.label);
      const score = (label.startsWith(words[0]) ? 0 : 1) + (e.kind === "State" ? 0 : e.kind === "Senate" ? 0.2 : 0.4);
      scored.push({ e, score });
    }
    return scored.sort((a, b) => a.score - b.score).slice(0, 12).map((s) => s.e);
  }, [index, query]);

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    onClose();
    markNavigationSource("search");
    router.push(entry.href);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[12vh]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="w-full max-w-xl overflow-hidden rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          }
          if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          }
          if (e.key === "Enter") go(results[active]);
        }}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder="District (PA-07), candidate, incumbent or state"
          aria-label="Search"
          aria-controls="search-results"
          className="w-full border-b border-line bg-transparent px-4 py-3 text-base outline-none placeholder:text-muted"
        />
        <ul id="search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {!index && <li className="px-3 py-6 text-center text-sm text-ink-2">Loading…</li>}
          {index && results.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-2">No matches</li>}
          {results.map((r, i) => (
            <li key={r.href} role="option" aria-selected={i === active}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left ${i === active ? "bg-surface-2" : ""}`}
              >
                <span className="w-14 shrink-0 text-[10px] font-semibold tracking-wider text-muted uppercase">{r.kind}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">{r.label}</span>
                  {r.sub && <span className="block truncate text-xs text-ink-2">{r.sub}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
