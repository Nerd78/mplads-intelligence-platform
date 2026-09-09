from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Query

from ..db import get_cursor
from ..filters import build_work_where
from ..schemas import Alert, Page, RiskFlag

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=Page[Alert])
def list_alerts(
    severity: Optional[str] = None,
    anomaly_label: Optional[str] = None,
    data_source: Optional[str] = None,
    state: Optional[str] = None,
    district: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """Auditor-ready case queue: only works that actually have a risk score
    and at least Medium severity by default, worst-first."""
    where_sql, params = build_work_where(
        state=state, district=district, data_source=data_source, severity=severity
    )
    where_sql += " AND wrs.composite_score IS NOT NULL"
    if not severity:
        where_sql += " AND wrs.severity IN ('Medium', 'High', 'Critical')"

    anomaly_join = ""
    if anomaly_label:
        anomaly_join = "JOIN work_risk_flag af ON af.work_id = w.work_id AND af.flag_label = %(anomaly_label)s"
        params["anomaly_label"] = anomaly_label

    params["limit"] = limit
    params["offset"] = offset

    sql = f"""
        SELECT w.work_id, w.data_source, w.mp_id, w.mp_name, w.state, w.district,
               w.work_category, w.work_description, w.sanctioned_amount, w.expenditure,
               w.physical_progress_percent, w.status,
               wrs.composite_score, wrs.severity,
               COUNT(*) OVER() AS total_count
        FROM work w
        LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
        {anomaly_join}
        WHERE {where_sql}
        ORDER BY wrs.composite_score DESC NULLS LAST
        LIMIT %(limit)s OFFSET %(offset)s
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    total = rows[0]["total_count"] if rows else 0
    work_ids = [r["work_id"] for r in rows]

    flags_by_work: dict[str, list[RiskFlag]] = {wid: [] for wid in work_ids}
    if work_ids:
        with get_cursor() as cur:
            cur.execute(
                "SELECT work_id, flag_label, source, detail FROM work_risk_flag "
                "WHERE work_id = ANY(%(ids)s) ORDER BY (source = 'rule') DESC, flag_label",
                {"ids": work_ids},
            )
            for r in cur.fetchall():
                flags_by_work[r["work_id"]].append(RiskFlag(flag_label=r["flag_label"], source=r["source"], detail=r["detail"]))

    items = [
        Alert(**{k: v for k, v in r.items() if k != "total_count"}, flags=flags_by_work.get(r["work_id"], []))
        for r in rows
    ]
    return Page(items=items, total=total, limit=limit, offset=offset)
