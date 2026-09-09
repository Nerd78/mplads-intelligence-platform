"""
MPLADS eSAKSHI Dashboard Scraper
=================================
Scrapes the public, unauthenticated JSON REST endpoints behind the MPLADS
public dashboard (mplads.mospi.gov.in/digigov/dashboard.html).

Verified live on 2026-09-09 by reverse-engineering the dashboard's own
front-end module (/libs/simplegrid/preLoginDashboard.js + poptable.js +
graph.js). Re-verify close to build time -- government portals change
without notice.

Endpoint facts (as observed 2026-09-09)
--------------------------------------
  * Base path is  /rest/PreLoginDashboardData/*  -- NOT  /digigov/rest/*.
    (The /digigov/* path is session-gated and 302-redirects anything it
    doesn't recognise to /digigov/Login.zul, which is what made an earlier
    version of this script look "blocked".)
  * You must hit the dashboard HTML once first to pick up the JSESSIONID /
    ROUTEID cookies; every REST call is then made on that same session.
  * All calls are POST. No API key / CAPTCHA / login for these tiles.
  * "combo" strings are  <stateId>,<constId>,<mpId>,<house>  where an unset
    field is "0" and house is 2 = Lok Sabha, 1 = Rajya Sabha. The dashboard
    default (everything unset, Lok Sabha) is  "0,0,0,2".

  endpoint (POST)                     request body
  ---------------------------------   ---------------------------------------
  getStateData                        {}                       -> 35 states
  getTenureData                       {"uname": "0,0,0,2"}     -> tenure list
  getTilesData                        {"uname": "0,0,0,2"}     -> 6 headline
                                                                  tiles; its
                                                                  keys are the
                                                                  tile keys
  getConstituencyData                 {"id": <STATE_ID>}
  getMpNamesData                      {"state_combo": "<stId>,<house>,<tenure>"}
  getMpAndConstCombo                  {"const_combo": "<coId>,<house>,<tenure>"}
  getPieChartLabels                   ""  (literal empty body, not JSON)
  getgraphdata                        "0,0,0,2"  (raw string body, not JSON)
  getTilesReportData                  {"combo": "0,0,0,2", "key": "<tileKey>"}
                                        -> {"<label>": "<JSON-encoded string>"}
                                           i.e. the value must be json.loads()'d
                                           a second time. This is the drill-down
                                           the ML layer wants (per-MP / per-work
                                           rows). The big work-level tiles
                                           ("Works Recommended/Sanctioned/
                                           Completed", 30k-110k rows) are large
                                           and the backend resets the connection
                                           under rapid repeated polling -- fetch
                                           with backoff and generous delays.

  Individual work evidence lives under a second namespace:
  /rest/PreLoginCitizenWorkRcmdRest/getAttachmentById   {"id": <attId>}
  /rest/PreLoginCitizenWorkRcmdRest/getReviewDetailsByWork  {"json": <workId>}
  /rest/PreLoginDashboardData/getAttachIdsbyFlag        {"json": ...}

Usage
-----
    python mplads_scraper.py --test           # connectivity smoke test
    python mplads_scraper.py --tenures
    python mplads_scraper.py --states
    python mplads_scraper.py --tiles
    python mplads_scraper.py --constituencies # every state's constituencies
    python mplads_scraper.py --report "Works Completed"
    python mplads_scraper.py --all            # everything except huge reports

Output JSON is written to ./data/.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path

import requests

DASHBOARD_URL = "https://mplads.mospi.gov.in/digigov/dashboard.html"
BASE_URL = "https://mplads.mospi.gov.in/rest/PreLoginDashboardData"

# default combo shown by the dashboard: nothing selected, Lok Sabha
DEFAULT_COMBO = "0,0,0,2"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
)
HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": USER_AGENT,
    "Origin": "https://mplads.mospi.gov.in",
    "Referer": DASHBOARD_URL,
    "X-Requested-With": "XMLHttpRequest",
}

DEFAULT_TIMEOUT = 30
REPORT_TIMEOUT = 120  # the drill-down tiles can be many MB
OUTPUT_DIR = Path(__file__).resolve().parent / "data"

_SESSION: requests.Session | None = None


def get_session() -> requests.Session:
    """Return a session primed with the dashboard's cookies (JSESSIONID etc.)."""
    global _SESSION
    if _SESSION is None:
        s = requests.Session()
        s.headers.update({"User-Agent": USER_AGENT})
        s.get(DASHBOARD_URL, timeout=DEFAULT_TIMEOUT)
        _SESSION = s
    return _SESSION


