"use client";

// Every chart sits in a ChartFrame: title, optional subtitle and legend, the plot, a source
// line, and two actions every analyst expects: a Table view (the accessible twin of the
// chart) and a CSV download of exactly the data plotted.
import { useState, type ReactNode } from "react";

import { Segmented } from "@/components/ui/segmented";
import { downloadCsv, toCsv, type CsvColumn } from "@/lib/csv";
import { useMeasure } from "./use-measure";

export interface FrameTable {
  columns: (CsvColumn & { align?: "left" | "right"; format?: (value: unknown) => string })[];
  rows: Record<string, unknown>[];
}

export function ChartFrame({
  title,
  subtitle,
  legend,
  source,
  table,
  csvName,
  height,
  actions,
  className = "",
  children,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  legend?: ReactNode;
  source?: ReactNode;
  /** Data for the table view and CSV download. */
  table?: FrameTable;
  csvName?: string;
  /** Height of the plot area, including axis labels. Reserved before the chart measures itself. */
  height: number;
  actions?: ReactNode;
  className?: string;
  children: (width: number) => ReactNode;
}) {
  const [ref, width] = useMeasure<HTMLDivElement>();
  const [view, setView] = useState<"chart" | "table">("chart");

  return (
    <figure className={`tile reveal flex flex-col p-5 sm:p-6 ${className}`}>
      <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="text-base font-semibold tracking-[-0.01em] text-ink">{title}</div>
          {subtitle && <div className="mt-0.5 text-xs leading-5 text-ink-2">{subtitle}</div>}
        </div>
        {/* Wraps on narrow screens: a chart's own toggle plus Chart/Table and CSV can exceed 360px. */}
        <div className="flex max-w-full min-w-0 flex-wrap items-center gap-1">
          {actions}
          {table && (
            <>
              <Segmented
                label="Show as"
                size="xs"
                value={view}
                onChange={setView}
                options={[
                  { value: "chart", label: "Chart" },
                  { value: "table", label: "Table" },
                ]}
              />
              <button
                type="button"
                onClick={() => downloadCsv(csvName ?? "data", toCsv(table.columns, table.rows))}
                className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[11px] font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
                aria-label="Download CSV"
              >
                <svg aria-hidden width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v8m0 0-3-3m3 3 3-3M3 12.5h10" />
                </svg>
                CSV
              </button>
            </>
          )}
        </div>
      </figcaption>
      {legend && view === "chart" && <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">{legend}</div>}
      {view === "chart" ? (
        <div ref={ref} className="relative w-full" style={{ minHeight: height }}>
          {width > 0 && children(width)}
        </div>
      ) : (
        <div className="max-h-[420px] overflow-auto rounded-lg border border-line" style={{ minHeight: Math.min(height, 420) }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-2 text-left text-ink-2">
              <tr>
                {table!.columns.map((c) => (
                  <th key={c.key} className={`px-3 py-2 font-medium ${c.align === "right" ? "text-right" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table!.rows.map((row, i) => (
                <tr key={i} className="border-t border-line">
                  {table!.columns.map((c) => (
                    <td key={c.key} className={`px-3 py-1.5 tabular-nums text-ink ${c.align === "right" ? "text-right" : ""}`}>
                      {c.format ? c.format(row[c.key]) : String(row[c.key] ?? "")}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {source && <div className="mt-3 text-[11px] leading-4 text-muted">{source}</div>}
    </figure>
  );
}

/** Legend entry: a swatch shaped like the mark (rect for bars and fills, line for lines). */
export function LegendItem({ color, label, shape = "rect" }: { color: string; label: ReactNode; shape?: "rect" | "line" | "dot" }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        aria-hidden
        className={shape === "line" ? "h-0.5 w-3.5 rounded-full" : shape === "dot" ? "size-2.5 rounded-full" : "size-2.5 rounded-sm"}
        style={{ background: color }}
      />
      {label}
    </span>
  );
}
