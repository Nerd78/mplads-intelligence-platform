import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { ChartCard, LegendItem } from "./ChartCard";
import type { SeverityBreakdown } from "@/lib/api";
import { SEVERITY_ORDER, formatAnomalyLabel, formatCompactNumber } from "@/lib/mplads-data";

const SEVERITY_COLORS: Record<string, string> = {
  Low: "var(--sev-low)",
  Medium: "var(--sev-medium)",
  High: "var(--sev-high)",
  Critical: "var(--sev-critical)",
};

/**
 * Sequential blue ramp, light -> dark. Used wherever a bar encodes *magnitude*
 * (counts, average scores). The previous build painted these bars green/amber
 * by threshold, which made a "highest-risk states" chart read mostly green and
 * implied a severity bucket the number does not carry.
 */
const SEQ = ["var(--chart-seq-1)", "var(--chart-seq-2)", "var(--chart-seq-3)", "var(--chart-seq-4)", "var(--chart-seq-5)"];

/** Darker step = larger value, computed against the visible max. */
function seqColor(value: number, max: number): string {
  if (max <= 0) return SEQ[2] as string;
  const idx = Math.min(SEQ.length - 1, Math.floor((value / max) * SEQ.length));
  return SEQ[idx] as string;
}

const axisTick = { fontSize: 11, fill: "var(--ink-muted)" };

