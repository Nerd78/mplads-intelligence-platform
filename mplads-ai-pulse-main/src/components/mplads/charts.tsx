import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartCard } from "./ChartCard";
import type { SeverityBreakdown } from "@/lib/api";

const SEVERITY_COLORS: Record<string, string> = {
  Low: "var(--risk-low)",
  Medium: "var(--risk-medium)",
  High: "var(--risk-high)",
  Critical: "var(--risk-critical)",
};

const tooltipStyle = {
  fontSize: 12,
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--popover)",
  color: "var(--popover-foreground)",
};

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
  const rows = data
    ? (["Low", "Medium", "High", "Critical"] as const).map((k) => ({ name: k, value: data[k] }))
    : [];
  const empty = rows.every((r) => r.value === 0);

  return (
    <ChartCard
      title="Risk distribution"
      explanation="Works by detection-engine severity bucket."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={empty}
    >
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={rows} dataKey="value" nameKey="name" innerRadius={50} outerRadius={80} paddingAngle={2}>
            {rows.map((r) => (
              <Cell key={r.name} fill={SEVERITY_COLORS[r.name]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number, n: string) => [v.toLocaleString("en-IN"), n]} />
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
        .map(([label, count]) => ({ label: label.replaceAll("_", " "), count }))
    : [];

  return (
    <ChartCard
      title="Anomaly signal composition"
      explanation="Top rule/ML flags triggered across works (a work may carry more than one)."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis type="category" dataKey="label" width={150} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="count" fill="var(--primary)" radius={[0, 3, 3, 0]} />
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
  return (
    <ChartCard
      title="Highest-risk states"
      explanation="Average composite risk score across each state's works."
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={280}
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 16 }} onClick={(e) => {
          const label = e?.activeLabel as string | undefined;
          if (label && onBarClick) onBarClick(label);
        }}>
          <CartesianGrid horizontal={false} stroke="var(--border)" />
          <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <YAxis type="category" dataKey="state" width={130} tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="avg_composite_score" radius={[0, 3, 3, 0]} className="cursor-pointer">
            {rows.map((r) => (
              <Cell
                key={r.state}
                fill={r.avg_composite_score >= 61 ? "var(--risk-high)" : r.avg_composite_score >= 31 ? "var(--risk-medium)" : "var(--risk-low)"}
              />
            ))}
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
    >
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" hide={rows.length > 12} />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Bar dataKey="physical" name="Physical %" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
          <Bar dataKey="financial" name="Financial %" fill="var(--chart-4)" radius={[3, 3, 0, 0]} />
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
      explanation={rows.length > 1 ? "Composite score across detection runs." : "Only one detection run recorded so far -- a trend needs at least two."}
      loading={loading}
      error={error}
      onRetry={onRetry}
      empty={rows.length === 0}
      height={200}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" />
          <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
          <Tooltip contentStyle={tooltipStyle} />
          <Line type="monotone" dataKey="score" stroke="var(--primary)" strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
