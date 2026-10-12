"use client";

// Sortable, exportable table. Rows can link to a drill-down page; the whole row is the hit
// target and the first column carries a real link for keyboard and screen-reader users.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type ReactNode } from "react";

import { downloadCsv, toCsv } from "@/lib/csv";

export interface Column<T> {
  key: string;
  header: string;
  /** Value used for sorting and CSV export. */
  value: (row: T) => string | number | boolean | null | undefined;
  /** Optional custom cell rendering; defaults to the value. */
  cell?: (row: T) => ReactNode;
  align?: "left" | "right" | "center";
  sortable?: boolean;
  className?: string;
  /** Hide on small screens. */
  hideOnMobile?: boolean;
}

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  rowHref,
  initialSort,
  maxHeight = 640,
  csvName,
  caption,
  toolbar,
  emptyMessage = "No rows match these filters.",
  highlight,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  rowHref?: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
  maxHeight?: number;
  csvName?: string;
  caption?: ReactNode;
  toolbar?: ReactNode;
  emptyMessage?: string;
  highlight?: (row: T) => boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return rows;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = col.value(a);
      const vb = col.value(b);
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }, [rows, columns, sort]);

  const toggleSort = (key: string) =>
    setSort((s) => (s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const exportCsv = () =>
    downloadCsv(
      csvName ?? "table",
      toCsv(
        columns.map((c) => ({ key: c.key, label: c.header })),
        sorted.map((row) => Object.fromEntries(columns.map((c) => [c.key, c.value(row)]))),
      ),
    );

  const align = (a?: string) => (a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left");

  return (
    <div className="overflow-hidden rounded-2xl bg-surface ring-1 ring-line">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5">
        <div className="text-xs text-ink-2">
          {caption ?? (
            <>
              <span className="font-semibold text-ink tabular-nums">{rows.length}</span> rows
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {toolbar}
          <button
            type="button"
            onClick={exportCsv}
            className="rounded-md px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface-2 hover:text-ink"
          >
            Download CSV
          </button>
        </div>
      </div>
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10 bg-surface">
            <tr>
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={sort?.key === c.key ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  className={`border-b border-line px-3 py-2 text-xs font-medium whitespace-nowrap text-ink-2 ${align(c.align)} ${c.hideOnMobile ? "hidden md:table-cell" : ""}`}
                >
                  {c.sortable === false ? (
                    c.header
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggleSort(c.key)}
                      className={`inline-flex items-center gap-1 hover:text-ink ${c.align === "right" ? "flex-row-reverse" : ""}`}
                    >
                      {c.header}
                      <span aria-hidden className="w-2 text-[10px]">
                        {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : ""}
                      </span>
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-10 text-center text-sm text-ink-2">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {sorted.map((row) => {
              const href = rowHref?.(row);
              return (
                <tr
                  key={rowKey(row)}
                  onClick={href ? () => router.push(href) : undefined}
                  className={`${href ? "cursor-pointer" : ""} ${highlight?.(row) ? "bg-surface-2" : ""} hover:bg-surface-2`}
                >
                  {columns.map((c, i) => (
                    <td
                      key={c.key}
                      className={`border-b border-line px-3 py-2 tabular-nums whitespace-nowrap text-ink ${align(c.align)} ${c.hideOnMobile ? "hidden md:table-cell" : ""} ${c.className ?? ""}`}
                    >
                      {i === 0 && href ? (
                        <Link href={href} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {c.cell ? c.cell(row) : String(c.value(row) ?? "")}
                        </Link>
                      ) : c.cell ? (
                        c.cell(row)
                      ) : (
                        String(c.value(row) ?? "")
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
