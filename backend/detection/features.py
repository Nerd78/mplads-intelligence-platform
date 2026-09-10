"""Feature extraction for the MPLADS detection engine.

Pulls one row per work directly from columns that already exist on `work`
(see schema.sql) into a single pandas DataFrame keyed by work_id, and derives
the numeric feature matrix used by both rules.py and ml_model.py.

Design notes (see docs/plan for the full rationale):
- Missing numeric values get median imputation (median computed on the
  non-null population of that column) plus a companion `<col>_was_missing`
  indicator column, so an imputed row is never silently treated as
  confidently "normal" by anything reading the imputation flags.
- Missing booleans default to False/0.
- latitude/longitude are loaded (needed for the geographic-anomaly rule and
  the map endpoints) but are NEVER included in FEATURE_COLUMNS, i.e. never
  fed to the IsolationForest -- they are close to unique per row for the
  handful of geo-tagged works and would let the model key off geography
  instead of behavior.
"""
from __future__ import annotations

import pandas as pd

from db import get_connection

# Columns that make up the numeric ML feature matrix. Order is significant
# (ml_model.py relies on this exact list -- keep the two in sync).
FEATURE_COLUMNS = [
    "cost_overrun_percent",
    "duration_to_national_avg_ratio",
    "progress_mismatch_gap",
    "sanction_delay_days",
    "completion_delay_days",
    "utilisation_pct",
    "progress_gap_financial_minus_physical",
]

# Numeric columns pulled straight from `work` that need median imputation.
_RAW_NUMERIC_COLUMNS = [
    "cost_overrun_percent",
    "duration_to_national_avg_ratio",
    "progress_mismatch_gap",
    "sanction_delay_days",
    "completion_delay_days",
    "physical_progress_percent",
    "financial_progress_percent",
    "estimated_cost",
    "sanctioned_amount",
    "expenditure",
]

_BOOLEAN_COLUMNS = [
    "is_contractor_blacklisted",
    "is_blacklisted_contractor_anomaly",
    "is_exceeds_national_avg_duration",
    "is_excess_duration_anomaly",
]

_WORK_SELECT_SQL = """
    SELECT
        work_id, mp_id, mp_name, data_source, synthetic_record,
        state, district, constituency, work_category,
        implementing_agency, agency_id, vendor_id, contractor_name,
        work_description, latitude, longitude,
        estimated_cost, sanctioned_amount, expenditure,
        physical_progress_percent, financial_progress_percent,
        recommendation_date, sanction_date, expected_completion_date,
        actual_completion_date,
        sanction_delay_days, completion_delay_days,
        cost_overrun_amount, cost_overrun_percent, progress_mismatch_gap,
        project_duration_days, duration_variance_vs_national_avg_days,
        duration_to_national_avg_ratio,
        is_exceeds_national_avg_duration, is_excess_duration_anomaly,
        is_contractor_blacklisted, is_blacklisted_contractor_anomaly,
        blacklisted_reason
    FROM work
"""


def load_work_frame(conn=None) -> pd.DataFrame:
    """Loads the full `work` table into a DataFrame keyed by work_id."""
    owns_conn = conn is None
    conn = conn or get_connection()
    try:
        df = pd.read_sql(_WORK_SELECT_SQL, conn)
    finally:
        if owns_conn:
            conn.close()
    df = df.set_index("work_id", drop=False)
    return df


def build_feature_matrix(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Given the raw work frame, returns (enriched_df, feature_matrix).

    enriched_df is df with derived/imputed columns added (utilisation_pct,
    progress_gap_financial_minus_physical, <col>_was_missing indicators).
    feature_matrix is the numeric-only frame (FEATURE_COLUMNS) ready for
    IsolationForest, with no NaNs left.
    """
    df = df.copy()

    for col in _BOOLEAN_COLUMNS:
        df[col] = df[col].fillna(False).astype(bool)

    # Utilisation: expenditure as a % of sanctioned amount. Guard div-by-zero.
    sanctioned = df["sanctioned_amount"].where(df["sanctioned_amount"] > 0)
    df["utilisation_pct"] = (df["expenditure"] / sanctioned * 100).fillna(0)

    df["progress_gap_financial_minus_physical"] = (
        df["financial_progress_percent"].fillna(df["utilisation_pct"])
        - df["physical_progress_percent"].fillna(0)
    )

    # Records with no financial figures at all. These are a data-collection
    # gap, not a behavioral signal: with every money column at zero their
    # feature vector is unlike any populated row, so IsolationForest scored
    # them as extreme outliers (mean ML score 99.4 vs 49.8 for populated
    # rows) purely because the data is absent. They are excluded from ML
    # fitting and scoring and flagged explicitly instead -- see
    # run_detection.py. Rules still apply: a blacklisted contractor is a
    # blacklisted contractor whether or not the money columns were filled in.
    df["financials_incomplete"] = (df["sanctioned_amount"].fillna(0) <= 0) & (
        df["expenditure"].fillna(0) <= 0
    )

    numeric_cols = _RAW_NUMERIC_COLUMNS + [
        "utilisation_pct",
        "progress_gap_financial_minus_physical",
    ]
    for col in numeric_cols:
        was_missing_col = f"{col}_was_missing"
        df[was_missing_col] = df[col].isna()
        if df[col].notna().any():
            median = df[col].median()
        else:
            median = 0.0
        df[col] = df[col].fillna(median)

    feature_matrix = df[FEATURE_COLUMNS].astype(float)
    return df, feature_matrix
