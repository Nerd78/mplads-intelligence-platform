import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./SeverityBadge";
import { DataSourceBadge } from "./DataSourceBadge";
import { EmptyState, ErrorState, TableSkeleton } from "./StateViews";
import { formatAnomalyLabel, formatCurrency, formatPercent } from "@/lib/mplads-data";
import { useWorks } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import type { WorksFilters } from "@/lib/api";

interface WorksTableProps {
  filters: WorksFilters;
  onPageChange: (offset: number) => void;
  onSortChange?: ((sort: string) => void) | undefined;
  emptyDescription?: string | undefined;
  /** Set false on compact embeds that already sit under a filter bar. */
  searchable?: boolean | undefined;
}

const PAGE_SIZE = 50;

function useDebounced<T>(value: T, delay = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}

export function WorksTable({
  filters,
  onPageChange,
  onSortChange,
  emptyDescription,
  searchable = true,
}: WorksTableProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const debouncedQuery = useDebounced(query);

  // A new query has to start from page 1 -- keeping the old offset can land
  // the user past the end of a smaller result set and show an empty table.
  useEffect(() => {
    if (debouncedQuery !== "") onPageChange(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedQuery]);

  const merged = useMemo<WorksFilters>(
    () => ({ limit: PAGE_SIZE, ...filters, ...(debouncedQuery ? { search: debouncedQuery } : {}) }),
    [filters, debouncedQuery],
  );

  const { data, isLoading, isError, error, refetch, isFetching } = useWorks(merged);

  const offset = filters.offset ?? 0;
  const total = data?.total ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sortDesc = filters.sort !== "composite_score";

  const searchBar = searchable ? (
    <div className="relative w-full sm:max-w-xs">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-subtle" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search works, MP, vendor…"
        aria-label="Search works"
        className="h-8 w-full rounded-md border border-border bg-surface pl-8 pr-8 text-xs text-ink placeholder:text-ink-subtle focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
      />
      {query && (
        <button
          type="button"
          onClick={() => setQuery("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle hover:text-ink"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  ) : null;

  const body = () => {
    if (isLoading) return <TableSkeleton rows={8} cols={7} />;
    if (isError) return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;
    if (!data || data.items.length === 0) {
      return (
        <EmptyState
          title={debouncedQuery ? `No works match “${debouncedQuery}”` : "No works match these filters"}
          description={debouncedQuery ? "Try a shorter or different term." : emptyDescription}
        />
      );
    }

    return (
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="bg-surface-sunken">
              <TableHead
                className="cursor-pointer select-none whitespace-nowrap"
                onClick={() => onSortChange?.(sortDesc ? "composite_score" : "-composite_score")}
              >
                <span className="inline-flex items-center gap-1">
                  Risk
                  {onSortChange &&
                    (sortDesc ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                </span>
              </TableHead>
              <TableHead>Work</TableHead>
              <TableHead>MP</TableHead>
              <TableHead>State / District</TableHead>
              <TableHead>Anomaly</TableHead>
              <TableHead className="text-right">Expenditure</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={cn("transition-opacity", isFetching && "opacity-60")}>
            {data.items.map((w) => (
              <TableRow
                key={w.work_id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/project-investigation", search: { work_id: w.work_id } })}
              >
                <TableCell>
                  <div className="flex flex-col items-start gap-1">
                    <SeverityBadge severity={w.severity} />
                    {w.composite_score !== null && (
                      <span className="text-[11px] text-ink-subtle tnum">{formatPercent(w.composite_score)}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="truncate text-xs font-medium text-ink" title={w.work_description ?? undefined}>
                    {w.work_description || w.work_id}
                  </div>
                  <div className="text-[11px] text-ink-subtle">{w.work_category ?? "—"}</div>
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-xs text-ink">{w.mp_name ?? "—"}</TableCell>
                <TableCell className="text-xs text-ink">
                  <div>{w.state ?? "—"}</div>
                  <div className="text-[11px] text-ink-subtle">{w.district ?? "—"}</div>
                </TableCell>
                <TableCell className="max-w-[170px] text-xs text-ink-muted">
                  {w.top_flag ? formatAnomalyLabel(w.top_flag) : "—"}
                </TableCell>
                <TableCell className="whitespace-nowrap text-right text-xs text-ink tnum">
                  {formatCurrency(w.expenditure)}
                </TableCell>
                <TableCell>
                  <DataSourceBadge dataSource={w.data_source} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  };

  return (
    <div className="space-y-2.5">
      {searchable && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {searchBar}
          {!isLoading && !isError && (
            <span className="text-xs text-ink-muted tnum">
              {total.toLocaleString("en-IN")} {total === 1 ? "work" : "works"}
              {debouncedQuery && " matched"}
            </span>
          )}
        </div>
      )}

      {body()}

      {!isLoading && !isError && total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
          <span className="tnum">
            Showing {(offset + 1).toLocaleString("en-IN")}–{Math.min(offset + PAGE_SIZE, total).toLocaleString("en-IN")} of{" "}
            {total.toLocaleString("en-IN")}
          </span>
          <div className="flex items-center gap-1.5">
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              aria-label="Previous page"
              disabled={offset === 0}
              onClick={() => onPageChange(Math.max(0, offset - PAGE_SIZE))}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="px-1 tnum">
              Page {page} of {totalPages.toLocaleString("en-IN")}
            </span>
            <Button
              size="icon"
              variant="outline"
              className="h-7 w-7"
              aria-label="Next page"
              disabled={offset + PAGE_SIZE >= total}
              onClick={() => onPageChange(offset + PAGE_SIZE)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
