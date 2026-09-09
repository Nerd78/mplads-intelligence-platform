/**
 * Pure display helpers only. Risk scoring (rule engine + IsolationForest) is
 * computed exclusively by backend/detection/ and served by the API -- this
 * file must never recreate that logic. See src/lib/api.ts / hooks.ts for the
 * data layer, and src/components/mplads/ for the shared display components
 * that consume it.
 */
import type { DataSource, Severity } from "./api";

export const SEVERITY_ORDER: Severity[] = ["Low", "Medium", "High", "Critical"];

export const riskColors: Record<Severity, string> = {
  Low: "bg-risk-low/15 text-risk-low-foreground border-risk-low/30",
  Medium: "bg-risk-medium/15 text-risk-medium-foreground border-risk-medium/30",
  High: "bg-risk-high/15 text-risk-high-foreground border-risk-high/30",
  Critical: "bg-risk-critical/15 text-risk-critical-foreground border-risk-critical/30",
};

export const riskDotColors: Record<Severity, string> = {
  Low: "bg-risk-low",
  Medium: "bg-risk-medium",
  High: "bg-risk-high",
  Critical: "bg-risk-critical",
};

// Kept in sync with backend/detection/scorer.py's severity_for_score --
// this is a *display* mirror of the backend's bucketing, used only when a
// raw score needs a label client-side (e.g. a slider control), never to
// compute the score itself.
export function getRiskLevelFromScore(score: number): Severity {
  if (score < 31) return "Low";
  if (score < 61) return "Medium";
  if (score <= 80) return "High";
  return "Critical";
}

export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
    notation: value >= 10_000_000 ? "compact" : "standard",
  }).format(value);
}

export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return new Intl.NumberFormat("en-IN").format(value);
}

export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export const DATA_SOURCE_LABEL: Record<DataSource, string> = {
  WEB_SCRAPED_REAL: "Real · eSAKSHI",
  SYNTHETIC_BENCHMARK: "Synthetic · Benchmark",
};

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
