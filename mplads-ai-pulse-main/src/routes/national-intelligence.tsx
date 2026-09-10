import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RiskDistributionChart } from "@/components/mplads/charts";
import { HouseComparison } from "@/components/mplads/HouseComparison";
import { Panel, PanelHeader, PageHeader } from "@/components/mplads/Panel";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useGeoStates, useStatsOverview } from "@/lib/hooks";
import { formatAnomalyLabel, formatNumber } from "@/lib/mplads-data";

export const Route = createFileRoute("/national-intelligence")({
  head: () => ({ meta: [{ title: "National Intelligence — MPLADS Intelligence" }] }),
  component: NationalIntelligence,
});

function severityFor(score: number) {
  if (score >= 81) return "Critical" as const;
  if (score >= 61) return "High" as const;
  if (score >= 31) return "Medium" as const;
  return "Low" as const;
}

function NationalIntelligence() {
  const navigate = useNavigate();
  const { data: overview, isLoading, isError, error, refetch } = useStatsOverview();
  const { data: states, isLoading: statesLoading } = useGeoStates();

  if (isError) return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;

  const sortedStates = [...(states ?? [])].sort((a, b) => b.avg_composite_score - a.avg_composite_score);
  const anomalyRows = Object.entries(overview?.anomaly_type_counts ?? {})
    .filter(([label]) => label !== "NORMAL")
    .sort((a, b) => b[1] - a[1]);
  const maxAnomaly = Math.max(0, ...anomalyRows.map(([, c]) => c));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Analytics"
        title="National intelligence"
        description="Full anomaly composition and state-by-state risk ranking across every loaded work."
      />

      <HouseComparison />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RiskDistributionChart data={overview?.severity_breakdown} loading={isLoading} />

        <Panel className="lg:col-span-2">
          <PanelHeader title="Full anomaly composition" description="Every rule and ML-outlier signal, most common first." />
          {isLoading ? (
            <div className="p-4">
              <TableSkeleton rows={5} cols={2} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-surface-sunken">
                    <TableHead>Signal</TableHead>
                    <TableHead className="w-[45%]">Share</TableHead>
                    <TableHead className="text-right">Works flagged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalyRows.map(([label, count]) => (
                    <TableRow key={label}>
                      <TableCell className="whitespace-nowrap text-xs text-ink">{formatAnomalyLabel(label)}</TableCell>
                      <TableCell>
                        {/* Inline bar: the counts span 52 to 35,045, so the
                            numbers alone don't convey how lopsided this is. */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-inset">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${maxAnomaly ? Math.max(2, (count / maxAnomaly) * 100) : 0}%` }}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-xs text-ink tnum">{formatNumber(count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="All states, ranked by average risk" description="Select a state to open its intelligence view." />
        {statesLoading ? (
          <div className="p-4">
            <TableSkeleton rows={10} cols={5} />
          </div>
        ) : (
          <div className="max-h-[520px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-surface-sunken">
                <TableRow>
                  <TableHead>State</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead className="text-right">Works</TableHead>
                  <TableHead className="text-right">Critical</TableHead>
                  <TableHead className="text-right">High</TableHead>
                  <TableHead>Top signal</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedStates.map((s) => (
                  <TableRow
                    key={s.state}
                    className="cursor-pointer"
                    onClick={() => navigate({ to: "/state-intelligence", search: { state: s.state } })}
                  >
                    <TableCell className="whitespace-nowrap text-xs font-medium text-ink">{s.state}</TableCell>
                    <TableCell>
                      <SeverityBadge severity={severityFor(s.avg_composite_score)} />
                    </TableCell>
                    <TableCell className="text-right text-xs text-ink tnum">{formatNumber(s.work_count)}</TableCell>
                    <TableCell className="text-right text-xs text-ink tnum">{s.critical_count}</TableCell>
                    <TableCell className="text-right text-xs text-ink tnum">{s.high_count}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-ink-muted">
                      {s.top_anomaly_label ? formatAnomalyLabel(s.top_anomaly_label) : "—"}
                    </TableCell>
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
