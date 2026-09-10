"""Orchestrates one full detection run:

  load features -> rules -> ML -> composite score -> bulk upsert to Postgres
  -> aggregate to mp_risk_score -> evaluate against ground truth -> summary

Safe to interrupt and rerun: work_risk_score/mp_risk_score are upserted
(ON CONFLICT ... DO UPDATE) and work_risk_flag is fully regenerated each run
(it's cheap to rebuild and has no meaningful "history" to preserve).

Usage: python run_detection.py   (run from backend/detection/, or
       python -m detection.run_detection from backend/)
"""
from __future__ import annotations

import sys
import time

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

import pandas as pd
import psycopg2.extras

from db import get_connection
from features import build_feature_matrix, load_work_frame, FEATURE_COLUMNS
from ml_model import MODEL_VERSION, load_model, save_model, score_ml, train_model
from rules import run_rules
from scorer import compute_scores
import evaluate as evaluate_module

BATCH_SIZE = 5000


def write_work_risk_scores(conn, scores_df):
    rows = [
        (
            work_id,
            float(r.rule_score),
            float(r.ml_score),
            float(r.composite_score),
            r.severity,
            MODEL_VERSION,
        )
        for work_id, r in scores_df.iterrows()
    ]
    sql = """
        INSERT INTO work_risk_score (work_id, rule_score, ml_score, composite_score, severity, model_version)
        VALUES %s
        ON CONFLICT (work_id) DO UPDATE SET
            rule_score = EXCLUDED.rule_score,
            ml_score = EXCLUDED.ml_score,
            composite_score = EXCLUDED.composite_score,
            severity = EXCLUDED.severity,
            model_version = EXCLUDED.model_version,
            computed_at = now()
    """
    with conn.cursor() as cur:
        for i in range(0, len(rows), BATCH_SIZE):
            psycopg2.extras.execute_values(cur, sql, rows[i : i + BATCH_SIZE])
    conn.commit()


def write_work_risk_flags(conn, flags_df):
    with conn.cursor() as cur:
        cur.execute("TRUNCATE work_risk_flag")
        rows = list(flags_df[["work_id", "flag_label", "source", "detail"]].itertuples(index=False, name=None))
        sql = "INSERT INTO work_risk_flag (work_id, flag_label, source, detail) VALUES %s ON CONFLICT DO NOTHING"
        for i in range(0, len(rows), BATCH_SIZE):
            psycopg2.extras.execute_values(cur, sql, rows[i : i + BATCH_SIZE])
    conn.commit()


def write_mp_risk_scores(conn, df, scores_df):
    from scorer import severity_for_score

    merged = scores_df.join(df["mp_id"])
    merged = merged[merged["mp_id"].notna()]
    grouped = merged.groupby("mp_id")
    agg = grouped["composite_score"].agg(["count", "mean"])
    high = grouped.apply(lambda g: (g["severity"] == "High").sum())
    critical = grouped.apply(lambda g: (g["severity"] == "Critical").sum())

    rows = [
        (
            mp_id,
            int(row["count"]),
            round(float(row["mean"]), 2),
            int(high.get(mp_id, 0)),
            int(critical.get(mp_id, 0)),
            severity_for_score(float(row["mean"])),
        )
        for mp_id, row in agg.iterrows()
    ]

    sql = """
        INSERT INTO mp_risk_score
            (mp_id, works_scored, avg_composite_score, high_risk_works_count, critical_risk_works_count, aggregate_severity)
        VALUES %s
        ON CONFLICT (mp_id) DO UPDATE SET
            works_scored = EXCLUDED.works_scored,
            avg_composite_score = EXCLUDED.avg_composite_score,
            high_risk_works_count = EXCLUDED.high_risk_works_count,
            critical_risk_works_count = EXCLUDED.critical_risk_works_count,
            aggregate_severity = EXCLUDED.aggregate_severity,
            computed_at = now()
    """
    with conn.cursor() as cur:
        psycopg2.extras.execute_values(cur, sql, rows)
    conn.commit()


def main():
    t0 = time.time()
    conn = get_connection()

    print("Loading work frame from Postgres...")
    raw_df = load_work_frame(conn)
    print(f"  {len(raw_df):,} works loaded")

    print("Building feature matrix...")
    enriched_df, feature_matrix = build_feature_matrix(raw_df)

    print("Running rule engine...")
    rule_result = run_rules(enriched_df)
    print(f"  {len(rule_result.flags):,} rule flags across {rule_result.wide.any(axis=1).sum():,} works")

    # Works with no financial figures at all are held out of the ML layer.
    # Their all-zero money columns made them look like extreme outliers to
    # IsolationForest, which measured missing data rather than behavior.
    # They keep their rule score, get ml_score 0, and carry an explicit
    # DATA_QUALITY_INCOMPLETE flag so they stay visible rather than being
    # silently dropped or silently inflated.
    incomplete = enriched_df["financials_incomplete"]
    scoreable = feature_matrix.loc[~incomplete]
    print(
        f"Training/scoring IsolationForest on {len(scoreable):,} works "
        f"({int(incomplete.sum()):,} held out: no financial figures)..."
    )

    model = load_model()
    if model is not None and getattr(model, "n_features_in_", None) != scoreable.shape[1]:
        model = None  # feature set changed, retrain
    if model is None:
        model = train_model(scoreable)
        save_model(model)
    ml_score = score_ml(scoreable, model).reindex(feature_matrix.index).fillna(0)

    print("Computing composite scores...")
    scores_df = compute_scores(rule_result.rule_score, ml_score)
    print(scores_df["severity"].value_counts().to_string())

    dq_flags = pd.DataFrame(
        {
            "work_id": enriched_df.index[incomplete],
            "flag_label": "DATA_QUALITY_INCOMPLETE",
            "source": "rule",
            "detail": "No sanctioned amount or expenditure recorded - held out of ML scoring",
        }
    )
    rule_flags = pd.concat([rule_result.flags, dq_flags], ignore_index=True) if len(dq_flags) else rule_result.flags

    print("Writing work_risk_score...")
    write_work_risk_scores(conn, scores_df)
    print("Writing work_risk_flag...")
    write_work_risk_flags(conn, rule_flags)
    print("Writing mp_risk_score...")
    write_mp_risk_scores(conn, enriched_df, scores_df)

    print("Evaluating against ground truth...")
    report = evaluate_module.run_evaluation(enriched_df, rule_result.wide, conn)
    print(report)

    conn.close()
    print(f"Done in {time.time() - t0:.1f}s")


if __name__ == "__main__":
    sys.exit(main())
