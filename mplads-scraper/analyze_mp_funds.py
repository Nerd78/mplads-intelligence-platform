"""
Per-MP fund allocation summary
==============================
Joins the two halves of the MPLADS fund picture:

  data/report_works_recommended_by_state.json   (what each MP allocated)
  data/report_allocated_limit_for_hon_ble_mps.json  (each MP's entitlement)

and writes data/mp_fund_allocation_summary.csv with, per MP:
  works_recommended, recommended_amt, sanctioned_amt, entitlement_amt,
  utilisation_pct (= recommended / entitlement).

Regenerate the inputs first with:
  python mplads_scraper.py --recommendations
  python mplads_scraper.py --report "Allocated Limit for Hon'ble MPs"
"""

import collections
import csv
import json
import pathlib

DATA = pathlib.Path(__file__).resolve().parent / "data"
CR = 1e7  # 1 crore


def _rows_from(obj):
    if isinstance(obj, dict):
        if "rows" in obj and isinstance(obj["rows"], list):
            return obj["rows"]
        for v in obj.values():
            if isinstance(v, list):
                return v
    return obj if isinstance(obj, list) else []


def main():
    rec = _rows_from(json.load(open(DATA / "report_works_recommended_by_state.json", encoding="utf-8")))
    ent = [r for r in _rows_from(
        json.load(open(DATA / "report_allocated_limit_for_hon_ble_mps.json", encoding="utf-8"))
    ) if "MP_NAME" in r]
    print(f"recommended work rows: {len(rec):,}   entitlement rows: {len(ent):,}")

    entitlement = collections.defaultdict(float)
    for r in ent:
        entitlement[r["MP_NAME"].strip().upper()] += r["ALLOCATED_AMT"]

    agg = collections.defaultdict(
        lambda: {"works": 0, "rec": 0.0, "san": 0.0, "state": "", "constituency": ""}
    )
    for r in rec:
        name = (r.get("MP_NAME") or "").strip().upper()
        a = agg[name]
        a["works"] += 1
        a["rec"] += r.get("RECOMMENDED_AMOUNT") or 0
        a["san"] += r.get("SANCTION_AMOUNT") or 0
        a["state"] = r.get("STATE_NAME", a["state"])
        a["constituency"] = r.get("CONSTITUENCY", a["constituency"])

    out = []
    for name, a in agg.items():
        ent_amt = entitlement.get(name, 0.0)
        util = round(a["rec"] / ent_amt * 100, 1) if ent_amt else ""
        out.append({
            "mp_name": name, "state": a["state"], "constituency": a["constituency"],
            "works_recommended": a["works"],
            "recommended_amt": round(a["rec"], 2),
            "sanctioned_amt": round(a["san"], 2),
            "entitlement_amt": round(ent_amt, 2),
            "utilisation_pct": util,
        })
    out.sort(key=lambda x: x["recommended_amt"], reverse=True)

    csv_path = DATA / "mp_fund_allocation_summary.csv"
    with open(csv_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(out[0].keys()))
        w.writeheader()
        w.writerows(out)

    tot_rec = sum(x["recommended_amt"] for x in out)
    tot_ent = sum(entitlement.values())
    print(f"MPs: {len(out)}   saved -> {csv_path}")
    print(f"total recommended: Rs {tot_rec/CR:,.0f} Cr   "
          f"total entitlement: Rs {tot_ent/CR:,.0f} Cr   "
          f"overall utilisation: {tot_rec/tot_ent*100:.1f}%")

    print("\ntop 5 by amount allocated:")
    for x in out[:5]:
        print(f"  {x['mp_name'][:34]:34} {x['state'][:16]:16} "
              f"works={x['works_recommended']:4} "
              f"Rs{x['recommended_amt']/CR:6.1f} Cr  util={x['utilisation_pct']}%")


if __name__ == "__main__":
    main()
