"""Composite risk score: an explicit, documented formula (not an opaque
black box). rule_score and ml_score are each normalized to 0-100 before
being combined, and both remain independently visible in the API/UI --
the composite is never shown without its two components.
"""
from __future__ import annotations

import pandas as pd

# Configurable weights -- named constants, not buried in the formula. Rules
# are weighted higher because they are directly interpretable and several
# map 1:1 to a validated ground-truth label; the ML layer is a supplementary
# statistical-outlier signal on top of them.
RULE_WEIGHT = 0.65
ML_WEIGHT = 0.35

SEVERITY_THRESHOLDS = [
    (31, "Low"),
    (61, "Medium"),
    (81, "High"),
]


def severity_for_score(score: float) -> str:
    if score < 31:
        return "Low"
    if score < 61:
        return "Medium"
    if score <= 80:
        return "High"
    return "Critical"


def compute_scores(raw_rule_score: pd.Series, ml_score: pd.Series) -> pd.DataFrame:
    """raw_rule_score: uncapped point sum from rules.run_rules().rule_score
    ml_score: 0-100 calibrated IsolationForest score from ml_model.score_ml()

    Returns a DataFrame indexed by work_id with rule_score, ml_score,
    composite_score (all 0-100) and severity.
    """
    rule_score_capped = raw_rule_score.clip(0, 100)
    ml_score = ml_score.reindex(raw_rule_score.index).fillna(0)

    composite = (RULE_WEIGHT * rule_score_capped + ML_WEIGHT * ml_score).clip(0, 100)
    severity = composite.map(severity_for_score)

    return pd.DataFrame(
        {
            "rule_score": rule_score_capped.round(2),
            "ml_score": ml_score.round(2),
            "composite_score": composite.round(2),
            "severity": severity,
        }
    )