def _post(
    endpoint: str,
    body,
    *,
    raw_body: bool = False,
    retries: int = 4,
    backoff: float = 3.0,
    timeout: int = DEFAULT_TIMEOUT,
):
    """POST to a PreLoginDashboardData endpoint with retry/backoff.

    body      : a dict (json-encoded) unless raw_body=True, in which case it is
                sent verbatim as the request body (some endpoints want a bare
                string or an empty body).
    """
    url = f"{BASE_URL}/{endpoint}"
    data = body if raw_body else json.dumps(body)
    session = get_session()
    last_err = None
    for attempt in range(1, retries + 1):
        try:
            resp = session.post(
                url, data=data, headers=HEADERS, timeout=timeout, allow_redirects=False
            )
            if resp.status_code in (301, 302, 303, 307, 308):
                raise RuntimeError(
                    f"redirected to {resp.headers.get('Location')!r} "
                    f"(wrong path, or session/cookie lost)"
                )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # noqa: BLE001 - report and retry
            last_err = exc
            print(
                f"  [attempt {attempt}/{retries}] {endpoint} failed: {exc}",
                file=sys.stderr,
            )
            if attempt < retries:
                time.sleep(backoff * attempt)
    raise RuntimeError(f"{endpoint} failed after {retries} attempts: {last_err}")


# --- typed endpoint wrappers -------------------------------------------------


def get_tenure_data(combo: str = DEFAULT_COMBO):
    return _post("getTenureData", {"uname": combo})


def get_state_data():
    return _post("getStateData", {})


def get_tiles_data(combo: str = DEFAULT_COMBO):
    return _post("getTilesData", {"uname": combo})


def get_constituency_data(state_id):
    return _post("getConstituencyData", {"id": state_id})


def get_mp_names(state_id, house: int = 2, tenure_id: int = 7):
    """List of {ID, CAPTION} MPs for a state. tenure_id 7 = 18th Lok Sabha."""
    return _post("getMpNamesData", {"state_combo": f"{state_id},{house},{tenure_id}"})


def make_combo(state_id=0, const_id=0, mp_id=0, house: int = 2) -> str:
    """Build the dashboard's combo string: <stateId>,<constId>,<mpId>,<house>."""
    return f"{state_id},{const_id},{mp_id},{house}"


def get_pie_chart_labels():
    return _post("getPieChartLabels", "", raw_body=True)


def get_graph_data(combo: str = DEFAULT_COMBO):
    return _post("getgraphdata", combo, raw_body=True)


def get_tiles_report_data(tile_key: str, combo: str = DEFAULT_COMBO):
    """Drill-down rows for one headline tile.

    The endpoint returns {"<label>": "<json-encoded string>"}; this unwraps the
    inner JSON so the caller gets real Python lists/dicts.
    """
    raw = _post(
        "getTilesReportData",
        {"combo": combo, "key": tile_key},
        timeout=REPORT_TIMEOUT,
        backoff=5.0,
    )
    if isinstance(raw, dict):
        out = {}
        for label, val in raw.items():
            if isinstance(val, str):
                try:
                    out[label] = json.loads(val)
                    continue
                except json.JSONDecodeError:
                    pass
            out[label] = val
        return out
    return raw


# --- io --------------------------------------------------------------------


def save_json(obj, name: str):
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUTPUT_DIR / f"{name}.json"
    path.write_text(json.dumps(obj, indent=2, ensure_ascii=False), encoding="utf-8")
    try:
        n = len(obj)
    except TypeError:
        n = "n/a"
    print(f"  saved -> {path}  ({path.stat().st_size:,} bytes, top-level len={n})")


def _slug(text: str) -> str:
    return "".join(c if c.isalnum() else "_" for c in text).strip("_").lower()


# --- commands ------------------------------------------------------------------


def run_smoke_test() -> bool:
    """Cheap connectivity + shape check. Does NOT touch the huge report tiles."""
    checks = [
        ("session cookies", lambda: dict(get_session().cookies)),
        ("getStateData", get_state_data),
        ("getTenureData", get_tenure_data),
        ("getTilesData", get_tiles_data),
        ("getPieChartLabels", get_pie_chart_labels),
    ]
    ok = True
    for i, (name, fn) in enumerate(checks, 1):
        print(f"[{i}/{len(checks)}] {name} ...")
        try:
            data = fn()
            count = len(data) if hasattr(data, "__len__") else "n/a"
            print(f"  OK - count={count}, sample={str(data)[:180]}")
        except Exception as exc:  # noqa: BLE001
            print(f"  FAILED: {exc}")
            ok = False
    print("\nSMOKE TEST:", "PASSED" if ok else "FAILED")
    return ok


def dump_constituencies():
    states = get_state_data()
    out = {}
    for st in states:
        sid, sname = st["STATE_ID"], st["STATE_NAME"]
        try:
            out[sname] = get_constituency_data(sid)
            print(f"  {sname}: {len(out[sname])} constituencies")
        except Exception as exc:  # noqa: BLE001
            print(f"  {sname}: FAILED ({exc})")
        time.sleep(0.5)
    save_json(out, "constituencies")


def dump_report(tile_key: str, combo: str = DEFAULT_COMBO, name: str | None = None):
    print(f"Fetching drill-down report for tile {tile_key!r} (combo={combo})...")
    data = get_tiles_report_data(tile_key, combo=combo)
    for label, rows in (data.items() if isinstance(data, dict) else []):
        n = len(rows) if hasattr(rows, "__len__") else "n/a"
        print(f"  '{label}': {n} rows")
    save_json(data, name or f"report_{_slug(tile_key)}")


