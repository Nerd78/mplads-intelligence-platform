import { createFileRoute } from "@tanstack/react-router";
import { Cpu, Info } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { KpiCard } from "@/components/mplads/KpiCard";
import { ErrorState, TableSkeleton } from "@/components/mplads/StateViews";
import { useEvaluation } from "@/lib/hooks";
import { formatAnomalyLabel, formatDate, formatNumber } from "@/lib/mplads-data";

export const Route = createFileRoute("/model-evaluation")({
  head: () => ({ meta: [{ title: "Model Evaluation — MPLADS Intelligence" }] }),
  component: ModelEvaluation,
});

function EvalTable({ rows }: { rows: { label: string; support: number; precision: number; recall: number; f1: number }[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Anomaly label</TableHead>
          <TableHead className="text-right">Support</TableHead>
          <TableHead className="text-right">Precision</TableHead>
          <TableHead className="text-right">Recall</TableHead>
          <TableHead className="text-right">F1</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.label}>
            <TableCell className="text-xs font-medium">{formatAnomalyLabel(r.label)}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{formatNumber(r.support)}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{r.precision.toFixed(3)}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{r.recall.toFixed(3)}</TableCell>
            <TableCell className="text-right text-xs tabular-nums">{r.f1.toFixed(3)}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function ModelEvaluation() {
  const { data, isLoading, isError, error, refetch } = useEvaluation();

  if (isError) {
    return (
      <ErrorState
        message={(error as Error)?.message ?? "No evaluation report yet — run backend/detection/run_detection.py first."}
        onRetry={refetch}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">System</p>
        <h2 className="text-lg font-semibold text-foreground">Model evaluation</h2>
        <p className="text-sm text-muted-foreground">How the detection engine performs, measured honestly against the one dataset with genuine independent labels.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard label="Model version" value={data?.model_version ?? "—"} icon={Cpu} loading={isLoading} />
        <KpiCard label="Benchmark records" value={formatNumber(data?.synthetic_count)} loading={isLoading} />
        <KpiCard label="Real records (consistency only)" value={formatNumber(data?.real_count)} loading={isLoading} />
        <KpiCard label="Overall F1 (benchmark)" value={data?.synthetic_overall.f1.toFixed(3) ?? "—"} loading={isLoading} />
      </div>

      <Card className="border-blue-300 bg-blue-50 shadow-none">
        <CardContent className="flex gap-3 p-4 text-xs text-foreground">
          <Info className="h-4 w-4 shrink-0 text-primary" />
          <p>
            Independent ground truth exists <strong>only</strong> for the SYNTHETIC_BENCHMARK subset ({formatNumber(data?.synthetic_count)} records)
            — 8 fraud scenarios were deliberately injected with known labels. The table below is a genuine precision/recall/F1 evaluation
            against those labels. The real (WEB_SCRAPED_REAL) numbers further down are <strong>consistency checks, not an independent
            evaluation</strong> — those 3 labels are themselves simple thresholds already computed into the source data, so a match there
            just confirms our rule reproduces the same threshold.
          </p>
        </CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Synthetic benchmark — independent evaluation</CardTitle>
          <p className="text-xs text-muted-foreground">
            Overall (any signal vs. NORMAL): precision {data?.synthetic_overall.precision.toFixed(3)}, recall{" "}
            {data?.synthetic_overall.recall.toFixed(3)}, F1 {data?.synthetic_overall.f1.toFixed(3)}
          </p>
        </CardHeader>
        <CardContent>{isLoading ? <TableSkeleton rows={8} cols={5} /> : <EvalTable rows={data?.synthetic_rows ?? []} />}</CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Real records — consistency check, not independent evaluation</CardTitle>
        </CardHeader>
        <CardContent>{isLoading ? <TableSkeleton rows={3} cols={5} /> : <EvalTable rows={data?.real_consistency_rows ?? []} />}</CardContent>
      </Card>

      <Card className="border-border shadow-none">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Methodology</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p>1. A vectorized rule engine checks 10 threshold/pattern rules, one per known anomaly type (blacklisted contractor, cost overrun, duplicate work, agency anomaly, geographic anomaly, and others).</p>
          <p>2. An unsupervised Isolation Forest scores every work on its numeric feature profile alone — it never sees any ground-truth label during training or scoring.</p>
          <p>3. A composite 0–100 score combines both, weighted, and buckets into Low/Medium/High/Critical severity.</p>
          <p>4. Ground truth is used only here, after scoring, to measure performance — never to influence a score.</p>
          <p>Last generated: {formatDate(data?.generated_at)}</p>
        </CardContent>
      </Card>
    </div>
  );
}
