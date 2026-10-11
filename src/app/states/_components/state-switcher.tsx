"use client";

import { useRouter } from "next/navigation";

import { useScenario } from "@/components/scenario/scenario";
import { STATES } from "@/lib/data/states";
import { stateHref } from "@/lib/routes";

const SORTED = [...STATES].sort((a, b) => a.name.localeCompare(b.name));

/** Jump to another state's page, keeping the scenario. */
export function StateSwitcher({ current }: { current: string }) {
  const router = useRouter();
  const { href } = useScenario();
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-2">
      <span>Jump to</span>
      <select
        value={current}
        onChange={(e) => router.push(href(stateHref(e.target.value)))}
        className="h-8 rounded-md border border-line bg-surface px-2 text-sm text-ink"
      >
        {SORTED.map((s) => (
          <option key={s.postal} value={s.postal}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
