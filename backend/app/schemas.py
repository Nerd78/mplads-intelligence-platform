"""Pydantic response models.

Kept close to the actual `work`/`payment`/`mp` columns plus the detection
tables (work_risk_score, work_risk_flag, mp_risk_score) -- see schema.sql.
Optional[...] is used liberally because real MPLADS data has genuine nulls
(e.g. ~25% of real works have no sanction_date yet); the frontend is
expected to render "-"/skeletons for missing values, never fabricate them.
"""
from __future__ import annotations

from datetime import date, datetime
from typing import Generic, Optional, TypeVar

from pydantic import BaseModel

T = TypeVar("T")


class Page(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class RiskFlag(BaseModel):
    flag_label: str
    source: str  # 'rule' | 'ml_outlier'
    detail: Optional[str] = None


class RiskScore(BaseModel):
    rule_score: float
    ml_score: float
    composite_score: float
    severity: str
    model_version: str
    computed_at: datetime


class WorkSummary(BaseModel):
    work_id: str
    data_source: str
    mp_id: Optional[str] = None
    mp_name: Optional[str] = None
    state: Optional[str] = None
    district: Optional[str] = None
    work_category: Optional[str] = None
    work_description: Optional[str] = None
    sanctioned_amount: Optional[float] = None
    expenditure: Optional[float] = None
    physical_progress_percent: Optional[float] = None
    status: Optional[str] = None
    composite_score: Optional[float] = None
    severity: Optional[str] = None
    top_flag: Optional[str] = None


class Payment(BaseModel):
    payment_id: str
    work_id: str
    mp_id: Optional[str] = None
    vendor_id: Optional[str] = None
    payment_date: Optional[date] = None
    payment_amount: float
    payment_type: Optional[str] = None
    is_vendor_blacklisted: bool = False
    synthetic_record: bool = False


class WorkDetail(WorkSummary):
    constituency: Optional[str] = None
    block: Optional[str] = None
    village_or_ward: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    implementing_agency: Optional[str] = None
    contractor_vendor_id: Optional[str] = None
    contractor_name: Optional[str] = None
    is_contractor_blacklisted: bool = False
    blacklisted_reason: Optional[str] = None
    estimated_cost: Optional[float] = None
    financial_progress_percent: Optional[float] = None
    recommendation_date: Optional[date] = None
    sanction_date: Optional[date] = None
    expected_completion_date: Optional[date] = None
    actual_completion_date: Optional[date] = None
    sanction_delay_days: Optional[int] = None
    completion_delay_days: Optional[int] = None
    cost_overrun_amount: Optional[float] = None
    cost_overrun_percent: Optional[float] = None
    progress_mismatch_gap: Optional[float] = None
    duration_to_national_avg_ratio: Optional[float] = None
    ground_truth_anomaly_raw: Optional[str] = None
    ground_truth_severity: Optional[str] = None
    synthetic_scenario: Optional[str] = None
    risk: Optional[RiskScore] = None
    flags: list[RiskFlag] = []
    payments: list[Payment] = []


class Mp(BaseModel):
    mp_id: str
    name: str
    state: str
    constituency: Optional[str] = None
    house: Optional[str] = None
    total_works_count: Optional[int] = None
    total_sanctioned_amt: Optional[float] = None
    total_expenditure_amt: Optional[float] = None
    utilisation_rate_pct: Optional[float] = None
    source_composite_risk_score: Optional[float] = None  # from mp_metrics_snapshot (source-provided)
    avg_composite_score: Optional[float] = None  # from mp_risk_score (our detection engine)
    aggregate_severity: Optional[str] = None
    works_scored: Optional[int] = None
    high_risk_works_count: Optional[int] = None
    critical_risk_works_count: Optional[int] = None


class MpProfile(Mp):
    works: list[WorkSummary] = []


class Alert(WorkSummary):
    flags: list[RiskFlag] = []


class WorkCategory(BaseModel):
    category: str
    work_count: int


class GeoStateAgg(BaseModel):
    state: str
    work_count: int
    avg_composite_score: float
    critical_count: int
    high_count: int
    top_anomaly_label: Optional[str] = None
    # Value (0-100) for whichever /geo/states?metric=... was requested --
    # avg_composite_score itself for "overall", else the % of this state's
    # works carrying that specific signal. Always present so the map's color
    # scale has one consistent field to read regardless of metric.
    metric_value: float = 0.0


class GeoPoint(BaseModel):
    work_id: str
    latitude: float
    longitude: float
    state: Optional[str] = None
    work_category: Optional[str] = None
    severity: Optional[str] = None
    composite_score: Optional[float] = None


class SeverityBreakdown(BaseModel):
    Low: int = 0
    Medium: int = 0
    High: int = 0
    Critical: int = 0


class StatsOverview(BaseModel):
    total_works: int
    total_expenditure: float
    total_sanctioned: float
    real_count: int
    synthetic_count: int
    severity_breakdown: SeverityBreakdown
    anomaly_type_counts: dict[str, int]
    top_states: list[GeoStateAgg]
    top_mps: list[Mp]
    model_version: Optional[str] = None
    last_scored_at: Optional[datetime] = None


class StatsState(BaseModel):
    state: str
    total_works: int
    total_expenditure: float
    severity_breakdown: SeverityBreakdown
    districts: list[dict]


class StatsDistrict(BaseModel):
    state: str
    district: str
    total_works: int
    total_expenditure: float
    severity_breakdown: SeverityBreakdown
    mps: list[dict]


class EvaluationRow(BaseModel):
    label: str
    support: int
    precision: float
    recall: float
    f1: float


class HouseStats(BaseModel):
    """Per-house rollup. Lok Sabha members hold a constituency, Rajya Sabha
    members represent a state, and their MPLADS work volumes differ by orders
    of magnitude -- so national averages that pool both are misleading."""

    house: str
    mp_count: int
    works_scored: int
    total_sanctioned: float
    total_expenditure: float
    avg_composite_score: Optional[float] = None
    critical_count: int
    high_count: int


class EvaluationReport(BaseModel):
    model_version: Optional[str] = None
    synthetic_count: int
    real_count: int
    synthetic_overall: dict
    synthetic_rows: list[EvaluationRow]
    real_consistency_rows: list[EvaluationRow]
    generated_at: Optional[datetime] = None
