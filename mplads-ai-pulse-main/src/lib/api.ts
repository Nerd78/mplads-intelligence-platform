/**
 * Thin fetch wrapper for the MPLADS Intelligence API (backend/app/).
 * The frontend never computes a risk score -- everything here just shapes
 * query params and returns the backend's JSON as-is.
 */
import type { Loose } from "./types";

export const API_BASE_URL = import.meta.env["VITE_API_BASE_URL"] ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function toQuery(params: object = {}): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value === undefined || value === null || value === "") continue;
    usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}

async function request<T>(path: string, params?: object): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}${toQuery(params)}`);
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      detail = body.detail ?? detail;
    } catch {
      // ignore -- non-JSON error body
    }
    throw new ApiError(detail, res.status);
  }
  return res.json() as Promise<T>;
}

// ---- Types (mirrors backend/app/schemas.py) ----

export type Severity = "Low" | "Medium" | "High" | "Critical";
export type DataSource = "WEB_SCRAPED_REAL" | "SYNTHETIC_BENCHMARK";

export interface Page<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface RiskFlag {
  flag_label: string;
  source: "rule" | "ml_outlier";
  detail: string | null;
}

export interface RiskScore {
  rule_score: number;
  ml_score: number;
  composite_score: number;
  severity: Severity;
  model_version: string;
  computed_at: string;
}

export interface WorkSummary {
  work_id: string;
  data_source: DataSource;
  mp_id: string | null;
  mp_name: string | null;
  state: string | null;
  district: string | null;
  work_category: string | null;
  work_description: string | null;
  sanctioned_amount: number | null;
  expenditure: number | null;
  physical_progress_percent: number | null;
  status: string | null;
  composite_score: number | null;
  severity: Severity | null;
  top_flag: string | null;
}

export interface Payment {
  payment_id: string;
  work_id: string;
  mp_id: string | null;
  vendor_id: string | null;
  payment_date: string | null;
  payment_amount: number;
  payment_type: string | null;
  is_vendor_blacklisted: boolean;
  synthetic_record: boolean;
}

export interface WorkDetail extends WorkSummary {
  constituency: string | null;
  block: string | null;
  village_or_ward: string | null;
  latitude: number | null;
  longitude: number | null;
  implementing_agency: string | null;
  contractor_vendor_id: string | null;
  contractor_name: string | null;
  is_contractor_blacklisted: boolean;
  blacklisted_reason: string | null;
  estimated_cost: number | null;
  financial_progress_percent: number | null;
  recommendation_date: string | null;
  sanction_date: string | null;
  expected_completion_date: string | null;
  actual_completion_date: string | null;
  sanction_delay_days: number | null;
  completion_delay_days: number | null;
  cost_overrun_amount: number | null;
  cost_overrun_percent: number | null;
  progress_mismatch_gap: number | null;
  duration_to_national_avg_ratio: number | null;
  ground_truth_anomaly_raw: string | null;
  ground_truth_severity: string | null;
  synthetic_scenario: string | null;
  risk: RiskScore | null;
  flags: RiskFlag[];
  payments: Payment[];
}

export interface Mp {
  mp_id: string;
  name: string;
  state: string;
  constituency: string | null;
  house: string | null;
  total_works_count: number | null;
  total_sanctioned_amt: number | null;
  total_expenditure_amt: number | null;
  utilisation_rate_pct: number | null;
  source_composite_risk_score: number | null;
  avg_composite_score: number | null;
  aggregate_severity: Severity | null;
  works_scored: number | null;
  high_risk_works_count: number | null;
  critical_risk_works_count: number | null;
}

export interface MpProfile extends Mp {
  works: WorkSummary[];
}

export interface Alert extends WorkSummary {
  flags: RiskFlag[];
}

export type MapMetric = "overall" | "critical" | "cost_overrun" | "delayed" | "duplicate" | "contractor" | "progress_mismatch";

export interface WorkCategory {
  category: string;
  work_count: number;
}

export interface GeoStateAgg {
  state: string;
  work_count: number;
  avg_composite_score: number;
  critical_count: number;
  high_count: number;
  top_anomaly_label: string | null;
  metric_value: number;
}

export interface GeoPoint {
  work_id: string;
  latitude: number;
  longitude: number;
  state: string | null;
  work_category: string | null;
  severity: Severity | null;
  composite_score: number | null;
}

export interface SeverityBreakdown {
  Low: number;
  Medium: number;
  High: number;
  Critical: number;
}

export interface StatsOverview {
  total_works: number;
  total_expenditure: number;
  total_sanctioned: number;
  real_count: number;
  synthetic_count: number;
  severity_breakdown: SeverityBreakdown;
  anomaly_type_counts: Record<string, number>;
  top_states: GeoStateAgg[];
  top_mps: Mp[];
  model_version: string | null;
  last_scored_at: string | null;
}

export interface StatsState {
  state: string;
  total_works: number;
  total_expenditure: number;
  severity_breakdown: SeverityBreakdown;
  districts: { district: string; work_count: number; avg_composite_score: number; critical_count: number }[];
}

export interface StatsDistrict {
  state: string;
  district: string;
  total_works: number;
  total_expenditure: number;
  severity_breakdown: SeverityBreakdown;
  mps: { mp_id: string; name: string; work_count: number; avg_composite_score: number }[];
}

export interface EvaluationRow {
  label: string;
  support: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface EvaluationReport {
  model_version: string | null;
  synthetic_count: number;
  real_count: number;
  synthetic_overall: { precision: number; recall: number; f1: number };
  synthetic_rows: EvaluationRow[];
  real_consistency_rows: EvaluationRow[];
  generated_at: string | null;
}

export interface StateNameMap {
  aliases: Record<string, string>;
  polygon_fallback: Record<string, string>;
}

/** Lok Sabha vs Rajya Sabha rollup - the two are not comparable on totals,
 * so the UI always shows them side by side rather than pooled. */
export type HouseStats = {
  house: string;
  mp_count: number;
  works_scored: number;
  total_sanctioned: number;
  total_expenditure: number;
  avg_composite_score: number | null;
  critical_count: number;
  high_count: number;
};

export type WorksFilters = Loose<{
  state: string;
  district: string;
  work_category: string;
  data_source: DataSource | string;
  mp_id: string;
  severity: Severity | string;
  min_risk: number;
  date_from: string;
  date_to: string;
  search: string;
  /** work_risk_flag.flag_label, e.g. AWARDED_TO_BLACKLISTED_CONTRACTOR */
  flag: string;
  mp_name: string;
  sort: string;
  limit: number;
  offset: number;
}>;

export type PaymentsFilters = Loose<{
  work_id: string;
  vendor_id: string;
  is_vendor_blacklisted: boolean;
  limit: number;
  offset: number;
}>;

export type MpsFilters = Loose<{ state: string; search: string; sort: string; limit: number; offset: number }>;

export type AlertsFilters = Loose<{
  severity: string;
  anomaly_label: string;
  data_source: string;
  state: string;
  district: string;
  limit: number;
  offset: number;
}>;

export const api = {
  works: (filters: WorksFilters = {}) => request<Page<WorkSummary>>("/works", filters),
  work: (workId: string) => request<WorkDetail>(`/works/${encodeURIComponent(workId)}`),
  payments: (filters: PaymentsFilters = {}) => request<Page<Payment>>("/payments", filters),
  mps: (filters: MpsFilters = {}) => request<Page<Mp>>("/mps", filters),
  mp: (mpId: string) => request<MpProfile>(`/mps/${encodeURIComponent(mpId)}`),
  alerts: (filters: AlertsFilters = {}) => request<Page<Alert>>("/alerts", filters),
  workCategories: () => request<WorkCategory[]>("/works/categories"),
  geoStates: (metric?: MapMetric) => request<GeoStateAgg[]>("/geo/states", metric ? { metric } : {}),
  geoPoints: () => request<GeoPoint[]>("/geo/points"),
  stateNameMap: () => request<StateNameMap>("/geo/state-name-map"),
  statsOverview: () => request<StatsOverview>("/stats/overview"),
  statsState: (state: string) => request<StatsState>(`/stats/state/${encodeURIComponent(state)}`),
  statsDistrict: (district: string, state: string) =>
    request<StatsDistrict>(`/stats/district/${encodeURIComponent(district)}`, { state }),
  statsHouses: () => request<HouseStats[]>("/stats/houses"),
  evaluation: () => request<EvaluationReport>("/stats/evaluation"),
};
