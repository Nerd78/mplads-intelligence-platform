from __future__ import annotations

import json
import os

from fastapi import APIRouter, HTTPException

from ..db import get_cursor
from ..geo_names import canonicalize
from ..schemas import (
    EvaluationReport,
    GeoStateAgg,
    HouseStats,
    Mp,
    SeverityBreakdown,
    StatsDistrict,
    StatsOverview,
    StatsState,
)

router = APIRouter(prefix="/stats", tags=["stats"])

# Resolve relative to backend/reports/detection_evaluation.json regardless of CWD.
_EVAL_JSON_PATH = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "..", "reports", "detection_evaluation.json")
)


def _severity_breakdown(cur, where_sql: str, params: dict) -> SeverityBreakdown:
    cur.execute(
        f"""
        SELECT wrs.severity, COUNT(*) AS cnt
        FROM work w LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
        WHERE {where_sql} AND wrs.severity IS NOT NULL
        GROUP BY wrs.severity
        """,
        params,
    )
    counts = {r["severity"]: r["cnt"] for r in cur.fetchall()}
    return SeverityBreakdown(**{k: counts.get(k, 0) for k in ["Low", "Medium", "High", "Critical"]})


@router.get("/overview", response_model=StatsOverview)
def stats_overview():
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT COUNT(*) AS total_works,
                   COALESCE(SUM(expenditure), 0) AS total_expenditure,
                   COALESCE(SUM(sanctioned_amount), 0) AS total_sanctioned,
                   COUNT(*) FILTER (WHERE data_source = 'WEB_SCRAPED_REAL') AS real_count,
                   COUNT(*) FILTER (WHERE data_source = 'SYNTHETIC_BENCHMARK') AS synthetic_count
            FROM work
            """
        )
        totals = cur.fetchone()

        severity = _severity_breakdown(cur, "1=1", {})

        cur.execute("SELECT flag_label, COUNT(*) AS cnt FROM work_risk_flag GROUP BY flag_label ORDER BY cnt DESC")
        anomaly_type_counts = {r["flag_label"]: r["cnt"] for r in cur.fetchall()}

        cur.execute(
            """
            SELECT w.state, COUNT(*) AS work_count, AVG(wrs.composite_score) AS avg_composite_score,
                   COUNT(*) FILTER (WHERE wrs.severity = 'Critical') AS critical_count,
                   COUNT(*) FILTER (WHERE wrs.severity = 'High') AS high_count
            FROM work w LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.state IS NOT NULL AND w.state != ''
            GROUP BY w.state
            ORDER BY avg_composite_score DESC NULLS LAST
            LIMIT 10
            """
        )
        top_states = [
            GeoStateAgg(
                state=canonicalize(r["state"]) or r["state"],
                work_count=r["work_count"],
                avg_composite_score=round(float(r["avg_composite_score"] or 0), 2),
                critical_count=r["critical_count"],
                high_count=r["high_count"],
            )
            for r in cur.fetchall()
        ]

        cur.execute(
            """
            SELECT m.mp_id, m.name, m.state, m.constituency, m.house,
                   mrs.avg_composite_score, mrs.aggregate_severity, mrs.works_scored,
                   mrs.high_risk_works_count, mrs.critical_risk_works_count
            FROM mp m JOIN mp_risk_score mrs ON mrs.mp_id = m.mp_id
            ORDER BY mrs.avg_composite_score DESC
            LIMIT 10
            """
        )
        top_mps = [Mp(**r) for r in cur.fetchall()]

        cur.execute("SELECT model_version, MAX(computed_at) AS last_scored_at FROM work_risk_score GROUP BY model_version LIMIT 1")
        model_row = cur.fetchone()

    return StatsOverview(
        total_works=totals["total_works"],
        total_expenditure=float(totals["total_expenditure"]),
        total_sanctioned=float(totals["total_sanctioned"]),
        real_count=totals["real_count"],
        synthetic_count=totals["synthetic_count"],
        severity_breakdown=severity,
        anomaly_type_counts=anomaly_type_counts,
        top_states=top_states,
        top_mps=top_mps,
        model_version=model_row["model_version"] if model_row else None,
        last_scored_at=model_row["last_scored_at"] if model_row else None,
    )


@router.get("/state/{state}", response_model=StatsState)
def stats_state(state: str):
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(expenditure),0) AS exp FROM work WHERE state = %(state)s",
            {"state": state},
        )
        totals = cur.fetchone()
        if not totals or totals["c"] == 0:
            raise HTTPException(status_code=404, detail="No works found for this state")

        severity = _severity_breakdown(cur, "w.state = %(state)s", {"state": state})

        cur.execute(
            """
            SELECT w.district, COUNT(*) AS work_count, AVG(wrs.composite_score) AS avg_score,
                   COUNT(*) FILTER (WHERE wrs.severity = 'Critical') AS critical_count
            FROM work w LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.state = %(state)s AND w.district IS NOT NULL AND w.district != ''
              -- The synthetic benchmark ships fabricated district names
              -- ("District_5", "District_36", ...) -- verified: all 3,958
              -- synthetic rows use them and no real row does. They are not
              -- places, so they must not appear in a geographic ranking
              -- beside real districts, where they read as real administrative
              -- units. Synthetic rows still count everywhere else (severity
              -- totals, model evaluation) -- only geography excludes them.
              AND w.district !~ '^District_[0-9]+$'
            GROUP BY w.district
            ORDER BY avg_score DESC NULLS LAST
            """,
            {"state": state},
        )
        districts = [
            {
                "district": r["district"],
                "work_count": r["work_count"],
                "avg_composite_score": round(float(r["avg_score"] or 0), 2),
                "critical_count": r["critical_count"],
            }
            for r in cur.fetchall()
        ]

    return StatsState(
        state=state,
        total_works=totals["c"],
        total_expenditure=float(totals["exp"]),
        severity_breakdown=severity,
        districts=districts,
    )


@router.get("/district/{district}", response_model=StatsDistrict)
def stats_district(district: str, state: str):
    with get_cursor() as cur:
        cur.execute(
            "SELECT COUNT(*) AS c, COALESCE(SUM(expenditure),0) AS exp FROM work "
            "WHERE district = %(district)s AND state = %(state)s",
            {"district": district, "state": state},
        )
        totals = cur.fetchone()
        if not totals or totals["c"] == 0:
            raise HTTPException(status_code=404, detail="No works found for this district")

        severity = _severity_breakdown(cur, "w.district = %(district)s AND w.state = %(state)s", {"district": district, "state": state})

        cur.execute(
            """
            SELECT m.mp_id, m.name, COUNT(w.work_id) AS work_count, AVG(wrs.composite_score) AS avg_score
            FROM work w
            JOIN mp m ON m.mp_id = w.mp_id
            LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.district = %(district)s AND w.state = %(state)s
            GROUP BY m.mp_id, m.name
            ORDER BY avg_score DESC NULLS LAST
            """,
            {"district": district, "state": state},
        )
        mps = [
            {"mp_id": r["mp_id"], "name": r["name"], "work_count": r["work_count"], "avg_composite_score": round(float(r["avg_score"] or 0), 2)}
            for r in cur.fetchall()
        ]

    return StatsDistrict(
        state=state,
        district=district,
        total_works=totals["c"],
        total_expenditure=float(totals["exp"]),
        severity_breakdown=severity,
        mps=mps,
    )


@router.get("/houses", response_model=list[HouseStats])
def stats_houses():
    """Lok Sabha vs Rajya Sabha rollup.

    Kept as its own endpoint rather than a filter on /stats/overview because
    the two houses are not comparable on totals -- Rajya Sabha members carry a
    fraction of the work volume -- so the useful read is always side by side.
    """
    sql = """
        SELECT
            m.house AS house,
            COUNT(DISTINCT m.mp_id) AS mp_count,
            COUNT(r.work_id) AS works_scored,
            COALESCE(SUM(w.sanctioned_amount), 0) AS total_sanctioned,
            COALESCE(SUM(w.expenditure), 0) AS total_expenditure,
            AVG(r.composite_score) AS avg_composite_score,
            COUNT(*) FILTER (WHERE r.severity = 'Critical') AS critical_count,
            COUNT(*) FILTER (WHERE r.severity = 'High') AS high_count
        FROM mp m
        LEFT JOIN work w ON w.mp_id = m.mp_id
        LEFT JOIN work_risk_score r ON r.work_id = w.work_id
        WHERE m.house IS NOT NULL
        GROUP BY m.house
        ORDER BY works_scored DESC
    """
    with get_cursor() as cur:
        cur.execute(sql)
        rows = cur.fetchall()

    return [
        HouseStats(
            house=r["house"],
            mp_count=r["mp_count"],
            works_scored=r["works_scored"],
            total_sanctioned=float(r["total_sanctioned"] or 0),
            total_expenditure=float(r["total_expenditure"] or 0),
            avg_composite_score=float(r["avg_composite_score"]) if r["avg_composite_score"] is not None else None,
            critical_count=r["critical_count"],
            high_count=r["high_count"],
        )
        for r in rows
    ]


@router.get("/evaluation", response_model=EvaluationReport)
def stats_evaluation():
    if not os.path.exists(_EVAL_JSON_PATH):
        raise HTTPException(
            status_code=404,
            detail="No evaluation report yet -- run backend/detection/run_detection.py first",
        )
    with open(_EVAL_JSON_PATH, "r", encoding="utf-8") as f:
        return json.load(f)
