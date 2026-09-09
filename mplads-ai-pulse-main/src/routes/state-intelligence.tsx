import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertOctagon, IndianRupee, Layers, Siren } from "lucide-react";

import { Breadcrumbs } from "@/components/mplads/Breadcrumbs";
import { KpiCard } from "@/components/mplads/KpiCard";
import { StateSelect } from "@/components/mplads/filters";
import { RiskDistributionChart } from "@/components/mplads/charts";
import { WorksTable } from "@/components/mplads/WorksTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useStatsState } from "@/lib/hooks";
import { formatCurrency, formatNumber } from "@/lib/mplads-data";
import type { Loose } from "@/lib/types";

type Search = Loose<{ state: string; offset: number }>;

export const Route = createFileRoute("/state-intelligence")({
  head: () => ({ meta: [{ title: "State Intelligence — MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    offset: Number(search["offset"]) || 0,
  }),
  component: StateIntelligence,
});

function StateIntelligence() {
  const navigate = useNavigate();
  const { state, offset } = Route.useSearch();
  const { data, isLoading, isError, error, refetch } = useStatsState(state);

  const setState = (v: string | undefined) => navigate({ to: "/state-intelligence", search: { state: v, offset: 0 } });
  const setOffset = (o: number) => navigate({ to: "/state-intelligence", search: { state, offset: o } });

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "State Intelligence", to: "/state-intelligence" }, ...(state ? [{ label: state }] : [])]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Analytics</p>
          <h2 className="text-lg font-semibold text-foreground">State intelligence</h2>
        </div>
        <StateSelect value={state} onChange={setState} />
      </div>

      {!state ? (
        <EmptyState title="Pick a state" description="Choose a state above to see its KPIs, district ranking and works." />
      ) : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={refetch} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Total works" value={formatNumber(data?.total_works)} icon={Layers} loading={isLoading} />
            <KpiCard label="Expenditure" value={formatCurrency(data?.total_expenditure)} icon={IndianRupee} loading={isLoading} />
            <KpiCard label="Critical" value={formatNumber(data?.severity_breakdown.Critical)} icon={Siren} tone="critical" loading={isLoading} />
            <KpiCard label="High" value={formatNumber(data?.severity_breakdown.High)} icon={AlertOctagon} tone="warning" loading={isLoading} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RiskDistributionChart data={data?.severity_breakdown} loading={isLoading} />

            <Card className="border-border/80 shadow-none lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">District ranking</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <TableSkeleton rows={6} cols={3} />
                ) : !data || data.districts.length === 0 ? (
                  <EmptyState title="No districts recorded" />
                ) : (
                  <div className="max-h-[280px] overflow-y-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>District</TableHead>
                          <TableHead className="text-right">Works</TableHead>
                          <TableHead className="text-right">Avg score</TableHead>
                          <TableHead className="text-right">Critical</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.districts.map((d) => (
                          <TableRow
                            key={d.district}
                            className="cursor-pointer"
                            onClick={() => navigate({ to: "/district-intelligence", search: { state, district: d.district } })}
                          >
                            <TableCell className="text-xs font-medium">{d.district}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{formatNumber(d.work_count)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{d.avg_composite_score.toFixed(0)}</TableCell>
                            <TableCell className="text-right text-xs tabular-nums">{d.critical_count}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border/80 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Works in {state}</CardTitle>
            </CardHeader>
            <CardContent>
              <WorksTable filters={{ state, offset }} onPageChange={setOffset} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
