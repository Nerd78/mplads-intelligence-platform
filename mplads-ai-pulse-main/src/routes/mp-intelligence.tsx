import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { AlertOctagon, IndianRupee, Layers, Siren } from "lucide-react";

import { Breadcrumbs } from "@/components/mplads/Breadcrumbs";
import { KpiCard } from "@/components/mplads/KpiCard";
import { SearchInput } from "@/components/mplads/filters";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
import { DataSourceBadge } from "@/components/mplads/DataSourceBadge";
import { ProgressComparisonChart, RiskTrendChart } from "@/components/mplads/charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useMpDetail, useMps } from "@/lib/hooks";
import { formatCurrency, formatNumber } from "@/lib/mplads-data";
import type { Loose } from "@/lib/types";

type Search = Loose<{ mp_id: string; q: string }>;

export const Route = createFileRoute("/mp-intelligence")({
  head: () => ({ meta: [{ title: "MP Intelligence — MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    mp_id: typeof search["mp_id"] === "string" ? search["mp_id"] : undefined,
    q: typeof search["q"] === "string" ? search["q"] : undefined,
  }),
  component: MpIntelligence,
});

function MpIntelligence() {
  const navigate = useNavigate();
  const { mp_id, q } = Route.useSearch();
  const { data: mp, isLoading, isError, error, refetch } = useMpDetail(mp_id);
  const { data: matches } = useMps({ search: q, limit: 8 });

  const pickMp = (id: string) => navigate({ to: "/mp-intelligence", search: { mp_id: id } });
  const setQuery = (v: string | undefined) => navigate({ to: "/mp-intelligence", search: { mp_id, q: v } });

  const progressRows = (mp?.works ?? []).slice(0, 15).map((w) => ({
    label: w.work_id.slice(-5),
    physical: w.physical_progress_percent ?? 0,
    financial: w.sanctioned_amount ? ((w.expenditure ?? 0) / w.sanctioned_amount) * 100 : 0,
  }));

  const trendRows = mp
    ? [{ label: "Latest run", score: mp.avg_composite_score ?? 0 }]
    : [];

  const flaggedFirst = [...(mp?.works ?? [])].sort((a, b) => (b.composite_score ?? 0) - (a.composite_score ?? 0));

  return (
    <div className="space-y-6">
      <Breadcrumbs items={[{ label: "MP Intelligence", to: "/mp-intelligence" }, ...(mp ? [{ label: mp.name }] : [])]} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Analytics</p>
          <h2 className="text-lg font-semibold text-foreground">MP intelligence</h2>
        </div>
        <SearchInput value={q} onChange={setQuery} placeholder="Search MP by name or constituency…" />
      </div>

      {!mp_id ? (
        <div className="space-y-2">
          {(matches?.items.length ?? 0) === 0 ? (
            <EmptyState title="Search for an MP" description="Type a name or constituency above to open their risk profile." />
          ) : (
            matches!.items.map((m) => (
              <button
                key={m.mp_id}
                onClick={() => pickMp(m.mp_id)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-card p-3 text-left text-sm hover:bg-accent"
              >
                <span>
                  <span className="font-medium">{m.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{m.state}</span>
                </span>
                <SeverityBadge severity={m.aggregate_severity} />
              </button>
            ))
          )}
        </div>
      ) : isError ? (
        <ErrorState message={(error as Error)?.message} onRetry={refetch} />
      ) : (
        <>
          <Card className="border-border/80 shadow-none">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
              <div>
                <p className="text-base font-semibold text-foreground">{mp?.name ?? "—"}</p>
                <p className="text-xs text-muted-foreground">
                  {mp?.constituency ?? "—"} · {mp?.state} · {mp?.house ?? "—"}
                </p>
              </div>
              <SeverityBadge severity={mp?.aggregate_severity} className="text-sm" />
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Works" value={formatNumber(mp?.total_works_count ?? mp?.works_scored)} icon={Layers} loading={isLoading} />
            <KpiCard label="Expenditure" value={formatCurrency(mp?.total_expenditure_amt)} icon={IndianRupee} loading={isLoading} />
            <KpiCard label="Critical works" value={formatNumber(mp?.critical_risk_works_count)} icon={Siren} tone="critical" loading={isLoading} />
            <KpiCard label="High-risk works" value={formatNumber(mp?.high_risk_works_count)} icon={AlertOctagon} tone="warning" loading={isLoading} />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <RiskTrendChart data={trendRows} loading={isLoading} />
            <ProgressComparisonChart data={progressRows} loading={isLoading} />
          </div>

          <Card className="border-border/80 shadow-none">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">Project portfolio — highest risk first</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton rows={6} cols={6} />
              ) : flaggedFirst.length === 0 ? (
                <EmptyState title="No works recorded for this MP" />
              ) : (
                <div className="max-h-[420px] overflow-y-auto">
                  <Table>
                    <TableHeader className="sticky top-0 bg-card">
                      <TableRow>
                        <TableHead>Work</TableHead>
                        <TableHead>Risk</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Expenditure</TableHead>
                        <TableHead>Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flaggedFirst.map((w) => (
                        <TableRow
                          key={w.work_id}
                          className="cursor-pointer"
                          onClick={() => navigate({ to: "/project-investigation", search: { work_id: w.work_id } })}
                        >
                          <TableCell className="max-w-[240px] truncate text-xs">{w.work_description || w.work_id}</TableCell>
                          <TableCell>
                            <SeverityBadge severity={w.severity} />
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{w.status ?? "—"}</TableCell>
                          <TableCell className="text-right text-xs tabular-nums">{formatCurrency(w.expenditure)}</TableCell>
                          <TableCell>
                            <DataSourceBadge dataSource={w.data_source} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
