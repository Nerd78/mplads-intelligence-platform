/**
 * Pure display helpers only. Risk scoring (rule engine + IsolationForest) is
 * computed exclusively by backend/detection/ and served by the API -- this
 * file must never recreate that logic. See src/lib/api.ts / hooks.ts for the
 * data layer, and src/components/mplads/ for the shared display components
 * that consume it.
 */
import type { DataSource, Severity } from "./api";

export const SEVERITY_ORDER: Severity[] = ["Low", "Medium", "High", "Critical"];

// Solid tint + solid ink, never an alpha fade of the severity color: a
// translucent badge picks up whatever row striping sits behind it, which is
// what made these read as four different colors depending on placement.
export const riskColors: Record<Severity, string> = {
  Low: "bg-sev-low-surface text-sev-low border-sev-low",
  Medium: "bg-sev-medium-surface text-sev-medium border-sev-medium",
  High: "bg-sev-high-surface text-sev-high border-sev-high",
  Critical: "bg-sev-critical-surface text-sev-critical border-sev-critical",
};

export const riskDotColors: Record<Severity, string> = {
  Low: "bg-sev-low",
  Medium: "bg-sev-medium",
  High: "bg-sev-high",
  Critical: "bg-sev-critical",
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

const CRORE = 10_000_000;
const LAKH = 100_000;

const inr = (n: number, digits: number) =>
  new Intl.NumberFormat("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);

/**
 * Indian-unit currency. `Intl` compact notation is unusable here: it renders
 * ₹1.26e11 as "₹13KCr" (thousand-crore), which nobody reads as money. Crore
 * and lakh are spelled out instead, and the unit is always shown so a column
 * mixing ₹2 Cr with ₹4.81 L can still be compared at a glance.
 */
export function formatCurrency(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  if (value === 0) return "₹0";
  const abs = Math.abs(value);
  if (abs >= CRORE) return `₹${inr(value / CRORE, abs >= 100 * CRORE ? 0 : 2)} Cr`;
  if (abs >= LAKH) return `₹${inr(value / LAKH, 2)} L`;
  return `₹${inr(value, 0)}`;
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

/**
 * Human-readable names for the detection engine's flag codes. The raw
 * SCREAMING_SNAKE codes are 30+ characters and wrap onto three lines as chart
 * axis labels, which is what made the anomaly chart unreadable.
 */
const ANOMALY_LABELS: Record<string, string> = {
  SANCTION_DELAY_EXCEEDS_90_DAYS: "Sanction delay > 90 days",
  EXCESS_PROJECT_DURATION_VS_NATIONAL_AVG: "Excess duration",
  AWARDED_TO_BLACKLISTED_CONTRACTOR: "Blacklisted contractor",
  DUPLICATE_WORK: "Duplicate work",
  AGENCY_ANOMALY: "Agency anomaly",
  PROGRESS_MISMATCH: "Progress mismatch",
  COST_OVERRUN: "Cost overrun",
  DELAYED_WORK: "Delayed work",
  UNUSUAL_EXPENDITURE: "Unusual expenditure",
  GEOGRAPHIC_ANOMALY: "Geographic anomaly",
  DATA_QUALITY_INCOMPLETE: "Incomplete record",
};

export function formatAnomalyLabel(code: string): string {
  const known = ANOMALY_LABELS[code];
  if (known) return known;
  const words = code.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Synthetic benchmark rows carry fabricated district names ("District_5") —
 * verified: all 3,958 synthetic works use them and no real work does. They
 * are not places, so they render as "—" rather than sitting in a column
 * beside real districts looking like administrative units. The row's source
 * badge already says the record is synthetic.
 */
const PLACEHOLDER_DISTRICT = /^District_\d+$/;

export function formatDistrict(district: string | null | undefined): string {
  if (!district || PLACEHOLDER_DISTRICT.test(district)) return "—";
  return district;
}

/** Compact figures for chart axes and bar-end labels: 35045 -> "35k". */
export function formatCompactNumber(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(value);
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
