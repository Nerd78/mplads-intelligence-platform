from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import get_cursor
from ..schemas import Mp, MpProfile, Page, WorkSummary

router = APIRouter(prefix="/mps", tags=["mps"])

# mp_metrics_snapshot can hold multiple historical rows per MP (see
# DB_GAP notes) -- DISTINCT ON always takes the latest by snapshot_id.
_LIST_SQL_BASE = """
    SELECT
        m.mp_id, m.name, m.state, m.constituency, m.house,
        snap.total_works_count, snap.total_sanctioned_amt, snap.total_expenditure_amt,
        snap.utilisation_rate_pct, snap.composite_risk_score AS source_composite_risk_score,
        mrs.avg_composite_score, mrs.aggregate_severity, mrs.works_scored,
        mrs.high_risk_works_count, mrs.critical_risk_works_count
    FROM mp m
    LEFT JOIN LATERAL (
        SELECT * FROM mp_metrics_snapshot s WHERE s.mp_id = m.mp_id
        ORDER BY snapshot_id DESC LIMIT 1
    ) snap ON true
    LEFT JOIN mp_risk_score mrs ON mrs.mp_id = m.mp_id
"""


@router.get("", response_model=Page[Mp])
def list_mps(
    state: Optional[str] = None,
    house: Optional[str] = Query(None, description="Lok Sabha or Rajya Sabha"),
    search: Optional[str] = None,
    sort: Optional[str] = Query(None, description="risk (default) or name"),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    clauses = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if state:
        clauses.append("state = %(state)s")
        params["state"] = state
    if house:
        clauses.append("house = %(house)s")
        params["house"] = house
    if search:
        clauses.append("(name ILIKE %(search)s OR constituency ILIKE %(search)s)")
        params["search"] = f"%{search}%"

    order = "avg_composite_score DESC NULLS LAST" if sort != "name" else "name ASC"

    sql = f"""
        SELECT *, COUNT(*) OVER() AS total_count FROM ({_LIST_SQL_BASE}) t
        WHERE {" AND ".join(clauses)}
        ORDER BY {order}
        LIMIT %(limit)s OFFSET %(offset)s
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    total = rows[0]["total_count"] if rows else 0
    items = [Mp(**{k: v for k, v in r.items() if k != "total_count"}) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)


@router.get("/{mp_id}", response_model=MpProfile)
def get_mp(mp_id: str):
    with get_cursor() as cur:
        cur.execute(f"SELECT * FROM ({_LIST_SQL_BASE}) t WHERE mp_id = %(mp_id)s", {"mp_id": mp_id})
        row = cur.fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="MP not found")

        # High-risk-first ordering: worst cases surface without extra filtering.
        cur.execute(
            """
            SELECT w.work_id, w.data_source, w.mp_id, w.mp_name, w.state, w.district,
                   w.work_category, w.work_description, w.sanctioned_amount, w.expenditure,
                   w.physical_progress_percent, w.status,
                   wrs.composite_score, wrs.severity
            FROM work w
            LEFT JOIN work_risk_score wrs ON wrs.work_id = w.work_id
            WHERE w.mp_id = %(mp_id)s
            ORDER BY wrs.composite_score DESC NULLS LAST
            LIMIT 500
            """,
            {"mp_id": mp_id},
        )
        works = [WorkSummary(**r) for r in cur.fetchall()]

    return MpProfile(**row, works=works)
