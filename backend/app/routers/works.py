from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import get_cursor
from ..filters import build_work_where, sort_clause
from ..schemas import Page, Payment, RiskFlag, RiskScore, WorkDetail, WorkSummary

router = APIRouter(prefix="/works", tags=["works"])

_LIST_COLUMNS = """
    w.work_id, w.data_source, w.mp_id, w.mp_name, w.state, w.district,
    w.work_category, w.work_description, w.sanctioned_amount, w.expenditure,
    w.physical_progress_percent, w.status,
    wrs.composite_score, wrs.severity,
    tf.flag_label AS top_flag
"""

_LIST_JOINS = """
    FROM work w
    LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
    LEFT JOIN LATERAL (
        SELECT flag_label FROM work_risk_flag wf
        WHERE wf.work_id = w.work_id
        ORDER BY (wf.source = 'rule') DESC
        LIMIT 1
    ) tf ON true
"""


@router.get("", response_model=Page[WorkSummary])
def list_works(
    state: Optional[str] = None,
    district: Optional[str] = None,
    work_category: Optional[str] = None,
    data_source: Optional[str] = None,
    mp_id: Optional[str] = None,
    severity: Optional[str] = None,
    min_risk: Optional[float] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    search: Optional[str] = None,
    sort: Optional[str] = Query(None, description="e.g. composite_score or -sanction_date"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    where_sql, params = build_work_where(
        state=state,
        district=district,
        work_category=work_category,
        data_source=data_source,
        mp_id=mp_id,
        severity=severity,
        min_risk=min_risk,
        date_from=date_from,
        date_to=date_to,
        search=search,
    )
    order_sql = sort_clause(sort)
    params["limit"] = limit
    params["offset"] = offset

    sql = f"""
        SELECT {_LIST_COLUMNS}, COUNT(*) OVER() AS total_count
        {_LIST_JOINS}
        WHERE {where_sql}
        ORDER BY {order_sql}
        LIMIT %(limit)s OFFSET %(offset)s
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    total = rows[0]["total_count"] if rows else 0
    items = [WorkSummary(**{k: v for k, v in r.items() if k != "total_count"}) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{work_id}", response_model=WorkDetail)
def get_work(work_id: str):
    with get_cursor() as cur:
        cur.execute(
            """
            SELECT w.*, wrs.rule_score, wrs.ml_score, wrs.composite_score, wrs.severity,
                   wrs.model_version, wrs.computed_at
            FROM work w
            LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.work_id = %(work_id)s
            """,
            {"work_id": work_id},
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Work not found")

        cur.execute(
            "SELECT flag_label, source, detail FROM work_risk_flag WHERE work_id = %(work_id)s "
            "ORDER BY (source = 'rule') DESC, flag_label",
            {"work_id": work_id},
        )
        flags = [RiskFlag(**r) for r in cur.fetchall()]

        cur.execute(
            "SELECT * FROM payment WHERE work_id = %(work_id)s ORDER BY payment_date NULLS LAST",
            {"work_id": work_id},
        )
        payments = [Payment(**r) for r in cur.fetchall()]

    risk = None
    if row.get("composite_score") is not None:
        risk = RiskScore(
            rule_score=row["rule_score"],
            ml_score=row["ml_score"],
            composite_score=row["composite_score"],
            severity=row["severity"],
            model_version=row["model_version"],
            computed_at=row["computed_at"],
        )

    return WorkDetail(**row, risk=risk, flags=flags, payments=payments)
