import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertOctagon, IndianRupee, Layers, Siren } from "lucide-react";

import { Breadcrumbs } from "@/components/mplads/Breadcrumbs";
import { KpiCard } from "@/components/mplads/KpiCard";
import { DistrictSelect, StateSelect } from "@/components/mplads/filters";
import { RiskDistributionChart } from "@/components/mplads/charts";
import { WorksTable } from "@/components/mplads/WorksTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useStatsDistrict, useStatsState } from "@/lib/hooks";
import { formatCurrency, formatNumber } from "@/lib/mplads-data";
import type { Loose } from "@/lib/types";

type Search = Loose<{ state: string; district: string; offset: number }>;

export const Route = createFileRoute("/district-intelligence")({
  head: () => ({ meta: [{ title: "District Intelligence — MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    state: typeof search["state"] === "string" ? search["state"] : undefined,
    district: typeof search["district"] === "string" ? search["district"] : undefined,
    offset: Number(search["offset"]) || 0,
  }),
  component: DistrictIntelligence,
});

function DistrictIntelligence() {
  const navigate = useNavigate();
  const { state, district, offset } = Route.useSearch();
  const { data: stateData } = useStatsState(state);
  const { data, isLoading, isError, error, refetch } = useStatsDistrict(district, state);

  const setState = (v: string | undefined) => navigate({ to: "/district-intelligence", search: { state: v, district: undefined, offset: 0 } });
  const setDistrict = (v: string | undefined) => navigate({ to: "/district-intelligence", search: { state, district: v, offset: 0 } });
  const setOffset = (o: number) => navigate({ to: "/district-intelligence", search: { state, district, offset: o } });

  const districtOptions = (stateData?.districts ?? []).map((d) => d.district);

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          ...(state ? [{ label: state, to: "/state-intelligence", search: { state } }] : []),
          { label: "District Intelligence", to: "/district-intelligence" },
          ...(district ? [{ label: district }] : []),
        ]}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Analytics</p>
          <h2 className="text-lg font-semibold text-foreground">District intelligence</h2>
        </div>
        <div className="flex gap-2">
          <StateSelect value={state} onChange={setState} />
          <DistrictSelect districts={districtOptions} value={district} onChange={setDistrict} disabled={!state} />
        </div>
      </div>

      {!state || !district ? (
        <EmptyState title="Pick a state and district" description="Choose both above to see district-level KPIs, MP ranking and works." />
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

            <Card className="border-border shadow-none lg:col-span-2">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">MPs active in this district</CardTitle>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <TableSkeleton rows={5} cols={3} />
                ) : !data || data.mps.length === 0 ? (
                  <EmptyState title="No MPs recorded" />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>MP</TableHead>
                        <TableHead className="text-right">Works</TableHead>
                        <TableHead className="text-right">Avg score</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.mps.map((mp) => (
                        <TableRow key={mp.mp_id} className="cursor-pointer" onClick={() => navigate({ to: "/mp-intelligence", search: { mp_id: mp.mp_id } })}>
                          <TableCell className="text-xs font-medium">{mp.name}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatNumber(mp.work_count)}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{mp.avg_composite_score.toFixed(0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="border-border shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                High-risk works in {district}, {state}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <WorksTable filters={{ state, district, offset }} onPageChange={setOffset} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
