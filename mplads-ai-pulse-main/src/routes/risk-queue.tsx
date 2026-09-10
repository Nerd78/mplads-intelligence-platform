import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Ban, FlaskConical } from "lucide-react";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { FilterBar, DataSourceSelect, DistrictSelect, StateSelect } from "@/components/mplads/filters";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
import { DataSourceBadge } from "@/components/mplads/DataSourceBadge";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useAlerts } from "@/lib/hooks";
import { formatCurrency, formatDistrict } from "@/lib/mplads-data";
import type { Loose } from "@/lib/types";

type Search = Loose<{ severity: string; state: string; district: string; data_source: string; offset: number }>;

export const Route = createFileRoute("/risk-queue")({
  head: () => ({ meta: [{ title: "Risk Queue — MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    severity: typeof search["severity"] === "string" ? search["severity"] : undefined,
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    district: typeof search["district"] === "string" ? search["district"] : undefined,
    data_source: typeof search["data_source"] === "string" ? search["data_source"] : undefined,
    offset: Number(search["offset"]) || 0,
  }),
  component: RiskQueue,
});

const PAGE_SIZE = 25;

function RiskQueue() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const { severity, state, district, data_source, offset = 0 } = search;

  const patch = (p: Partial<Search>) => navigate({ to: "/risk-queue", search: { ...search, offset: 0, ...p } });

  const { data, isLoading, isError, error, refetch, isFetching } = useAlerts({
    severity,
    state,
    district,
    data_source,
    limit: PAGE_SIZE,
    offset,
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Investigations</p>
          <h2 className="text-lg font-semibold text-foreground">Risk queue</h2>
          <p className="text-sm text-muted-foreground">Every work at Medium severity or above, worst-first. Expand a case to see the evidence.</p>
        </div>
      </div>

      <Tabs value={severity ?? "all"} onValueChange={(v) => patch({ severity: v === "all" ? undefined : v })}>
        <TabsList>
          <TabsTrigger value="all">All</TabsTrigger>
          <TabsTrigger value="Critical">Critical</TabsTrigger>
          <TabsTrigger value="High">High</TabsTrigger>
          <TabsTrigger value="Medium">Medium</TabsTrigger>
          <TabsTrigger value="Low">Low</TabsTrigger>
        </TabsList>
      </Tabs>

      <FilterBar>
        <StateSelect value={state} onChange={(v) => patch({ state: v, district: undefined })} />
        <DistrictSelect districts={[]} value={district} onChange={(v) => patch({ district: v })} disabled={!state} />
        <DataSourceSelect value={data_source} onChange={(v) => patch({ data_source: v })} />
      </FilterBar>

      {isLoading ? (
        <TableSkeleton rows={8} cols={5} />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={refetch} />
      ) : !data || data.items.length === 0 ? (
        <EmptyState title="No cases match these filters" />
      ) : (
        <div className={isFetching ? "opacity-60 transition-opacity" : "transition-opacity"}>
          <Accordion type="single" collapsible className="space-y-2">
            {data.items.map((item) => (
              <AccordionItem key={item.work_id} value={item.work_id} className="rounded-lg border border-border bg-card px-3">
                <AccordionTrigger className="hover:no-underline">
                  <div className="grid flex-1 grid-cols-2 items-center gap-2 pr-2 text-left sm:grid-cols-5">
                    <SeverityBadge severity={item.severity} />
                    <span className="col-span-2 truncate text-xs font-medium sm:col-span-2">{item.work_description || item.work_id}</span>
                    <span className="hidden text-xs text-muted-foreground sm:block">{item.state ?? "—"}</span>
                    <span className="hidden text-right text-xs tabular-nums sm:block">{formatCurrency(item.expenditure)}</span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="flex flex-wrap items-center gap-2 pb-3">
                    <DataSourceBadge dataSource={item.data_source} />
                    <span className="text-xs text-muted-foreground">
                      {item.mp_name ?? "Unknown MP"} · {formatDistrict(item.district)}, {item.state ?? "—"}
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="ml-auto gap-1.5 text-xs"
                      onClick={() => navigate({ to: "/project-investigation", search: { work_id: item.work_id } })}
                    >
                      Open case file <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  {item.flags.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No specific rule/ML signals recorded.</p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2">
                      {item.flags.map((f) => (
                        <li key={`${f.flag_label}-${f.source}`} className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                          <div className="flex items-center gap-1.5 font-medium">
                            {f.source === "ml_outlier" ? <FlaskConical className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                            {f.flag_label.replaceAll("_", " ")}
                          </div>
                          {f.detail && <p className="mt-1 text-muted-foreground">{f.detail}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{data.total.toLocaleString("en-IN")} cases</span>
            <div className="flex gap-1.5">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => patch({ offset: Math.max(0, offset - PAGE_SIZE) })}>
                Previous
              </Button>
              <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= data.total} onClick={() => patch({ offset: offset + PAGE_SIZE })}>
                Next
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
