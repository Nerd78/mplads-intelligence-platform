import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertOctagon, Banknote, FlaskConical, IndianRupee, Layers, Siren } from "lucide-react";

import { KpiCard } from "@/components/mplads/KpiCard";
import { Panel, PanelHeader, PageHeader } from "@/components/mplads/Panel";
import { RiskMap } from "@/components/mplads/RiskMap";
import { AnomalyDistributionChart, RiskByStateChart } from "@/components/mplads/charts";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
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

  const totalWorks = overview?.total_works;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="National risk command center"
        title="MPLADS anomaly overview"
        description="Every loaded work scored by the rule engine and Isolation Forest, aggregated to state and MP level."
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Total works" value={formatNumber(totalWorks)} icon={Layers} loading={isLoading} />
        <KpiCard
          label="Expenditure"
          value={formatCurrency(overview?.total_expenditure)}
          icon={IndianRupee}
          loading={isLoading}
          footnote="recorded across all works"
          explanation="Sum of recorded expenditure across every loaded work."
        />
        <KpiCard
          label="Critical"
          value={formatNumber(overview?.severity_breakdown.Critical)}
          icon={Siren}
          tone="critical"
          loading={isLoading}
          footnote="score above 80"
        />
        <KpiCard
          label="High risk"
          value={formatNumber(overview?.severity_breakdown.High)}
          icon={AlertOctagon}
          tone="warning"
          loading={isLoading}
          footnote="score 61–80"
        />
        <KpiCard label="Real records" value={formatNumber(overview?.real_count)} icon={Banknote} loading={isLoading} footnote="from eSAKSHI" />
        <KpiCard
          label="Synthetic"
          value={formatNumber(overview?.synthetic_count)}
          icon={FlaskConical}
          loading={isLoading}
          footnote="labeled benchmark"
          explanation="Records with injected, independently-labeled fraud scenarios used to validate the detection engine."
        />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <Panel className="xl:col-span-3">
          <PanelHeader
            title="National risk map"
            description="Shaded by quintile — select a state to drill into its works."
          />
          <div className="h-[400px] p-3">
            <RiskMap compact onStateClick={(state) => navigate({ to: "/state-intelligence", search: { state } })} />
          </div>
        </Panel>
        <div className="xl:col-span-2">
          <AnomalyDistributionChart data={overview?.anomaly_type_counts} loading={isLoading} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Priority investigation queue"
            description="Worst-scoring open cases first."
            actions={
              <button
                type="button"
                onClick={() => navigate({ to: "/risk-queue" })}
                className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-blue-700 transition-colors hover:bg-blue-50"
              >
                View all
              </button>
            }
          />
          {!queue || queue.items.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No open cases" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken">
                  <TableHead>Work</TableHead>
                  <TableHead>Risk</TableHead>
                  <TableHead className="text-right">Expenditure</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {queue.items.map((w) => (
                  <TableRow
                    key={w.work_id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/project-investigation", search: { work_id: w.work_id } })}
                  >
                    <TableCell className="max-w-[240px] truncate text-xs text-ink" title={w.work_description ?? undefined}>
                      {w.work_description || w.work_id}
                    </TableCell>
                    <TableCell>
                      <SeverityBadge severity={w.severity} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right text-xs text-ink tnum">
                      {formatCurrency(w.expenditure)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <RiskByStateChart
          data={overview?.top_states}
          loading={isLoading}
          onBarClick={(state) => navigate({ to: "/state-intelligence", search: { state } })}
        />
      </div>

      <Panel>
        <PanelHeader title="Highest-risk MPs" description="Ranked by aggregate risk across each MP's works." />
        {!overview || overview.top_mps.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No scored MPs yet" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-surface-sunken">
                  <TableHead>MP</TableHead>
                  <TableHead>State</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Critical works</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {overview.top_mps.map((mp) => (
                  <TableRow
                    key={mp.mp_id}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/mp-intelligence", search: { mp_id: mp.mp_id } })}
                  >
                    <TableCell className="text-xs font-medium text-ink">{mp.name}</TableCell>
                    <TableCell className="text-xs text-ink-muted">{mp.state}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={mp.aggregate_severity} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-ink tnum">{mp.critical_risk_works_count ?? 0}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Panel>
    </div>
  );
}
