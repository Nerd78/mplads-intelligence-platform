from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from ..db import get_cursor
from ..geo_names import canonicalize, state_name_map
from ..schemas import GeoPoint, GeoStateAgg

router = APIRouter(prefix="/geo", tags=["geo"])

# Map mode -> the flag_label it reflects. "overall" and "critical" are
# handled separately since they come from work_risk_score, not a flag row.
METRIC_FLAG_LABELS = {
    "cost_overrun": "COST_OVERRUN",
    "delayed": "DELAYED_WORK",
    "duplicate": "DUPLICATE_WORK",
    "contractor": "AWARDED_TO_BLACKLISTED_CONTRACTOR",
    "progress_mismatch": "PROGRESS_MISMATCH",
}


@router.get("/state-name-map")
def get_state_name_map():
    """The exact same DB-spelling <-> alias table used server-side, so the
    frontend map never invents its own state-name reconciliation."""
    return state_name_map()


@router.get("/states", response_model=list[GeoStateAgg])
def geo_states(metric: Optional[str] = Query(None, description="overall|critical|cost_overrun|delayed|duplicate|contractor|progress_mismatch")):
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT w.state,
                   COUNT(*) AS work_count,
                   AVG(wrs.composite_score) AS avg_composite_score,
                   COUNT(*) FILTER (WHERE wrs.severity = 'Critical') AS critical_count,
                   COUNT(*) FILTER (WHERE wrs.severity = 'High') AS high_count
            FROM work w
            LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.state IS NOT NULL AND w.state != ''
            GROUP BY w.state
            """
        )
        rows = cur.fetchall()

        cur.execute(
            """
            SELECT state, flag_label, cnt FROM (
                SELECT w.state, wf.flag_label, COUNT(*) AS cnt,
                       ROW_NUMBER() OVER (PARTITION BY w.state ORDER BY COUNT(*) DESC) AS rn
                FROM work w
                JOIN work_risk_flag wf ON wf.work_id = w.work_id
                WHERE w.state IS NOT NULL AND w.state != ''
                GROUP BY w.state, wf.flag_label
            ) ranked
            WHERE rn = 1
            """
        )
        top_anomaly = {r["state"]: r["flag_label"] for r in cur.fetchall()}

        # Flag-based metric: % of each state's works carrying that specific
        # label -- computed once, reused for whichever flag metric was asked
        # for, keeping the color scale on the same 0-100 basis as "overall".
        flag_label = METRIC_FLAG_LABELS.get(metric or "")
        flag_pct_by_state: dict[str, float] = {}
        if flag_label:
            cur.execute(
                """
                SELECT w.state, COUNT(*) FILTER (WHERE wf.flag_label = %(label)s) * 100.0 / COUNT(*) AS pct
                FROM work w
                LEFT JOIN work_risk_flag wf ON wf.work_id = w.work_id AND wf.flag_label = %(label)s
                WHERE w.state IS NOT NULL AND w.state != ''
                GROUP BY w.state
                """,
                {"label": flag_label},
            )
            flag_pct_by_state = {r["state"]: float(r["pct"] or 0) for r in cur.fetchall()}

    results = []
    for r in rows:
        canonical = canonicalize(r["state"]) or r["state"]
        avg_score = round(float(r["avg_composite_score"] or 0), 2)
        work_count = r["work_count"]

        if metric == "critical":
            metric_value = round((r["critical_count"] / work_count * 100) if work_count else 0, 2)
        elif flag_label:
            metric_value = round(flag_pct_by_state.get(r["state"], 0), 2)
        else:
            metric_value = avg_score

        results.append(
            GeoStateAgg(
                state=canonical,
                work_count=work_count,
                avg_composite_score=avg_score,
                critical_count=r["critical_count"],
                high_count=r["high_count"],
                top_anomaly_label=top_anomaly.get(r["state"]),
                metric_value=metric_value,
            )
        )
    return results


@router.get("/points", response_model=list[GeoPoint])
def geo_points():
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT w.work_id, w.latitude, w.longitude, w.state, w.work_category,
                   wrs.severity, wrs.composite_score
            FROM work w
            LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.latitude IS NOT NULL AND w.longitude IS NOT NULL
            """
        )
        rows = cur.fetchall()
    return [GeoPoint(**r) for r in rows]
