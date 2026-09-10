import { createFileRoute } from "@tanstack/react-router";
import { Ban, Bot, Building2, Calendar, FlaskConical, IndianRupee, ListChecks, MapPin, Receipt, User } from "lucide-react";

import { Breadcrumbs } from "@/components/mplads/Breadcrumbs";
import { Panel, PanelHeader, PanelBody } from "@/components/mplads/Panel";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SeverityBadge } from "@/components/mplads/SeverityBadge";
import { DataSourceBadge } from "@/components/mplads/DataSourceBadge";
import { EmptyState, ErrorState, CardSkeleton } from "@/components/mplads/StateViews";
import { useWorkDetail } from "@/lib/hooks";
import { formatAnomalyLabel, formatCurrency, formatDate, formatDistrict, formatPercent } from "@/lib/mplads-data";
import type { Loose } from "@/lib/types";

type Search = Loose<{ work_id: string }>;

export const Route = createFileRoute("/project-investigation")({
  head: () => ({ meta: [{ title: "Case File - MPLADS Intelligence" }] }),
  validateSearch: (search: Record<string, unknown>): Search => ({
    work_id: typeof search["work_id"] === "string" ? search["work_id"] : undefined,
  }),
  component: ProjectInvestigation,
});

function Milestone({ label, date }: { label: string; date: string | null }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className={`h-2.5 w-2.5 rounded-full ${date ? "bg-primary" : "bg-border"}`} />
      <span className="text-[11px] font-medium text-ink">{label}</span>
      <span className="text-[10px] text-ink-muted">{formatDate(date)}</span>
    </div>
  );
}

