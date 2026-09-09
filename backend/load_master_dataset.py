"""Loads the three principal_master_*.json files into the schema in
schema.sql. Run once against a fresh database (after applying schema.sql)
before running detection/run_detection.py.

Usage (from backend/, with the repo's data files at the repo root -- the
default layout this was built against):
    python load_master_dataset.py

Or point at a different location:
    python load_master_dataset.py --data-dir /path/to/data

DATABASE_URL is read from the environment / backend/.env -- never
hardcoded (see detection/db.py for the same pattern).
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime

import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import execute_batch

load_dotenv()

DEFAULT_LOCAL_URL = "postgresql://postgres:postgres@localhost:5432/mplads"
DEFAULT_DATA_DIR = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))


def connect_db():
    database_url = os.environ.get("DATABASE_URL", DEFAULT_LOCAL_URL)
    try:
        conn = psycopg2.connect(database_url)
        print("[OK] Connected to Postgres")
        return conn
    except Exception as e:
        print(f"[ERROR] Failed to connect to Postgres: {e}")
        sys.exit(1)


def parse_date(val):
    if not val or val in ("NA", "N/A"):
        return None
    return val


def load_mp_summary(conn, filepath):
    print(f"\n[LOADING] MP summary from {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print("[ERROR] MP summary JSON should be a list")
        return 0

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO source_batch (source_type, source_detail, loaded_at, loaded_by, row_count) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING batch_id",
        ("master_dataset", "principal_master_mp_summary.json", datetime.now(), "data_loader", len(data)),
    )
    batch_id = cursor.fetchone()[0]
    conn.commit()

    mp_rows, metrics_rows = [], []
    for record in data:
        mp_rows.append(
            (
                record.get("mp_id"),
                None,
                record.get("mp_name", "").strip(),
                record.get("mp_name", "").strip(),
                None,
                record.get("house"),
                record.get("state"),
                record.get("constituency"),
                None,
                None,
                None,
                record.get("allocated_amt"),
                record.get("entitlement_amt"),
                batch_id,
            )
        )
        metrics_rows.append(
            (
                record.get("mp_id"),
                record.get("scraped_works_recommended"),
                record.get("total_works_count"),
                record.get("completed_works_count"),
                record.get("ongoing_works_count"),
                record.get("total_recommended_amt"),
                record.get("total_sanctioned_amt"),
                record.get("total_expenditure_amt"),
                record.get("unutilized_fund_amt"),
                record.get("utilisation_rate_pct"),
                record.get("avg_sanction_delay_days"),
                record.get("avg_project_duration_days"),
                record.get("total_cost_overrun_amt"),
                record.get("blacklisted_contractor_works_count"),
                record.get("blacklisted_contractor_funds_amount"),
                bool(record.get("has_blacklisted_contractor_flag", 0)),
                record.get("anomaly_works_count"),
                record.get("excess_duration_works_count"),
                record.get("anomaly_works_pct"),
                record.get("composite_risk_score"),
                batch_id,
            )
        )

    execute_batch(
        cursor,
        """INSERT INTO mp (mp_id, sno, name, name_raw, house_code, house, state, constituency, tenure,
                           tenure_start, tenure_end, allocated_amt, entitlement_amt, batch_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (mp_id) DO UPDATE SET entitlement_amt = EXCLUDED.entitlement_amt, batch_id = EXCLUDED.batch_id""",
        mp_rows,
        page_size=1000,
    )
    execute_batch(
        cursor,
        """INSERT INTO mp_metrics_snapshot
               (mp_id, scraped_works_recommended, total_works_count, completed_works_count, ongoing_works_count,
                total_recommended_amt, total_sanctioned_amt, total_expenditure_amt, unutilized_fund_amt,
                utilisation_rate_pct, avg_sanction_delay_days, avg_project_duration_days, total_cost_overrun_amt,
                blacklisted_contractor_works_count, blacklisted_contractor_funds_amount,
                has_blacklisted_contractor_flag, anomaly_works_count, excess_duration_works_count,
                anomaly_works_pct, composite_risk_score, batch_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT DO NOTHING""",
        metrics_rows,
        page_size=1000,
    )
    conn.commit()
    print(f"[OK] Loaded {len(mp_rows)} MP records")
    cursor.close()
    return len(mp_rows)


def load_works(conn, filepath):
    print(f"\n[LOADING] Works from {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print("[ERROR] Works JSON should be a list")
        return 0

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO source_batch (source_type, source_detail, loaded_at, loaded_by, row_count) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING batch_id",
        ("master_dataset", "principal_master_works.json", datetime.now(), "data_loader", len(data)),
    )
    batch_id = cursor.fetchone()[0]
    conn.commit()

    work_rows, ground_truth_rows = [], []
    for record in data:
        work_rows.append(
            (
                record.get("work_id"),
                record.get("data_source", "UNKNOWN"),
                record.get("mp_id"),
                record.get("mp_name"),
                record.get("house"),
                record.get("state"),
                record.get("constituency"),
                record.get("district"),
                record.get("block"),
                record.get("village_or_ward"),
                record.get("latitude"),
                record.get("longitude"),
                record.get("work_description"),
                record.get("work_category"),
                record.get("implementing_agency"),
                record.get("contractor_vendor_id"),
                record.get("contractor_name"),
                bool(record.get("is_contractor_blacklisted", 0)),
                record.get("blacklisted_reason", "N/A"),
                bool(record.get("is_blacklisted_contractor_anomaly", 0)),
                record.get("estimated_cost"),
                record.get("sanctioned_amount"),
                record.get("expenditure"),
                record.get("physical_progress_percent"),
                record.get("financial_progress_percent"),
                parse_date(record.get("recommendation_date")),
                parse_date(record.get("sanction_date")),
                parse_date(record.get("expected_completion_date")),
                parse_date(record.get("actual_completion_date")),
                record.get("status"),
                record.get("sanction_delay_days"),
                record.get("completion_delay_days"),
                record.get("cost_overrun_amount"),
                record.get("cost_overrun_percent"),
                record.get("progress_mismatch_gap"),
                record.get("category_national_avg_duration_days"),
                record.get("project_duration_days"),
                record.get("duration_variance_vs_national_avg_days"),
                record.get("duration_to_national_avg_ratio"),
                bool(record.get("is_exceeds_national_avg_duration", 0)),
                bool(record.get("is_excess_duration_anomaly", 0)),
                record.get("letter_no"),
                bool(record.get("synthetic_record", False)),
                record.get("synthetic_scenario"),
                batch_id,
            )
        )

        anomaly = record.get("ground_truth_anomaly")
        if anomaly:
            labels = [a.strip() for a in anomaly.split("|")] if isinstance(anomaly, str) else [anomaly]
            ground_truth_rows.extend((record.get("work_id"), label) for label in labels)

    execute_batch(
        cursor,
        """INSERT INTO work (work_id, data_source, mp_id, mp_name, house, state, constituency, district, block,
               village_or_ward, latitude, longitude, work_description, work_category, implementing_agency,
               contractor_vendor_id, contractor_name, is_contractor_blacklisted, blacklisted_reason,
               is_blacklisted_contractor_anomaly, estimated_cost, sanctioned_amount, expenditure,
               physical_progress_percent, financial_progress_percent, recommendation_date, sanction_date,
               expected_completion_date, actual_completion_date, status, sanction_delay_days,
               completion_delay_days, cost_overrun_amount, cost_overrun_percent, progress_mismatch_gap,
               category_national_avg_duration_days, project_duration_days,
               duration_variance_vs_national_avg_days, duration_to_national_avg_ratio,
               is_exceeds_national_avg_duration, is_excess_duration_anomaly, letter_no, synthetic_record,
               synthetic_scenario, batch_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                   %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (work_id) DO UPDATE SET status = EXCLUDED.status, expenditure = EXCLUDED.expenditure""",
        work_rows,
        page_size=500,
    )
    if ground_truth_rows:
        execute_batch(
            cursor,
            "INSERT INTO work_ground_truth_label (work_id, label) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ground_truth_rows,
            page_size=500,
        )
    conn.commit()
    print(f"[OK] Loaded {len(work_rows)} work records with {len(ground_truth_rows)} anomaly labels")
    cursor.close()
    return len(work_rows)


def load_vendors_from_works(conn, filepath):
    print("\n[LOADING] Vendors extracted from works data")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO source_batch (source_type, source_detail, loaded_at, loaded_by) VALUES (%s, %s, %s, %s) RETURNING batch_id",
        ("master_dataset", "vendor extraction from works", datetime.now(), "data_loader"),
    )
    batch_id = cursor.fetchone()[0]
    conn.commit()

    seen, vendor_rows = set(), []
    for record in data:
        vendor_id = record.get("contractor_vendor_id")
        if vendor_id and vendor_id not in seen:
            seen.add(vendor_id)
            vendor_rows.append(
                (
                    vendor_id,
                    record.get("contractor_name"),
                    record.get("contractor_name"),
                    None,
                    bool(record.get("is_contractor_blacklisted", 0)),
                    record.get("blacklisted_reason", "N/A"),
                    batch_id,
                )
            )

    execute_batch(
        cursor,
        """INSERT INTO vendor (vendor_id, name, name_raw, pan_hash, is_blacklisted, blacklisted_reason, batch_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s) ON CONFLICT (vendor_id) DO NOTHING""",
        vendor_rows,
        page_size=1000,
    )
    conn.commit()
    print(f"[OK] Loaded {len(vendor_rows)} vendors")
    cursor.close()
    return len(vendor_rows)


def load_payments(conn, filepath):
    print(f"\n[LOADING] Payments from {filepath}")
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not isinstance(data, list):
        print("[ERROR] Payments JSON should be a list")
        return 0

    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO source_batch (source_type, source_detail, loaded_at, loaded_by, row_count) "
        "VALUES (%s, %s, %s, %s, %s) RETURNING batch_id",
        ("master_dataset", "principal_master_payments.json", datetime.now(), "data_loader", len(data)),
    )
    batch_id = cursor.fetchone()[0]
    conn.commit()

    payment_rows, ground_truth_rows = [], []
    for record in data:
        payment_rows.append(
            (
                record.get("payment_id"),
                record.get("work_id"),
                record.get("mp_id"),
                record.get("implementing_agency"),
                parse_date(record.get("payment_date")),
                record.get("payment_amount"),
                record.get("payment_type"),
                record.get("vendor_id"),
                bool(record.get("is_vendor_blacklisted", 0)),
                record.get("vendor_blacklisted_reason", "N/A"),
                bool(record.get("is_blacklisted_vendor_payment_anomaly", 0)),
                bool(record.get("synthetic_record", False)),
                record.get("synthetic_scenario"),
                batch_id,
            )
        )
        anomaly = record.get("ground_truth_anomaly")
        if anomaly:
            labels = [a.strip() for a in anomaly.split("|")] if isinstance(anomaly, str) else [anomaly]
            ground_truth_rows.extend((record.get("payment_id"), label) for label in labels)

    execute_batch(
        cursor,
        """INSERT INTO payment (payment_id, work_id, mp_id, implementing_agency, payment_date, payment_amount,
               payment_type, vendor_id, is_vendor_blacklisted, vendor_blacklisted_reason,
               is_blacklisted_vendor_payment_anomaly, synthetic_record, synthetic_scenario, batch_id)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
           ON CONFLICT (payment_id) DO UPDATE SET payment_amount = EXCLUDED.payment_amount""",
        payment_rows,
        page_size=500,
    )
    if ground_truth_rows:
        execute_batch(
            cursor,
            "INSERT INTO payment_ground_truth_label (payment_id, label) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            ground_truth_rows,
            page_size=500,
        )
    conn.commit()
    print(f"[OK] Loaded {len(payment_rows)} payment records with {len(ground_truth_rows)} anomaly labels")
    cursor.close()
    return len(payment_rows)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--data-dir",
        default=DEFAULT_DATA_DIR,
        help="Directory containing principal_master_{mp_summary,works,payments}.json (default: repo root)",
    )
    args = parser.parse_args()

    files = {
        "mp_summary": os.path.join(args.data_dir, "principal_master_mp_summary.json"),
        "works": os.path.join(args.data_dir, "principal_master_works.json"),
        "payments": os.path.join(args.data_dir, "principal_master_payments.json"),
    }
    missing = [name for name, path in files.items() if not os.path.exists(path)]
    if missing:
        print(f"[ERROR] Missing data file(s): {', '.join(missing)} (looked in {args.data_dir})")
        print("These are the raw MPLADS datasets -- see README.md for how to obtain them via mplads-scraper/.")
        sys.exit(1)

    print("=" * 80)
    print("MPLADS master dataset loader")
    print("=" * 80)

    conn = connect_db()
    total = 0
    total += load_mp_summary(conn, files["mp_summary"])
    total += load_works(conn, files["works"])
    total += load_vendors_from_works(conn, files["works"])
    total += load_payments(conn, files["payments"])
    conn.close()

    print("\n" + "=" * 80)
    print(f"[COMPLETE] Loaded {total} total records")
    print("=" * 80)


if __name__ == "__main__":
    main()
