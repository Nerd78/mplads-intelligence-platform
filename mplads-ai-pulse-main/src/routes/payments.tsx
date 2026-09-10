import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Ban, ChevronLeft, ChevronRight } from "lucide-react";

import { FilterBar, SearchInput } from "@/components/mplads/filters";
import { Panel, PageHeader } from "@/components/mplads/Panel";
import { cn } from "@/lib/utils";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { usePayments } from "@/lib/hooks";
import { formatCurrency, formatDate } from "@/lib/mplads-data";
import type { Loose } from "@/lib/types";

type Search = Loose<{ work_id: string; vendor_id: string; offset: number }>;

export const Route = createFileRoute("/payments")({
  head: () => ({ meta: [{ title: "Payments - MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    work_id: typeof search["work_id"] === "string" ? search["work_id"] : undefined,
    vendor_id: typeof search["vendor_id"] === "string" ? search["vendor_id"] : undefined,
    offset: Number(search["offset"]) || 0,
  }),
  component: PaymentsPage,
});

const PAGE_SIZE = 50;

function PaymentsPage() {
  const navigate = useNavigate();
  const { work_id, vendor_id, offset = 0 } = Route.useSearch();
  const { data, isLoading, isError, error, refetch, isFetching } = usePayments({ work_id, vendor_id, limit: PAGE_SIZE, offset });

  const patch = (p: Partial<Search>) => navigate({ to: "/payments", search: { work_id, vendor_id, offset: 0, ...p } });

  return (
    <div className="space-y-4">
      <PageHeader
        eyebrow="Investigations"
        title="Payments"
        description="Transaction-level payment ledger. Coverage is synthetic-only in this dataset - real works are tracked via their recorded expenditure, not a per-payment ledger."
      />

      <Panel className="p-3">
        <FilterBar>
          <SearchInput value={vendor_id} onChange={(v) => patch({ vendor_id: v })} placeholder="Filter by vendor ID…" />
        </FilterBar>
      </Panel>

      {isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={refetch} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No payments match these filters" />
      ) : (
        <div className="space-y-2">
          <div className={cn("overflow-x-auto rounded-lg border border-border", isFetching && "opacity-60")}>
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken">
                  <TableHead>Date</TableHead>
                  <TableHead>Work</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.items.map((p) => (
                  <TableRow
                    key={p.payment_id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/project-investigation", search: { work_id: p.work_id } })}
                  >
                    <TableCell className="text-xs">{formatDate(p.payment_date)}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-xs">{p.work_id}</TableCell>
                    <TableCell className="text-xs">
                      {p.vendor_id ?? "-"}
                      {p.is_vendor_blacklisted && <Ban className="ml-1 inline h-3 w-3 text-sev-critical" />}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{p.payment_type ?? "-"}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{formatCurrency(p.payment_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{data.total.toLocaleString("en-IN")} payments</span>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={offset === 0} onClick={() => patch({ offset: Math.max(0, offset - PAGE_SIZE) })}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="outline" className="h-7 w-7" disabled={offset + PAGE_SIZE >= data.total} onClick={() => patch({ offset: offset + PAGE_SIZE })}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
