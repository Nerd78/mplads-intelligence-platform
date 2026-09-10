import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Search, X } from "lucide-react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;

/**
 * Three-state column sort: ascending -> descending -> back to the table's
 * natural order. The third state matters — once a user has sorted, there is
 * otherwise no way back to the ranking the page was built around (here, the
 * server's risk ordering) short of a reload.
 */
export function useSort(initial: SortState = null) {
  const [sort, setSort] = useState<SortState>(initial);

  const toggle = (key: string) =>
    setSort((cur) => {
      if (!cur || cur.key !== key) return { key, dir: "asc" };
      if (cur.dir === "asc") return { key, dir: "desc" };
      return null;
    });

  return { sort, toggle, reset: () => setSort(null) };
}

export function SortableHead({
  label,
  sortKey,
  sort,
  onToggle,
  align = "left",
  className,
}: {
  label: string;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  align?: "left" | "right";
  className?: string | undefined;
}) {
  const active = sort?.key === sortKey;
  const dir = active ? sort.dir : null;

  return (
    <TableHead className={cn(align === "right" && "text-right", className)}>
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        aria-label={`Sort by ${label}${dir ? ` (${dir}ending)` : ""}`}
        className={cn(
          // The icon always follows the label. Reversing the row for
          // right-aligned columns put the chevron on the opposite side from
          // every other header, which read as a rendering bug. Right-aligned
          // columns instead push the whole label+icon group to the end.
          "flex items-center gap-1 rounded transition-colors hover:text-blue-800",
          active ? "font-semibold text-blue-800" : "text-ink-muted",
          align === "right" ? "w-full justify-end" : "justify-start",
        )}
      >
        {label}
        {dir === "asc" ? (
          <ArrowUp className="h-3 w-3" />
        ) : dir === "desc" ? (
          <ArrowDown className="h-3 w-3" />
        ) : (
          <ChevronsUpDown className="h-3 w-3 opacity-60" />
        )}
      </button>
    </TableHead>
  );
}

/**
 * Sorts a copy of `rows` by the accessor registered for the active key.
 * Returns the input untouched when sort is null, so the caller's natural
 * order is preserved rather than being re-derived.
 */
export function useSortedRows<T>(
  rows: T[],
  sort: SortState,
  accessors: Record<string, (row: T) => string | number | null | undefined>,
) {
  return useMemo(() => {
    if (!sort) return rows;
    const get = accessors[sort.key];
    if (!get) return rows;

    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = get(a);
      const bv = get(b);
      // Nulls sort last in both directions -- a missing value is not
      // "smallest", it is unknown, and burying it keeps the useful rows on top.
      if (av === null || av === undefined) return 1;
      if (bv === null || bv === undefined) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
      return String(av).localeCompare(String(bv)) * factor;
    });
  }, [rows, sort, accessors]);
}

export function TableSearch({
  value,
  onChange,
  placeholder = "Search…",
  count,
  noun = "rows",
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string | undefined;
  count?: number | undefined;
  noun?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative w-full sm:max-w-xs">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-8 w-full [&::-webkit-search-cancel-button]:appearance-none rounded-md border border-border bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-ink-subtle focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      {count !== undefined && (
        <span className="text-xs text-ink-muted tnum">
          {count.toLocaleString("en-IN")} {noun}
        </span>
      )}
    </div>
  );
}
