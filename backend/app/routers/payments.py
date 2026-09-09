from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Query

from ..db import get_cursor
from ..schemas import Page, Payment

router = APIRouter(prefix="/payments", tags=["payments"])


@router.get("", response_model=Page[Payment])
def list_payments(
    work_id: Optional[str] = None,
    vendor_id: Optional[str] = None,
    is_vendor_blacklisted: Optional[bool] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    clauses = ["1=1"]
    params: dict = {"limit": limit, "offset": offset}
    if work_id:
        clauses.append("work_id = %(work_id)s")
        params["work_id"] = work_id
    if vendor_id:
        clauses.append("vendor_id = %(vendor_id)s")
        params["vendor_id"] = vendor_id
    if is_vendor_blacklisted is not None:
        clauses.append("is_vendor_blacklisted = %(is_vendor_blacklisted)s")
        params["is_vendor_blacklisted"] = is_vendor_blacklisted
    if date_from:
        clauses.append("payment_date >= %(date_from)s")
        params["date_from"] = date_from
    if date_to:
        clauses.append("payment_date <= %(date_to)s")
        params["date_to"] = date_to

    where_sql = " AND ".join(clauses)
    sql = f"""
        SELECT *, COUNT(*) OVER() AS total_count
        FROM payment
        WHERE {where_sql}
        ORDER BY payment_date DESC NULLS LAST
        LIMIT %(limit)s OFFSET %(offset)s
    """
    with get_cursor() as cur:
        cur.execute(sql, params)
        rows = cur.fetchall()

    total = rows[0]["total_count"] if rows else 0
    items = [Payment(**{k: v for k, v in r.items() if k != "total_count"}) for r in rows]
    return Page(items=items, total=total, limit=limit, offset=offset)