def dump_report_by_state(tile_key: str, house: int = 2):
    """Fetch a tile drill-down one state at a time and merge the rows.

    The unfiltered work-level tiles ("Works Recommended" ~108k rows especially)
    can time the backend out; per-state combos (a few hundred-few thousand rows
    each) are reliable. Rows are de-duplicated on WORK_RECOMMENDATION_DTL_ID /
    WORK_ID when present.
    """
    states = get_state_data()
    merged: list = []
    seen: set = set()
    id_field = None
    per_state: dict[str, int] = {}
    for st in states:
        sid, sname = st["STATE_ID"], st["STATE_NAME"]
        combo = make_combo(state_id=sid, house=house)
        try:
            data = get_tiles_report_data(tile_key, combo=combo)
        except Exception as exc:  # noqa: BLE001
            print(f"  {sname}: FAILED ({exc})")
            continue
        rows = []
        if isinstance(data, dict):
            for v in data.values():
                if isinstance(v, list):
                    rows = v
                    break
        # the API appends a summary row like {"Total_Amt": 12345.0}; drop it
        rows = [r for r in rows if "MP_NAME" in r]
        if id_field is None and rows:
            for cand in ("WORK_RECOMMENDATION_DTL_ID", "WORK_ID", "WORK_RECOMMENDATION_ID"):
                if cand in rows[0]:
                    id_field = cand
                    break
        added = 0
        for r in rows:
            key = r.get(id_field) if id_field else (sname, r.get("Sno"))
            if key in seen:
                continue
            seen.add(key)
            merged.append(r)
            added += 1
        per_state[sname] = added
        print(f"  {sname}: {len(rows)} rows ({added} new)")
        time.sleep(1.0)
    print(f"\n  TOTAL merged rows: {len(merged)} (dedup on {id_field})")
    save_json(
        {"tile_key": tile_key, "house": house, "row_count": len(merged),
         "per_state_counts": per_state, "rows": merged},
        f"report_{_slug(tile_key)}_by_state",
    )


def main():
    parser = argparse.ArgumentParser(description="MPLADS eSAKSHI dashboard scraper")
    parser.add_argument("--test", action="store_true", help="connectivity smoke test")
    parser.add_argument("--tenures", action="store_true", help="save tenure list")
    parser.add_argument("--states", action="store_true", help="save state list")
    parser.add_argument("--tiles", action="store_true", help="save headline tiles")
    parser.add_argument("--pie", action="store_true", help="save pie-chart labels + graph data")
    parser.add_argument(
        "--constituencies", action="store_true", help="save every state's constituencies"
    )
    parser.add_argument(
        "--report", metavar="TILE_KEY", help='save one tile drill-down, e.g. "Works Completed"'
    )
    parser.add_argument(
        "--by-state",
        action="store_true",
        help="with --report: fetch per-state and merge (needed for the big tiles)",
    )
    parser.add_argument(
        "--state", type=int, metavar="STATE_ID", help="with --report: filter to one state id"
    )
    parser.add_argument(
        "--mp", type=int, metavar="MP_ID", help="with --report/--state: filter to one MP id"
    )
    parser.add_argument(
        "--recommendations",
        action="store_true",
        help='shortcut for --report "Works Recommended" --by-state '
        "(per-MP RECOMMENDED_AMOUNT = funds each MP allocated)",
    )
    parser.add_argument(
        "--all", action="store_true", help="states + tenures + tiles + pie + constituencies"
    )
    args = parser.parse_args()

    if not any(vars(args).values()):
        args.test = True

    if args.test:
        sys.exit(0 if run_smoke_test() else 1)

    if args.states or args.all:
        print("Fetching state data...")
        save_json(get_state_data(), "states")
    if args.tenures or args.all:
        print("Fetching tenure data...")
        save_json(get_tenure_data(), "tenures")
    if args.tiles or args.all:
        print("Fetching tiles data...")
        save_json(get_tiles_data(), "tiles")
    if args.pie or args.all:
        print("Fetching pie-chart labels + graph data...")
        save_json(
            {"labels": get_pie_chart_labels(), "graph": get_graph_data()}, "pie_charts"
        )
    if args.constituencies or args.all:
        print("Fetching constituencies for every state...")
        dump_constituencies()

    if args.recommendations:
        dump_report_by_state("Works Recommended")
    if args.report:
        if args.by_state:
            dump_report_by_state(args.report)
        elif args.state or args.mp:
            combo = make_combo(state_id=args.state or 0, mp_id=args.mp or 0)
            suffix = f"_s{args.state or 0}_mp{args.mp or 0}"
            dump_report(args.report, combo=combo, name=f"report_{_slug(args.report)}{suffix}")
        else:
            dump_report(args.report)


if __name__ == "__main__":
    main()