function ChartTooltip({
  active,
  payload,
  label,
  valueFormatter,
}: {
  active?: boolean | undefined;
  payload?: { name?: string; value?: number; color?: string; payload?: Record<string, unknown> }[] | undefined;
  label?: string | number | undefined;
  valueFormatter?: ((v: number) => string) | undefined;
}) {
  if (!active || !payload?.length) return null;
  const fmt = valueFormatter ?? ((v: number) => v.toLocaleString("en-IN"));
  return (
    <div className="rounded-lg border border-border-strong bg-surface px-2.5 py-2 shadow-sm">
      {label !== undefined && label !== "" && (
        <p className="mb-1 max-w-56 text-xs font-semibold text-ink">{String(label)}</p>
      )}
      <div className="space-y-0.5">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: p.color }} aria-hidden="true" />
            {p.name && <span className="text-ink-muted">{p.name}</span>}
            <span className="ml-auto font-semibold text-ink tnum">{fmt(Number(p.value ?? 0))}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RiskDistributionChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: SeverityBreakdown | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const rows = data ? SEVERITY_ORDER.map((k) => ({ name: k, value: data[k] })) : [];
  const empty = rows.every((r) => r.value === 0);
  const total = rows.reduce((sum, r) => sum + r.value, 0);

  return (
    <ChartCard
      title="Risk distribution"
      explanation="Works by detection-engine severity bucket."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={empty}
      height={220}
      legend={rows.map((r) => (
        <LegendItem key={r.name} color={SEVERITY_COLORS[r.name] as string} label={`${r.name} · ${r.value.toLocaleString("en-IN")}`} />
      ))}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={rows}
            dataKey="value"
            nameKey="name"
            innerRadius={54}
            outerRadius={82}
            paddingAngle={2}
            stroke="var(--surface)"
            strokeWidth={2}
          >
            {rows.map((r) => (
              <Cell key={r.name} fill={SEVERITY_COLORS[r.name] as string} />
            ))}
          </Pie>
          <Tooltip
            content={
              <ChartTooltip
                valueFormatter={(v) => `${v.toLocaleString("en-IN")} (${total ? ((v / total) * 100).toFixed(1) : 0}%)`}
              />
            }
          />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function AnomalyDistributionChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: Record<string, number> | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const rows = data
    ? Object.entries(data)
        .filter(([label]) => label !== "NORMAL")
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8)
        .map(([label, count]) => ({ label: formatAnomalyLabel(label), count }))
    : [];
  const max = Math.max(0, ...rows.map((r) => r.count));

  return (
    <ChartCard
      title="Anomaly signal composition"
      explanation="Top rule and ML flags across works — one work can carry several."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" tick={axisTick} tickFormatter={formatCompactNumber} axisLine={false} tickLine={false} />
          <YAxis
            type="category"
            dataKey="label"
            width={148}
            tick={axisTick}
            axisLine={false}
            tickLine={false}
            interval={0}
          />
          <Tooltip cursor={{ fill: "var(--surface-sunken)" }} content={<ChartTooltip />} />
          <Bar dataKey="count" name="Works flagged" radius={[0, 4, 4, 0]} barSize={16}>
            {rows.map((r) => (
              <Cell key={r.label} fill={seqColor(r.count, max)} />
            ))}
            <LabelList
              dataKey="count"
              position="right"
              offset={8}
              formatter={(v: number) => formatCompactNumber(v)}
              style={{ fontSize: 11, fill: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RiskByStateChart({
  data,
  loading,
  error,
  onRetry,
  onBarClick,
}: {
  data?: { state: string; avg_composite_score: number }[] | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
  onBarClick?: ((state: string) => void) | undefined;
}) {
  const rows = (data ?? []).slice(0, 10);
  const max = Math.max(0, ...rows.map((r) => r.avg_composite_score));

  return (
    <ChartCard
      title="Highest-risk states"
      explanation="Average composite risk score (0–100) across each state's works. Select a bar to drill in."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={300}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 4, right: 40, top: 4, bottom: 4 }}
          barCategoryGap={6}
          onClick={(e) => {
            const label = e?.activeLabel as string | undefined;
            if (label && onBarClick) onBarClick(label);
          }}
        >
          <CartesianGrid horizontal={false} stroke="var(--grid)" />
          <XAxis type="number" domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="state" width={124} tick={axisTick} axisLine={false} tickLine={false} interval={0} />
          <Tooltip cursor={{ fill: "var(--surface-sunken)" }} content={<ChartTooltip valueFormatter={(v) => v.toFixed(1)} />} />
          <Bar dataKey="avg_composite_score" name="Avg risk score" radius={[0, 4, 4, 0]} barSize={16} className="cursor-pointer">
            {rows.map((r) => (
              <Cell key={r.state} fill={seqColor(r.avg_composite_score, max)} />
            ))}
            <LabelList
              dataKey="avg_composite_score"
              position="right"
              offset={8}
              formatter={(v: number) => v.toFixed(1)}
              style={{ fontSize: 11, fill: "var(--ink-muted)", fontVariantNumeric: "tabular-nums" }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function ProgressComparisonChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: { label: string; physical: number; financial: number }[] | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const rows = data ?? [];
  return (
    <ChartCard
      title="Physical vs. financial progress"
      explanation="Works where financial progress runs far ahead of physical progress are a mismatch signal."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={260}
      legend={
        <>
          <LegendItem color="var(--chart-pair-a)" label="Physical %" />
          <LegendItem color="var(--chart-pair-b)" label="Financial %" />
        </>
      }
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} hide={rows.length > 12} />
          <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "var(--surface-sunken)" }} content={<ChartTooltip valueFormatter={(v) => `${v}%`} />} />
          <Bar dataKey="physical" name="Physical %" fill="var(--chart-pair-a)" radius={[4, 4, 0, 0]} />
          <Bar dataKey="financial" name="Financial %" fill="var(--chart-pair-b)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function RiskTrendChart({
  data,
  loading,
  error,
  onRetry,
}: {
  data?: { label: string; score: number }[] | undefined;
  loading?: boolean | undefined;
  error?: unknown;
  onRetry?: (() => void) | undefined;
}) {
  const rows = data ?? [];
  return (
    <ChartCard
      title="Risk trend"
      explanation={
        rows.length > 1
          ? "Composite score across detection runs."
          : "Only one detection run recorded so far — a trend needs at least two."
      }
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={200}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tick={axisTick} axisLine={false} tickLine={false} />
          <YAxis domain={[0, 100]} tick={axisTick} axisLine={false} tickLine={false} />
          <Tooltip content={<ChartTooltip valueFormatter={(v) => v.toFixed(1)} />} />
          <Line
            type="monotone"
            dataKey="score"
            name="Composite score"
            stroke="var(--blue-600)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--blue-600)", stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, fill: "var(--blue-700)", stroke: "var(--surface)", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