function ProjectInvestigation() {
  const { work_id } = Route.useSearch();
  const { data: work, isLoading, isError, error, refetch } = useWorkDetail(work_id);

  if (!work_id) return <EmptyState title="No case selected" description="Open a work from any table, the risk queue, or the map to see its case file." />;
  if (isLoading) return <div className="space-y-4"><CardSkeleton className="h-24" /><CardSkeleton className="h-64" /></div>;
  if (isError || !work) return <ErrorState message={(error as Error)?.message} onRetry={refetch} />;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={[
          { label: "Works", to: "/works" },
          { label: work.work_description ? work.work_description.slice(0, 40) : work.work_id },
        ]}
      />
      {/* 1. Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={work.severity} />
            <DataSourceBadge dataSource={work.data_source} />
            <span className="text-xs text-ink-muted">{work.work_id}</span>
          </div>
          <h2 className="max-w-2xl text-lg font-semibold leading-snug text-ink">{work.work_description || "Untitled work"}</h2>
          <p className="text-sm text-ink-muted">
            {work.mp_name ?? "Unknown MP"} · {work.constituency ?? "-"} · {formatDistrict(work.district)}, {work.state ?? "-"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-semibold tnum">{work.risk ? Math.round(work.risk.composite_score) : "-"}</p>
          <p className="text-xs text-ink-muted">composite risk / 100</p>
        </div>
      </div>

      {/* 2. Risk summary */}
      {work.risk && (
        <Panel>
          <PanelHeader title="Risk summary" />
          <PanelBody className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" /> Rule score</span>
                <span className="tnum text-ink">{work.risk.rule_score.toFixed(0)}</span>
              </div>
              <Progress value={work.risk.rule_score} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span className="flex items-center gap-1"><Bot className="h-3 w-3" /> ML outlier score</span>
                <span className="tnum text-ink">{work.risk.ml_score.toFixed(0)}</span>
              </div>
              <Progress value={work.risk.ml_score} className="h-1.5" />
            </div>
            <div className="text-xs text-ink-muted">
              Model <span className="text-ink">{work.risk.model_version}</span>
              <br />
              Scored {formatDate(work.risk.computed_at)}
            </div>
          </PanelBody>
        </Panel>
      )}

      {/* 3. Evidence */}
      <Panel>
        <PanelHeader title="Evidence - why this was flagged"
          description="A signal, not a finding of fraud - each item is an independently checkable rule or statistical outlier." />
        <PanelBody>
          {work.flags.length === 0 ? (
            <p className="text-xs text-ink-muted">No rule or ML-outlier signals fired for this work.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {work.flags.map((f) => (
                <li key={`${f.flag_label}-${f.source}`} className="rounded-md border border-border bg-surface-sunken p-2.5 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    {f.source === "ml_outlier" ? <FlaskConical className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                    {formatAnomalyLabel(f.flag_label)}
                  </div>
                  {f.detail && <p className="mt-1 text-ink-muted">{f.detail}</p>}
                </li>
              ))}
            </ul>
          )}
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* 4. Timeline */}
        <Panel>
          <PanelHeader title={<span className="flex items-center gap-1.5"><Calendar className="h-4 w-4" /> Timeline</span>} />
          <PanelBody>
            <div className="flex items-center justify-between">
              <Milestone label="Recommended" date={work.recommendation_date} />
              <div className="h-px flex-1 bg-border" />
              <Milestone label="Sanctioned" date={work.sanction_date} />
              <div className="h-px flex-1 bg-border" />
              <Milestone label="Expected completion" date={work.expected_completion_date} />
              <div className="h-px flex-1 bg-border" />
              <Milestone label="Completed" date={work.actual_completion_date} />
            </div>
            {(work.sanction_delay_days ?? 0) > 0 && (
              <p className="mt-3 text-xs text-ink-muted">Sanction delay: {work.sanction_delay_days} days</p>
            )}
          </PanelBody>
        </Panel>

        {/* 5. Financials */}
        <Panel>
          <PanelHeader title={<span className="flex items-center gap-1.5"><IndianRupee className="h-4 w-4" /> Financial summary</span>} />
          <PanelBody className="grid grid-cols-3 gap-3 text-xs">
            <div>
              <p className="text-ink-muted">Sanctioned</p>
              <p className="font-medium tnum">{formatCurrency(work.sanctioned_amount)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Expenditure</p>
              <p className="font-medium tnum">{formatCurrency(work.expenditure)}</p>
            </div>
            <div>
              <p className="text-ink-muted">Utilisation</p>
              <p className="font-medium tnum">
                {work.sanctioned_amount ? formatPercent(((work.expenditure ?? 0) / work.sanctioned_amount) * 100) : "-"}
              </p>
            </div>
            {work.cost_overrun_percent !== null && (
              <div className="col-span-3">
                <p className="text-ink-muted">Cost overrun</p>
                <p className="font-medium tnum">{formatPercent(work.cost_overrun_percent)} ({formatCurrency(work.cost_overrun_amount)})</p>
              </div>
            )}
          </PanelBody>
        </Panel>

        {/* 6. Progress */}
        <Panel>
          <PanelHeader title="Progress" />
          <PanelBody className="space-y-3">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Physical</span>
                <span className="tnum">{formatPercent(work.physical_progress_percent)}</span>
              </div>
              <Progress value={work.physical_progress_percent ?? 0} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-ink-muted">
                <span>Financial</span>
                <span className="tnum">{formatPercent(work.financial_progress_percent)}</span>
              </div>
              <Progress value={work.financial_progress_percent ?? 0} className="h-1.5" />
            </div>
          </PanelBody>
        </Panel>

        {/* 8. Contractor */}
        <Panel>
          <PanelHeader title={<span className="flex items-center gap-1.5"><Building2 className="h-4 w-4" /> Contractor</span>} />
          <PanelBody className="space-y-1 text-xs">
            <p className="font-medium text-ink">{work.contractor_name ?? "Not recorded"}</p>
            <p className="text-ink-muted">Vendor ID: {work.contractor_vendor_id ?? "-"}</p>
            <p className="text-ink-muted">Implementing agency: {work.implementing_agency ?? "-"}</p>
            {work.is_contractor_blacklisted && (
              <p className="flex items-center gap-1 pt-1 text-sev-critical">
                <Ban className="h-3 w-3" /> Blacklisted{work.blacklisted_reason ? ` - ${work.blacklisted_reason}` : ""}
              </p>
            )}
          </PanelBody>
        </Panel>
      </div>

      {/* 7. Payments */}
      <Panel>
        <PanelHeader title={<span className="flex items-center gap-1.5"><Receipt className="h-4 w-4" /> Payments</span>} />
        <PanelBody>
          {work.payments.length === 0 ? (
            <EmptyState title="No payment ledger entries" description="Payment-ledger coverage in this dataset is synthetic-only; real works are tracked via `expenditure`." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {work.payments.map((p) => (
                  <TableRow key={p.payment_id}>
                    <TableCell className="text-xs">{formatDate(p.payment_date)}</TableCell>
                    <TableCell className="text-xs">
                      {p.vendor_id ?? "-"} {p.is_vendor_blacklisted && <Ban className="ml-1 inline h-3 w-3 text-sev-critical" />}
                    </TableCell>
                    <TableCell className="text-xs text-ink-muted">{p.payment_type ?? "-"}</TableCell>
                    <TableCell className="text-right text-xs tnum">{formatCurrency(p.payment_amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </PanelBody>
      </Panel>

      {/* 9. Geographic information */}
      <Panel>
        <PanelHeader title={<span className="flex items-center gap-1.5"><MapPin className="h-4 w-4" /> Geographic information</span>} />
        <PanelBody className="text-xs text-ink-muted">
          {work.latitude && work.longitude ? (
            <p>
              {work.latitude.toFixed(4)}, {work.longitude.toFixed(4)} · {work.block ?? "-"}, {work.village_or_ward ?? "-"}
            </p>
          ) : (
            <p>No coordinates recorded for this work - {work.data_source === "WEB_SCRAPED_REAL" ? "real scraped works do not carry coordinates in this dataset" : "not geo-tagged"}.</p>
          )}
        </PanelBody>
      </Panel>

      {/* 10. Data provenance */}
      <Panel>
        <PanelHeader title={<span className="flex items-center gap-1.5"><User className="h-4 w-4" /> Data provenance</span>} />
        <PanelBody className="space-y-1 text-xs text-ink-muted">
          <p>
            Source: <span className="text-ink">{work.data_source}</span>
            {work.synthetic_scenario && work.synthetic_scenario.toUpperCase() !== "NA" ? ` (${work.synthetic_scenario})` : ""}
          </p>
          {work.risk && <p>Detection model: <span className="text-ink">{work.risk.model_version}</span>, scored {formatDate(work.risk.computed_at)}</p>}
          <p>
            Ground truth:{" "}
            <span className="text-ink">{work.ground_truth_anomaly_raw ? work.ground_truth_anomaly_raw.replaceAll("|", ", ") : "Not available for this record"}</span>
            {work.ground_truth_severity ? ` (${work.ground_truth_severity})` : ""}
          </p>
        </PanelBody>
      </Panel>
    </div>
  );
}
