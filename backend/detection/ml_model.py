"""Unsupervised statistical layer: IsolationForest over the numeric feature
matrix from features.py.

Ground-truth labels are never passed in here -- this is fit purely on the
numeric feature matrix, unsupervised, exactly like a real deployment would
have to be (real fraud is not labeled in advance). evaluate.py is the only
place labels are used, and only to score the *output*, never the training.
"""
from __future__ import annotations

import os

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

MODEL_VERSION = "isoforest-v1"
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")

RANDOM_STATE = 42
N_ESTIMATORS = 200
CONTAMINATION = "auto"


def train_model(feature_matrix: pd.DataFrame) -> IsolationForest:
    model = IsolationForest(
        n_estimators=N_ESTIMATORS,
        contamination=CONTAMINATION,
        random_state=RANDOM_STATE,
        n_jobs=-1,
    )
    model.fit(feature_matrix.values)
    return model


def save_model(model: IsolationForest) -> None:
    joblib.dump({"model": model, "version": MODEL_VERSION, "feature_columns": list(model.feature_names_in_)
                 if hasattr(model, "feature_names_in_") else None}, MODEL_PATH)


def load_model() -> IsolationForest | None:
    if not os.path.exists(MODEL_PATH):
        return None
    payload = joblib.load(MODEL_PATH)
    return payload["model"]


def score_ml(feature_matrix: pd.DataFrame, model: IsolationForest | None = None) -> pd.Series:
    """Returns a 0-100 calibrated anomaly score per work_id, higher = more
    anomalous. Raw IsolationForest decision_function (higher = more normal)
    is inverted then calibrated to 0-100 via empirical percentile rank within
    this scored population -- robust to outliers, unlike min-max scaling."""
    if model is None:
        model = train_model(feature_matrix)
        save_model(model)

    raw = model.decision_function(feature_matrix.values)  # higher = more normal
    anomaly_raw = -raw  # higher = more anomalous

    ranks = pd.Series(anomaly_raw, index=feature_matrix.index).rank(pct=True)
    calibrated = (ranks * 100).clip(0, 100)
    return calibrated
