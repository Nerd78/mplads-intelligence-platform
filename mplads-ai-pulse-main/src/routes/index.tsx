import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertOctagon, Banknote, FlaskConical, IndianRupee, ShieldAlert, Siren } from "lucide-react";

import { KpiCard } from "@/components/mplads/KpiCard";
import { RiskMap } from "@/components/mplads/RiskMap";
import { AnomalyDistributionChart, RiskByStateChart } from "@/components/mplads/charts";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState } from "@/components/mplads/StateViews";
import { useAlerts, useStatsOverview } from "@/lib/hooks";
import { formatCurrency, formatNumber } from "@/lib/mplads-data";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "Command Center — MPLADS Intelligence" }] }),
  component: CommandCenter,
});

function CommandCenter() {
  const navigate = useNavigate();
  const { data: overview, isLoading, isError, error, refetch } = useStatsOverview();
  const { data: queue } = useAlerts({ limit: 6 });

  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">National Risk Command Center</p>
        <h2 className="text-lg font-semibold text-foreground">MPLADS anomaly overview</h2>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total works" value={formatNumber(overview?.total_works)} icon={ShieldAlert} loading={isLoading} />
        <KpiCard
          label="Total expenditure"
          value={formatCurrency(overview?.total_expenditure)}
          icon={IndianRupee}
          loading={isLoading}
          explanation="Sum of recorded expenditure across every loaded work."
        />
        <KpiCard
          label="Critical works"
          value={formatNumber(overview?.severity_breakdown.Critical)}
          icon={Siren}
          tone="critical"
          loading={isLoading}
        />
        <KpiCard
          label="High-risk works"
          value={formatNumber(overview?.severity_breakdown.High)}
          icon={AlertOctagon}
          tone="warning"
          loading={isLoading}
        />
        <KpiCard label="Real records" value={formatNumber(overview?.real_count)} icon={Banknote} loading={isLoading} />
        <KpiCard
          label="Synthetic benchmark"
          value={formatNumber(overview?.synthetic_count)}
          icon={FlaskConical}
          loading={isLoading}
          explanation="Records with injected, independently-labeled fraud scenarios used to validate the detection engine."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Card className="border-border/80 shadow-none xl:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">National risk map</CardTitle>
          </CardHeader>
          <CardContent className="h-[380px]">
            <RiskMap compact onStateClick={(state) => navigate({ to: "/state-intelligence", search: { state } })} />
          </CardContent>
        </Card>
        <div className="xl:col-span-2">
          <AnomalyDistributionChart data={overview?.anomaly_type_counts} loading={isLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="border-border/80 shadow-none">
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Priority investigation queue</CardTitle>
          </CardHeader>
          <CardContent>
            {!queue || queue.items.length === 0 ? (
              <EmptyState title="No open cases" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Work</TableHead>
                    <TableHead>Risk</TableHead>
                    <TableHead className="text-right">Expenditure</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queue.items.map((w) => (
                    <TableRow key={w.work_id} className="cursor-pointer" onClick={() => navigate({ to: "/risk-queue" })}>
                      <TableCell className="max-w-[220px] truncate text-xs">{w.work_description || w.work_id}</TableCell>
                      <TableCell>
                        <SeverityBadge severity={w.severity} />
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatCurrency(w.expenditure)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <RiskByStateChart
          data={overview?.top_states}
          loading={isLoading}
          onBarClick={(state) => navigate({ to: "/state-intelligence", search: { state } })}
        />
      </div>

      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Highest-risk MPs</CardTitle>
        </CardHeader>
        <CardContent>
          {!overview || overview.top_mps.length === 0 ? (
            <EmptyState title="No scored MPs yet" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>MP</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Critical works</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.top_mps.map((mp) => (
                  <TableRow key={mp.mp_id} className="cursor-pointer" onClick={() => navigate({ to: "/mp-intelligence", search: { mp_id: mp.mp_id } })}>
                    <TableCell className="text-xs font-medium">{mp.name}</TableCell>
                    <TableCell className="text-xs">{mp.state}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={mp.aggregate_severity} />
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{mp.critical_risk_works_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
