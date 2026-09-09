import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./SeverityBadge";
import { DataSourceBadge } from "./DataSourceBadge";
import { EmptyState, ErrorState, TableSkeleton } from "./StateViews";
import { formatCurrency, formatPercent } from "@/lib/mplads-data";
import { useWorks } from "@/lib/hooks";
import type { WorksFilters } from "@/lib/api";

interface WorksTableProps {
  filters: WorksFilters;
  onPageChange: (offset: number) => void;
  onSortChange?: ((sort: string) => void) | undefined;
  emptyDescription?: string | undefined;
}

const PAGE_SIZE = 50;

export function WorksTable({ filters, onPageChange, onSortChange, emptyDescription }: WorksTableProps) {
  const navigate = useNavigate();
  const { data, isLoading, isError, error, refetch, isFetching } = useWorks({ limit: PAGE_SIZE, ...filters });

  if (isLoading) return <TableSkeleton rows={8} cols={7} />;
  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;
  if (!data || data.items.length === 0) {
    return <EmptyState title="No works match these filters" description={emptyDescription} />;
  }

  const offset = filters.offset ?? 0;
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="cursor-pointer select-none"
                onClick={() => onSortChange?.(filters.sort === "-composite_score" ? "composite_score" : "-composite_score")}
              >
                Risk
              </TableHead>
              <TableHead>Work</TableHead>
              <TableHead>MP</TableHead>
              <TableHead>State / District</TableHead>
              <TableHead>Anomaly</TableHead>
              <TableHead className="text-right">Expenditure</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {data.items.map((w) => (
              <TableRow
                key={w.work_id}
                className="cursor-pointer"
                onClick={() => navigate({ to: "/project-investigation", search: { work_id: w.work_id } })}
              >
                <TableCell>
                  <div className="flex flex-col gap-1">
                    <SeverityBadge severity={w.severity} />
                    {w.composite_score !== null && (
                      <span className="text-[11px] tabular-nums text-muted-foreground">{formatPercent(w.composite_score)}</span>
                    )}
                  </div>
                </TableCell>
                <TableCell className="max-w-[260px]">
                  <div className="truncate text-xs font-medium text-foreground" title={w.work_description ?? undefined}>
                    {w.work_description || w.work_id}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{w.work_category ?? "—"}</div>
                </TableCell>
                <TableCell className="max-w-[160px] truncate text-xs">{w.mp_name ?? "—"}</TableCell>
                <TableCell className="text-xs">
                  <div>{w.state ?? "—"}</div>
                  <div className="text-[11px] text-muted-foreground">{w.district ?? "—"}</div>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">{w.top_flag ?? "—"}</TableCell>
                <TableCell className="text-right text-xs tabular-nums">{formatCurrency(w.expenditure)}</TableCell>
                <TableCell>
                  <DataSourceBadge dataSource={w.data_source} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {data.total.toLocaleString("en-IN")} works · page {page} of {totalPages}
        </span>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="outline" className="h-7 w-7" disabled={offset === 0} onClick={() => onPageChange(Math.max(0, offset - PAGE_SIZE))}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Button>
          <Button
            size="icon"
            variant="outline"
            className="h-7 w-7"
            disabled={offset + PAGE_SIZE >= data.total}
            onClick={() => onPageChange(offset + PAGE_SIZE)}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
