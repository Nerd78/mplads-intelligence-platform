import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { RiskDistributionChart } from "@/components/mplads/charts";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useGeoStates, useStatsOverview } from "@/lib/hooks";
import { formatNumber } from "@/lib/mplads-data";

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

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Analytics</p>
        <h2 className="text-lg font-semibold text-foreground">National intelligence</h2>
        <p className="text-sm text-muted-foreground">Full anomaly composition and state-by-state risk ranking across every loaded work.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RiskDistributionChart data={overview?.severity_breakdown} loading={isLoading} />

        <Card className="border-border/80 shadow-none lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Full anomaly composition</CardTitle>
            <p className="text-xs text-muted-foreground">Every rule/ML-outlier signal, most common first.</p>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <TableSkeleton rows={5} cols={2} />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Signal</TableHead>
                    <TableHead className="text-right">Works flagged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {anomalyRows.map(([label, count]) => (
                    <TableRow key={label}>
                      <TableCell className="text-xs">{label.replaceAll("_", " ")}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatNumber(count)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/80 shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">All states, ranked by average risk</CardTitle>
        </CardHeader>
        <CardContent>
          {statesLoading ? (
            <TableSkeleton rows={10} cols={5} />
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-card">
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
                    <TableRow key={s.state} className="cursor-pointer" onClick={() => navigate({ to: "/state-intelligence", search: { state: s.state } })}>
                      <TableCell className="text-xs font-medium">{s.state}</TableCell>
                      <TableCell>
                        <SeverityBadge severity={severityFor(s.avg_composite_score)} />
                      </TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{formatNumber(s.work_count)}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{s.critical_count}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums">{s.high_count}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.top_anomaly_label?.replaceAll("_", " ") ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
