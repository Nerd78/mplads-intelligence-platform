import { useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Ban, Bot, FlaskConical, ListChecks } from "lucide-react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { SeverityBadge } from "./SeverityBadge";
import { DataSourceBadge } from "./DataSourceBadge";
import { CardSkeleton, ErrorState } from "./StateViews";
import { formatCurrency, formatDate, formatPercent } from "@/lib/mplads-data";
import { useWorkDetail } from "@/lib/hooks";

export function InvestigationDrawer({
  workId,
  open,
  onOpenChange,
}: {
  workId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const navigate = useNavigate();
  const { data: work, isLoading, isError, error, refetch } = useWorkDetail(workId ?? undefined);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {isLoading && (
          <div className="space-y-4 p-2">
            <CardSkeleton className="h-8 w-2/3" />
            <CardSkeleton className="h-24" />
            <CardSkeleton className="h-40" />
          </div>
        )}
        {isError && <ErrorState message={(error as Error)?.message} onRetry={refetch} />}
        {work && (
          <div className="space-y-6 pb-6">
            <SheetHeader className="space-y-2 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <SeverityBadge severity={work.severity} />
                <DataSourceBadge dataSource={work.data_source} />
              </div>
              <SheetTitle className="text-base leading-snug">{work.work_description || work.work_id}</SheetTitle>
              <p className="text-xs text-muted-foreground">
                {work.work_id} · {work.mp_name ?? "Unknown MP"} · {work.district ?? "—"}, {work.state ?? "—"}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit gap-1.5"
                onClick={() => navigate({ to: "/project-investigation", search: { work_id: work.work_id } })}
              >
                Open full case file <ArrowUpRight className="h-3.5 w-3.5" />
              </Button>
            </SheetHeader>

            {/* Risk score */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk score</h4>
              <div className="flex items-end gap-3">
                <span className="text-3xl font-semibold tabular-nums">{work.risk ? Math.round(work.risk.composite_score) : "—"}</span>
                <span className="pb-1 text-xs text-muted-foreground">/ 100 composite</span>
              </div>
              {work.risk && (
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <ListChecks className="h-3 w-3" /> Rule score
                      </span>
                      <span className="tabular-nums text-foreground">{work.risk.rule_score.toFixed(0)}</span>
                    </div>
                    <Progress value={work.risk.rule_score} className="h-1.5" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Bot className="h-3 w-3" /> ML outlier score
                      </span>
                      <span className="tabular-nums text-foreground">{work.risk.ml_score.toFixed(0)}</span>
                    </div>
                    <Progress value={work.risk.ml_score} className="h-1.5" />
                  </div>
                </div>
              )}
            </section>

            <Separator />

            {/* Why this was flagged */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Why this was flagged</h4>
              {work.flags.length === 0 ? (
                <p className="text-xs text-muted-foreground">No rule or ML-outlier signals fired for this work.</p>
              ) : (
                <ul className="space-y-2">
                  {work.flags.map((f) => (
                    <li key={`${f.flag_label}-${f.source}`} className="rounded-md border border-border bg-muted/40 p-2.5 text-xs">
                      <div className="flex items-center gap-1.5 font-medium text-foreground">
                        {f.source === "ml_outlier" ? <FlaskConical className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                        {f.flag_label.replaceAll("_", " ")}
                      </div>
                      {f.detail && <p className="mt-1 text-muted-foreground">{f.detail}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <Separator />

            {/* Financial summary */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Financial summary</h4>
              <dl className="grid grid-cols-3 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">Sanctioned</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(work.sanctioned_amount)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Expenditure</dt>
                  <dd className="font-medium tabular-nums">{formatCurrency(work.expenditure)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Utilisation</dt>
                  <dd className="font-medium tabular-nums">
                    {work.sanctioned_amount ? formatPercent(((work.expenditure ?? 0) / work.sanctioned_amount) * 100) : "—"}
                  </dd>
                </div>
              </dl>
            </section>

            <Separator />

            {/* Progress */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Progress</h4>
              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Physical</span>
                  <span className="tabular-nums">{formatPercent(work.physical_progress_percent)}</span>
                </div>
                <Progress value={work.physical_progress_percent ?? 0} className="h-1.5" />
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Financial</span>
                  <span className="tabular-nums">{formatPercent(work.financial_progress_percent)}</span>
                </div>
                <Progress value={work.financial_progress_percent ?? 0} className="h-1.5" />
              </div>
            </section>

            <Separator />

            {/* Contractor */}
            <section className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Contractor</h4>
              <div className="text-xs">
                <p className="font-medium text-foreground">{work.contractor_name ?? "Not recorded"}</p>
                <p className="text-muted-foreground">{work.contractor_vendor_id ?? "—"}</p>
                {work.is_contractor_blacklisted && (
                  <p className="mt-1 flex items-center gap-1 text-risk-critical">
                    <Ban className="h-3 w-3" /> Blacklisted{work.blacklisted_reason ? ` — ${work.blacklisted_reason}` : ""}
                  </p>
                )}
              </div>
            </section>

            <Separator />

            {/* Data provenance */}
            <section className="space-y-1.5 text-xs text-muted-foreground">
              <h4 className="text-xs font-semibold uppercase tracking-wide">Data provenance</h4>
              <p>
                Source: <span className="text-foreground">{work.data_source}</span>
              </p>
              {work.risk && (
                <p>
                  Detection model: <span className="text-foreground">{work.risk.model_version}</span> · scored {formatDate(work.risk.computed_at)}
                </p>
              )}
              <p>
                Ground truth:{" "}
                <span className="text-foreground">
                  {work.ground_truth_anomaly_raw ? work.ground_truth_anomaly_raw.replaceAll("|", ", ") : "Not available for this record"}
                </span>
              </p>
              <p className="pt-1">
                Recommended {formatDate(work.recommendation_date)} · Sanctioned {formatDate(work.sanction_date)} · Completion{" "}
                {formatDate(work.actual_completion_date ?? work.expected_completion_date)}
              </p>
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
