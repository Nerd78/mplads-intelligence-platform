# Master Dataset vs. Current DB Schema — Gap Analysis & Final Schema

**Verified against:** `principal_master_works.json` (111,525 rows), `principal_master_payments.json` (12,040 rows), `principal_master_mp_summary.json` (776 rows), plus `MASTER_DATASET_SCHEMA.md` and the three JSON-Schema files in `schema/`.

**Method:** every finding below was checked directly against the real JSON files on disk (not just read off the docs) — full-file scans for referential integrity, null/sentinel rates, and distinct-value counts. Nothing here is a guess.

---

## 1. Referential integrity — clean

- 111,525/111,525 work rows resolve `mp_id` against `mp_summary.mp_id`. 100%.
- 12,040/12,040 payment rows resolve `mp_id` against `mp_summary.mp_id`. 100%.
- 12,040/12,040 payment rows resolve `work_id` against `works.work_id`. 100%.
- Blacklist flags are internally and cross-file consistent — every `vendor_id` that appears as blacklisted in `works.json` (as `contractor_vendor_id`) carries the same blacklist status and reason everywhere it appears in `payments.json`. Zero conflicts found across the full files.

No cleanup needed here — this dataset is safe to load with normal FK constraints.

## 2. `data_source` — missing from the schema entirely

The old schema had no concept of real vs. synthetic rows. The master dataset tags every work and every payment with `data_source` (`WEB_SCRAPED_REAL` / `SYNTHETIC_BENCHMARK`) — this is now essential: any query that mixes both without filtering will silently blend real MPLADS data with generated benchmark data. Added to `work` (`payment.json` doesn't carry this field itself — payments are 100% synthetic today, see §6 — so it wasn't added there).

## 3. `status` CHECK constraint — actively wrong

The current schema constrains `status` to `('recommended', 'sanctioned', 'in_progress', 'completed', 'unknown')`. None of these five strings occur anywhere in the real data. Status values partition cleanly by `data_source`:

- Real rows (`WEB_SCRAPED_REAL`) use a distinct vocabulary that includes values like `Work partially Completed`, `Pending for Sanction`, and a literal `NA`.
- Synthetic rows (`SYNTHETIC_BENCHMARK`) use `Completed` / `Ongoing` — values that never appear on real rows.

**Fix:** dropped the CHECK constraint. `status` is now free `TEXT`, indexed. A rigid enum would just break the next load when a new status string shows up (which has already happened once).

## 4. `sanction_date` — sentinel string, not truly malformed

Deep-checked the earlier "4,100 malformed dates in first 20,000 rows" finding against the full 111,525-row file:

- 28,084 works (25.2% of the whole file) have `sanction_date == "NA"` (the literal string, not empty/null).
- 100% of those are `WEB_SCRAPED_REAL`.
- 27,560 of them have `status = 'Pending for Sanction'` — i.e. this isn't bad data, it's the correct representation of "not sanctioned yet." The remaining 524 have `status = 'NA'` too (a separate, smaller data-quality wrinkle in `status` itself).
- `recommendation_date`, `expected_completion_date`, and `actual_completion_date` don't use this "NA" sentinel — they use real JSON `null` for missing values. So the missing-value convention is inconsistent across columns in the source.

