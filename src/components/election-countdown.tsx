"use client";

import { useSyncExternalStore } from "react";

// Midnight US Eastern (EST, UTC-5) at the start of Election Day, Tue Nov 3 2026.
const ELECTION_DAY_MS = Date.UTC(2026, 10, 3, 5);
const DAY_MS = 86_400_000;

const subscribe = () => () => {};
const getDaysLeft = () => Math.ceil((ELECTION_DAY_MS - Date.now()) / DAY_MS);
// The page is prerendered, so the server shows the date and the browser fills in the count.
const getServerDaysLeft = () => null;

function label(daysLeft: number | null) {
  if (daysLeft === null || daysLeft < 0) return "Election Day · Nov 3, 2026";
  if (daysLeft === 0) return "Election Day is today";
  if (daysLeft === 1) return "1 day to Election Day";
  return `${daysLeft} days to Election Day`;
}

export function ElectionCountdown() {
  const daysLeft = useSyncExternalStore(subscribe, getDaysLeft, getServerDaysLeft);

  return (
    <p className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium text-muted tabular-nums">
      <span aria-hidden className="flex">
        <span className="size-1.5 rounded-full bg-dem" />
        <span className="size-1.5 rounded-full bg-rep" />
      </span>
      {label(daysLeft)}
    </p>
  );
}
