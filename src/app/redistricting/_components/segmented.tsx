"use client";

// A small toggle group in the reference dashboard's style (see the "Color seats by" control).
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  /** Accessible name of the group. */
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="inline-flex max-w-full rounded-lg border border-line p-0.5 text-xs">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`rounded-md px-2.5 py-1 font-medium whitespace-nowrap ${value === o.value ? "bg-ink text-surface" : "text-ink-2 hover:text-ink"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
