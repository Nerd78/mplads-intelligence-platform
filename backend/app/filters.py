"""Shared WHERE-clause builder for the /works, /alerts and /geo/* endpoints
so filter semantics (state, district, category, date range, severity,
data_source, min risk score) stay identical everywhere they're offered."""
from __future__ import annotations

from datetime import date
from typing import Optional


def build_work_where(
    *,
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
    flag: Optional[str] = None,
    mp_name: Optional[str] = None,
) -> tuple[str, dict]:
    clauses = ["1=1"]
    params: dict = {}

    if state:
        clauses.append("w.state = %(state)s")
        params["state"] = state
    if district:
        clauses.append("w.district = %(district)s")
        params["district"] = district
    if work_category:
        clauses.append("w.work_category = %(work_category)s")
        params["work_category"] = work_category
    if data_source:
        clauses.append("w.data_source = %(data_source)s")
        params["data_source"] = data_source
    if mp_id:
        clauses.append("w.mp_id = %(mp_id)s")
        params["mp_id"] = mp_id
    if severity:
        clauses.append("wrs.severity = %(severity)s")
        params["severity"] = severity
    if min_risk is not None:
        clauses.append("wrs.composite_score >= %(min_risk)s")
        params["min_risk"] = min_risk
    if date_from:
        clauses.append("w.sanction_date >= %(date_from)s")
        params["date_from"] = date_from
    if date_to:
        clauses.append("w.sanction_date <= %(date_to)s")
        params["date_to"] = date_to
    if flag:
        # EXISTS rather than a join: a work can carry several flags, and
        # joining work_risk_flag would multiply the row out and break the
        # COUNT(*) OVER() total the list endpoints page on.
        clauses.append(
            "EXISTS (SELECT 1 FROM work_risk_flag f "
            "WHERE f.work_id = w.work_id AND f.flag_label = %(flag)s)"
        )
        params["flag"] = flag
    if mp_name:
        clauses.append("w.mp_name ILIKE %(mp_name)s")
        params["mp_name"] = f"%{mp_name}%"
    if search:
        clauses.append(
            "(w.work_id ILIKE %(search)s OR w.mp_name ILIKE %(search)s OR "
            "w.work_description ILIKE %(search)s OR w.contractor_name ILIKE %(search)s OR "
            "w.district ILIKE %(search)s OR w.state ILIKE %(search)s OR w.constituency ILIKE %(search)s)"
        )
        params["search"] = f"%{search}%"

    return " AND ".join(clauses), params


SORTABLE_COLUMNS = {
    "composite_score": "wrs.composite_score",
    "sanction_date": "w.sanction_date",
    "expenditure": "w.expenditure",
    "sanctioned_amount": "w.sanctioned_amount",
}


def sort_clause(sort: Optional[str], default: str = "wrs.composite_score DESC NULLS LAST") -> str:
    if not sort:
        return default
    desc = sort.startswith("-")
    col_key = sort[1:] if desc else sort
    col = SORTABLE_COLUMNS.get(col_key)
    if not col:
        return default
    return f"{col} {'DESC' if desc else 'ASC'} NULLS LAST"