**Fix:** `sanction_date` stays `DATE` (nullable). This is a **loader responsibility**, not a schema one — the ETL must map the literal string `"NA"` to SQL `NULL` before insert (the loader already does exactly this pattern for other sentinel values, per `loader.py`'s existing NaN→None handling).

## 5. `ground_truth_anomaly` — multi-valued, needs a different storage model

Confirmed against the full works file: 6,442 of 111,525 works (5.8%) carry more than one label, pipe-delimited (e.g. `AWARDED_TO_BLACKLISTED_CONTRACTOR|SANCTION_DELAY_EXCEEDS_90_DAYS`), up to 3 labels observed on one row. 11 distinct atomic labels currently exist: `NORMAL`, `SANCTION_DELAY_EXCEEDS_90_DAYS`, `EXCESS_PROJECT_DURATION_VS_NATIONAL_AVG`, `AWARDED_TO_BLACKLISTED_CONTRACTOR`, `DUPLICATE_WORK`, `DELAYED_WORK`, `UNUSUAL_EXPENDITURE`, `COST_OVERRUN`, `AGENCY_ANOMALY`, `PROGRESS_MISMATCH`, `GEOGRAPHIC_ANOMALY`.

A single TEXT column would force every query ("how many works are flagged `DUPLICATE_WORK`?") into string parsing.

**Fix:** kept the raw pipe-delimited string as `ground_truth_anomaly_raw` (fidelity/audit), and added a proper child table `work_ground_truth_label(work_id, label)` — one row per label, so filtering/counting by label is a normal join. Mirrored the same pattern for payments (`payment_ground_truth_label`), since payments carry the same multi-valued convention. Left `label` as free TEXT rather than an enum, since the synthetic generator is clearly still being extended (11 labels is already more than the 7 named in the schema docs).

`ground_truth_severity` was verified safe as a 5-value CHECK: `NORMAL` (63,572), `MEDIUM` (29,266), `CRITICAL` (9,726), `HIGH` (8,859), `LOW` (102) — all five values are real and present, including the rare `LOW` that isn't mentioned in `MASTER_DATASET_SCHEMA.md`'s prose but does exist in the data.

## 6. Payments table is 100% synthetic — real `work.expenditure` is the only real spend figure

Every payment row's `synthetic_record` flag was checked — 100% `TRUE`, zero real-world payment transactions exist in this dataset yet. This has a direct schema consequence: **`work_latest_status`'s old logic (`total_paid = SUM(payment.amount)`) would have silently reported a fabricated "amount paid" for every real work**, since summing an entirely-synthetic ledger against real works makes no sense.

**Fix:** the view now uses `work.expenditure` (present and real for `WEB_SCRAPED_REAL` rows) as `total_paid`, and keeps the payment-ledger sum as a separately labeled `total_payment_ledger_amt` column so it's never mistaken for real disbursement data.

## 7. Vendor IDs are clean; `implementing_agency` is not

- `contractor_vendor_id` (works) and `vendor_id` (payments) both use the same clean short-code format (`Vendor_161`, `Vendor_45`, ...) — direct equality join, no fuzzy resolution needed. `work.vendor_id` / `payment.vendor_id` now FK straight to `vendor.vendor_id`.
- `implementing_agency` is free text with **769 distinct values** in the works file — same fuzzy-resolution problem the existing `EntityResolver`/`agency` table already solves for the legacy Allocated-Limit data. Kept the raw text column on `work` for fidelity, plus the existing `agency_id` FK for the resolved entity.

## 8. Vendor blacklist status — now canonical on `vendor`, not just per-row

Since blacklist flags are 100% consistent for a given vendor across both files (§1), added `vendor.is_blacklisted` / `vendor.blacklisted_reason` as the single source of truth. The per-row snapshot columns (`work.is_contractor_blacklisted`, `payment.is_vendor_blacklisted`, and their `*_anomaly` flags) are kept too — those are ML ground-truth features tied to a specific work/payment, not just a vendor lookup, so both need to exist side by side.

## 9. MP identity — two incompatible ID schemes

This is the most structurally significant gap. The legacy "Allocated Limit" scrape (543 rows, already loaded via the existing `mp` table) derives `mp_id` from normalized `name + constituency`. The master dataset's `principal_master_mp_summary.json` (776 rows) assigns every MP a different, hashed `mp_id` (e.g. `575306419c50`) — I tried reproducing it from every plausible input combination (name, name+constituency, name+state+constituency, with MD5/SHA1/SHA256, upper/lower/stripped) and none matched, so it uses an algorithm or salt not derivable from the fields alone.

Since the master dataset's ID space is now what 111,525 work rows and 12,040 payment rows actually key off (100% referential match, §1), it's the dominant identifier space by two orders of magnitude over the legacy 543-row file.

**Recommendation (schema stays agnostic; this is a loader-level fix):** treat `principal_master_mp_summary.json`'s `mp_id` as authoritative going forward. When loading the legacy Allocated-Limit files, fuzzy-match each row on `(name, constituency)` against the `mp` table (the same `EntityResolver` pattern already used for agencies) and attach `allocated_amt` / `tenure_start` / `tenure_end` / `sno` / `house_code` onto the *matched* row, instead of minting a second, incompatible `mp_id` for the same person. The schema's `mp.mp_id` column stays plain `TEXT PRIMARY KEY` either way — it doesn't need to know the hash algorithm, just get consistent values fed into it.

## 10. MP aggregate metrics — a computed snapshot, not a raw fact

`principal_master_mp_summary.json`'s 18 aggregate columns (`total_works_count`, `utilisation_rate_pct`, `composite_risk_score`, etc.) are derived by the team's pipeline from the works table at a point in time, not scraped facts. Folding them directly into `mp` would mean every future works-load either goes stale or requires an in-place `UPDATE` that destroys any history of how a given MP's risk score moved over time.

**Fix:** new table `mp_metrics_snapshot`, FK'd to `mp.mp_id`, with its own `computed_at` timestamp and `batch_id`. `mp` itself stays a clean identity/reference dimension; `entitlement_amt` (from the master file) was added there alongside the legacy `allocated_amt`, since the two pipelines don't yet agree on which entitlement figure is authoritative — both are kept until the team decides, rather than silently picking one.

## 11. Removed: the old speculative `dq_missing_*` flags

The original schema had `dq_missing_cost` / `dq_missing_geo` / `dq_missing_photo` / `dq_geo_district_mismatch` on `work`, with no defined computation logic behind them. The master dataset's verified ground-truth/anomaly columns are strictly richer and evidence-based, so these were dropped rather than carried forward as unused cruft.

## 12. Everything else added straight from the source schema

All remaining master-dataset columns were added to `work` and `payment` with matching names and types for a near-direct load: `estimated_cost`, `sanctioned_amount`, `physical_progress_percent`, `financial_progress_percent`, `sanction_delay_days`, `completion_delay_days`, `cost_overrun_amount`, `cost_overrun_percent`, `progress_mismatch_gap`, `category_national_avg_duration_days`, `project_duration_days`, `duration_variance_vs_national_avg_days`, `duration_to_national_avg_ratio`, `is_exceeds_national_avg_duration`, `is_excess_duration_anomaly`, `letter_no`, `synthetic_record`, `synthetic_scenario`, `block`, `village_or_ward`, `latitude`/`longitude` (renamed from `geo_lat`/`geo_lon` to match source; the geometry trigger was updated accordingly and re-tested), `mp_name`/`house` (denormalized snapshot copies, since the source carries them directly on every work row for ML convenience — `mp.name` stays authoritative).

`letter_no` is empty on 3,958/111,525 rows (3.5%) — normal nullable-field rate, not a concern.

---

## What was tested (not just eyeballed)

- `schema.sql` run fresh against a clean Postgres 16 + PostGIS instance — clean exit, all tables/indexes/triggers/view created.
- Re-run a second time without dropping the database — fully idempotent (every `NOTICE: ... already exists, skipping`, zero errors).
- `schema_adminer.sql` run against a separate fresh database — identical result, confirming it's safe for Adminer's plain-SQL runner.
- Inserted a real-shaped row through the full pipeline: `sanction_date` NULL (simulating the "NA"→NULL loader normalization), multi-label `ground_truth_anomaly_raw` split into `work_ground_truth_label` rows and joined back, blacklisted-contractor flags, lat/lon → verified the `geom` trigger populates a correct `GEOGRAPHY` point.
- Verified `work_latest_status` now reports `total_paid` from `work.expenditure` (₹2,473,517 in the test row) rather than from the synthetic payment ledger (₹5,596,983.55, kept separately as `total_payment_ledger_amt`) — confirming §6's fix actually takes effect.
- Verified the new `CHECK` constraints: an invalid `ground_truth_severity` and an invalid `data_source` are both correctly rejected; the *valid* rare `LOW` severity is correctly accepted; an arbitrary real-world `status` string (`'Work partially Completed'`) is correctly accepted since that column is no longer constrained.

## Update (found while running the actual loader against the full mp_summary file)

Two of the 776 `mp_summary` rows (`mp_id` `736719807abd` and `bbbe49aee42c`) have blank `mp_name` **and** `state`, and both share an identical, implausible `entitlement_amt` of ~₹33.6 billion — almost certainly leftover artifacts from the source pipeline, not real MPs. This is separate from the 232 Rajya Sabha rows with no `constituency`, which is correct data (Rajya Sabha represents states, not constituencies) and not a bug.

These 2 rows can't simply be dropped: 10 real works and 22 real payments have `mp_id` set to one of them (checked against the full files), so removing the `mp` row would orphan otherwise-real transactional data. `load_master_dataset.py` keeps both rows with an obvious placeholder identity (`UNKNOWN_MP (<mp_id>) — see load_master_dataset.py data-quality note` / `UNKNOWN — DATA QUALITY ISSUE`) instead — satisfies the `NOT NULL` constraint (correctly enforced for the other 774 real rows) without pretending it's a real MP, and keeps the 10+22 referencing rows loadable and traceable back to a known bad identity. Confirmed via a full test load (Postgres, with the actual referencing rows included in the test sample): zero orphaned foreign keys, idempotent on re-run.

## Not yet done (flagged, not silently skipped)

- **`loader.py` does not yet ingest the three `principal_master_*.json` files.** The current loader targets the legacy Allocated-Limit CSV/TXT shape. Loading the master dataset needs a new code path (mostly straightforward now that `work`/`payment` mirror the source column-for-column) plus the `mp_id` reconciliation from §9 and the `NA`→NULL / label-splitting normalization from §4/§5. This wasn't asked for this round — flagging it as the natural next step.
- The `mp_id` hash algorithm itself was not reverse-engineered (tried and failed on every plausible input); the recommendation in §9 works without needing it, but if anyone on the team knows the generator script, confirming it would remove the fuzzy-match step entirely.
