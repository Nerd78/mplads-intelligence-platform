-- ============================================================================
-- MPLADS AI Anomaly Detection - PostgreSQL schema
-- REV 5 - dropped the PostGIS dependency entirely (REV 3/4 required it).
--         `CREATE EXTENSION postgis` fails on any host where the package is
--         not installed server-side, and that is not fixable from SQL. Worse,
--         the failure was silent-ish: the `geom` column never got created but
--         the trg_work_set_geom trigger DID (plpgsql bodies are not validated
--         at creation), leaving a table that rejected every INSERT.
--
--         Nothing in the loader, the API or the detection engine calls a
--         PostGIS function. `latitude`/`longitude` stay as plain columns, the
--         geo routes aggregate by state name, and geo-anomaly detection runs
--         in Python/pandas - the same approach schema_sqlite.sql already
--         took. To add PostGIS back on a host that supports it: re-add
--         `CREATE EXTENSION postgis`, a `geom GEOGRAPHY(Point, 4326)` column
--         on `work`, a GIST index over it, and a BEFORE INSERT/UPDATE trigger
--         populating it from latitude/longitude.
--
--         Existing databases built from REV 3 must run
--         migrations/001_drop_orphan_geom_trigger.sql to clear the trigger.
--
-- REV 3 - revised against the real master dataset delivered by the team
--         (principal_master_works.json / _payments.json / _mp_summary.json,
--          111,525 / 12,040 / 776 rows, verified 2026-09-09).
--
-- What changed vs. REV 2 (the version already committed to the repo) and why
-- is written up in full in the gap-analysis doc delivered alongside this
-- file. Short version:
--   * `data_source` (WEB_SCRAPED_REAL / SYNTHETIC_BENCHMARK) added - it did
--     not exist in REV 2 at all, and every downstream query that mixes real
--     and synthetic rows needs to filter on it.
--   * The old `status` CHECK constraint listed 5 made-up values. Real data
--     uses a different, larger vocabulary (e.g. "Work partially Completed",
--     "Pending for Sanction", "NA"), so the CHECK is dropped - status is
--     free TEXT, indexed, documented instead of constrained.
--   * `work` and `payment` gain every ML feature/benchmark/ground-truth
--     column the master dataset ships, so the tables can be loaded from it
--     directly (column-for-column) instead of needing a lossy transform.
--   * `ground_truth_anomaly` is multi-valued (pipe-delimited, up to 3 labels
--     per row) - modeled as a proper child table, not a single TEXT column,
--     so "which works are flagged DUPLICATE_WORK" is a plain join/filter
--     instead of a LIKE/string-split query.
--   * New `mp_metrics_snapshot` table for the MP-level aggregate/derived
--     columns (composite_risk_score, utilisation_rate_pct, etc.) - these are
--     a point-in-time computed snapshot from the team's pipeline, not raw
--     facts, so they get their own table (with computed_at) rather than
--     living on `mp` itself and silently going stale.
--   * `vendor` gets canonical `is_blacklisted`/`blacklisted_reason` columns
--     (100% consistent across works.json and payments.json - verified by
--     cross-checking every blacklisted vendor_id in both files) in addition
--     to the per-row snapshot flags kept on `work`/`payment` for ML fidelity.
--   * The old speculative `dq_missing_*` flags on `work` are dropped - they
--     had no defined computation logic and the master dataset's verified
--     ground-truth columns supersede them.
--   * `work_latest_status` view no longer treats SUM(payment.amount) as the
--     authoritative "amount paid" for every work - the payments file is
--     100% synthetic (0 real-money rows), so for WEB_SCRAPED_REAL works
--     `work.expenditure` is the only real figure and is now what the view
--     uses. The payment-ledger total is kept as a separate, clearly-labeled
--     column so it isn't mistaken for real disbursement data.
--
-- HOW TO RUN: `psql -U postgres -f schema.sql` (creates the `mplads` db if
-- missing, then builds everything inside it). Idempotent - every statement
-- uses IF NOT EXISTS / DROP...IF EXISTS / CREATE OR REPLACE, so re-running
-- after a future revision won't wipe data.
--
-- For Adminer or any other plain-SQL runner that doesn't understand \gexec
-- and \c, use schema_adminer.sql instead - same file from CREATE EXTENSION
-- onward, with just the two psql-only bootstrap lines removed.
-- ============================================================================

SELECT 'CREATE DATABASE mplads'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'mplads')\gexec

\c mplads

-- ---------------------------------------------------------------------
-- Provenance: every load (scrape run, manual XLS/CSV import, or the
-- teammate's master-dataset export) is one batch.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS source_batch (
    batch_id        SERIAL PRIMARY KEY,
    source_type     TEXT NOT NULL CHECK (source_type IN ('api_scrape', 'manual_export', 'synthetic', 'master_dataset')),
    source_detail   TEXT,               -- e.g. filename, or endpoint+combo used
    loaded_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    loaded_by       TEXT,               -- teammate/user who ran the load
    row_count       INTEGER
);

-- ---------------------------------------------------------------------
-- Reference dimensions
-- ---------------------------------------------------------------------

-- MP identity/reference table. mp_id is a TEXT key deliberately agnostic of
-- how it was generated: the master dataset's principal_master_mp_summary.json
-- (776 rows) already assigns every MP a stable hashed mp_id, and that is now
-- the dominant identifier space (111,525 work rows + 12,040 payment rows key
-- off it with 100% referential match, verified). The legacy "Allocated
-- Limit" scrape (543 rows) used a different, name+constituency-derived
-- mp_id - those two schemes do NOT produce matching hashes for the same MP
-- (checked directly, no match under any tried hash/normalization). The
-- recommended reconciliation (a loader-level job, not a schema concern) is:
-- treat principal_master_mp_summary.json as authoritative for mp_id, and
-- when loading the legacy Allocated-Limit files, fuzzy-match each row on
-- (name, constituency) against this table and attach allocated_amt/tenure/
-- sno/house_code to the MATCHED row instead of minting a new id.
CREATE TABLE IF NOT EXISTS mp (
    mp_id           TEXT PRIMARY KEY,     -- master dataset's hashed id where available; see note above
    sno             INTEGER,              -- legacy Allocated-Limit tile's own "Sno" - row order only, not stable
    name            TEXT NOT NULL,        -- normalized MP name
    name_raw        TEXT,                 -- MP name exactly as the source gave it, untrimmed
    house_code      TEXT,                 -- legacy raw HOUSE_OF_PARLIAMENT value ("1" or "2"), if known
    house           TEXT CHECK (house IN ('Lok Sabha', 'Rajya Sabha')),
    state           TEXT NOT NULL,
    constituency    TEXT,
    tenure          TEXT,                 -- e.g. "18th Lok Sabha" (legacy field)
    tenure_start    DATE,
    tenure_end      DATE,
    allocated_amt   NUMERIC(16,2),        -- legacy Allocated-Limit scrape's entitlement figure
    entitlement_amt NUMERIC(16,2),        -- master mp_summary's entitlement figure (may differ from allocated_amt -
                                           -- both kept until the team decides which pipeline is authoritative)
    batch_id        INTEGER REFERENCES source_batch(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_state ON mp(state);

CREATE TABLE IF NOT EXISTS agency (
    agency_id       TEXT PRIMARY KEY,     -- normalized name+district hash (no official agency ID exists in source)
    name            TEXT NOT NULL,
    name_raw        TEXT,                 -- original unnormalized string, kept for audit
    agency_type     TEXT,                 -- PWD / Municipal / NGO / Panchayat / other
    district        TEXT,
    state           TEXT,
    batch_id        INTEGER REFERENCES source_batch(batch_id)
);

-- Vendor identifiers in the master dataset (contractor_vendor_id in works,
-- vendor_id in payments) are ALREADY clean, consistent short codes like
-- "Vendor_161" - unlike implementing_agency, they do not need fuzzy entity
-- resolution; equality is enough.
CREATE TABLE IF NOT EXISTS vendor (
    vendor_id           TEXT PRIMARY KEY,     -- e.g. "Vendor_161" - used as-is from source, no resolution needed
    name                TEXT,                 -- display name, e.g. "M/s Sunrise Infrastructure (Vendor_161)"
    name_raw            TEXT,
    pan_hash            TEXT,                 -- hashed PAN/registration no. if ever available; never store raw PAN
    -- Canonical blacklist status: verified 100% consistent for every vendor_id
    -- across both works.json (contractor side) and payments.json (payee side).
    is_blacklisted      BOOLEAN NOT NULL DEFAULT FALSE,
    blacklisted_reason  TEXT,
    batch_id            INTEGER REFERENCES source_batch(batch_id)
);

-- ---------------------------------------------------------------------
-- Central fact table: works / project recommendations.
-- Columns are named to match principal_master_works.json 1:1 wherever
-- possible, so the master dataset can be loaded with a near-direct mapping.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS work (
    work_id                 TEXT PRIMARY KEY,   -- "WRK_REAL_<n>" for real rows, UUID for synthetic rows
    data_source             TEXT NOT NULL CHECK (data_source IN ('WEB_SCRAPED_REAL', 'SYNTHETIC_BENCHMARK')),

    mp_id                   TEXT REFERENCES mp(mp_id),
    mp_name                 TEXT,               -- denormalized snapshot from source; mp.name is authoritative
    house                   TEXT,
    state                   TEXT,
    district                TEXT,
    constituency            TEXT,
    block                   TEXT,
    village_or_ward         TEXT,
    latitude                DOUBLE PRECISION,
    longitude               DOUBLE PRECISION,

    work_description        TEXT,
    work_category           TEXT,

    implementing_agency     TEXT,               -- raw free text, 769 distinct values in current data - needs
                                                 -- fuzzy resolution (see agency_id)
    agency_id               TEXT REFERENCES agency(agency_id),

    contractor_vendor_id    TEXT,               -- raw source label, e.g. "Vendor_161"
    vendor_id               TEXT REFERENCES vendor(vendor_id),  -- == contractor_vendor_id, direct match
    contractor_name         TEXT,

    -- Per-work snapshot of blacklist status at award time (kept for ML
    -- feature fidelity even though vendor.is_blacklisted is now canonical).
    is_contractor_blacklisted          BOOLEAN NOT NULL DEFAULT FALSE,
    blacklisted_reason                 TEXT,
    is_blacklisted_contractor_anomaly  BOOLEAN NOT NULL DEFAULT FALSE,

    estimated_cost           NUMERIC(16,2),
    sanctioned_amount        NUMERIC(16,2),
    expenditure              NUMERIC(16,2),      -- authoritative actual spend - see work_latest_status view
    physical_progress_percent  NUMERIC(6,2),
    financial_progress_percent NUMERIC(6,2),

    recommendation_date      DATE,
    sanction_date            DATE,               -- ~25% of real rows have no sanction yet ("Pending for Sanction");
                                                  -- loader must normalize the source's literal "NA" string to NULL
    expected_completion_date DATE,
    actual_completion_date   DATE,

    -- Free text, NOT constrained: real data alone has 9+ distinct status
    -- strings ("Work partially Completed", "Pending for Sanction", "NA",
    -- etc.) plus 2 more used only by synthetic rows ("Completed", "Ongoing").
    -- A CHECK here would just break the next load when a new value shows up.
    status                    TEXT,

    sanction_delay_days                     INTEGER,   -- NULL when not yet computable
    completion_delay_days                   INTEGER,
    cost_overrun_amount                     NUMERIC(16,2),
    cost_overrun_percent                    NUMERIC(10,4),
    progress_mismatch_gap                   NUMERIC(6,2),
    category_national_avg_duration_days     INTEGER,
    project_duration_days                   INTEGER,
    duration_variance_vs_national_avg_days  INTEGER,
    duration_to_national_avg_ratio          NUMERIC(10,4),
    is_exceeds_national_avg_duration        BOOLEAN NOT NULL DEFAULT FALSE,
    is_excess_duration_anomaly              BOOLEAN NOT NULL DEFAULT FALSE,

    letter_no                 TEXT,

    synthetic_record          BOOLEAN NOT NULL DEFAULT FALSE,
    synthetic_scenario        TEXT,               -- 'N/A' for real rows, else the injected scenario name

    -- ground_truth_anomaly is multi-valued in source (pipe-delimited, up to
    -- 3 labels observed, e.g. "AWARDED_TO_BLACKLISTED_CONTRACTOR|SANCTION_
    -- DELAY_EXCEEDS_90_DAYS"). Raw string kept here for fidelity/audit; use
    -- work_ground_truth_label below for queries ("which works are flagged
    -- DUPLICATE_WORK").
    ground_truth_anomaly_raw  TEXT,
    ground_truth_severity     TEXT CHECK (ground_truth_severity IN ('NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),

    batch_id                  INTEGER REFERENCES source_batch(batch_id),
    loaded_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_agency ON work(agency_id);
CREATE INDEX IF NOT EXISTS idx_work_vendor ON work(vendor_id);
CREATE INDEX IF NOT EXISTS idx_work_mp ON work(mp_id);
CREATE INDEX IF NOT EXISTS idx_work_status ON work(status);
CREATE INDEX IF NOT EXISTS idx_work_data_source ON work(data_source);
CREATE INDEX IF NOT EXISTS idx_work_severity ON work(ground_truth_severity);
CREATE INDEX IF NOT EXISTS idx_work_synthetic ON work(synthetic_record);

-- Multi-valued ground-truth anomaly labels for works, one row per label
-- (split from work.ground_truth_anomaly_raw on '|' at load time). 11
-- distinct atomic labels observed as of 2026-09-09 (NORMAL,
-- SANCTION_DELAY_EXCEEDS_90_DAYS, EXCESS_PROJECT_DURATION_VS_NATIONAL_AVG,
-- AWARDED_TO_BLACKLISTED_CONTRACTOR, DUPLICATE_WORK, DELAYED_WORK,
-- UNUSUAL_EXPENDITURE, COST_OVERRUN, AGENCY_ANOMALY, PROGRESS_MISMATCH,
-- GEOGRAPHIC_ANOMALY) - left as free TEXT rather than an enum since new
-- scenario labels are expected as the synthetic generator evolves.
CREATE TABLE IF NOT EXISTS work_ground_truth_label (
    work_id     TEXT NOT NULL REFERENCES work(work_id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    PRIMARY KEY (work_id, label)
);

CREATE INDEX IF NOT EXISTS idx_wgtl_label ON work_ground_truth_label(label);

-- ---------------------------------------------------------------------
-- Payments (many per work). NOTE: as of this dataset, 100% of payment rows
-- are synthetic_record = TRUE - there is currently zero real payment-ledger
-- data. Do not treat this table as covering real works; work.expenditure is
-- the only real spend figure available for WEB_SCRAPED_REAL works.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS payment (
    payment_id      TEXT PRIMARY KEY,
    work_id         TEXT NOT NULL REFERENCES work(work_id),
    mp_id           TEXT REFERENCES mp(mp_id),
    implementing_agency TEXT,
    payment_date    DATE,
    payment_amount  NUMERIC(16,2) NOT NULL,
    payment_type    TEXT,                       -- Cheque / Bank Transfer / ECS observed; not constrained
    vendor_id       TEXT REFERENCES vendor(vendor_id),

    is_vendor_blacklisted                  BOOLEAN NOT NULL DEFAULT FALSE,
    vendor_blacklisted_reason              TEXT,
    is_blacklisted_vendor_payment_anomaly  BOOLEAN NOT NULL DEFAULT FALSE,

    synthetic_record          BOOLEAN NOT NULL DEFAULT FALSE,
    synthetic_scenario        TEXT,
    ground_truth_anomaly_raw  TEXT,              -- same multi-valued/pipe-delimited convention as work

    batch_id        INTEGER REFERENCES source_batch(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_payment_work ON payment(work_id);
CREATE INDEX IF NOT EXISTS idx_payment_vendor ON payment(vendor_id);
CREATE INDEX IF NOT EXISTS idx_payment_mp ON payment(mp_id);

CREATE TABLE IF NOT EXISTS payment_ground_truth_label (
    payment_id  TEXT NOT NULL REFERENCES payment(payment_id) ON DELETE CASCADE,
    label       TEXT NOT NULL,
    PRIMARY KEY (payment_id, label)
);

CREATE INDEX IF NOT EXISTS idx_pgtl_label ON payment_ground_truth_label(label);

-- ---------------------------------------------------------------------
-- Progress updates (time series per work). Not populated by the current
-- master dataset (which only carries one physical_progress_percent snapshot
-- per work) - kept for when/if a teammate scrapes historical progress
-- entries from the portal.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS progress_update (
    update_id           TEXT PRIMARY KEY,
    work_id             TEXT NOT NULL REFERENCES work(work_id),
    update_date         DATE NOT NULL,
    pct_physical_progress NUMERIC(5,2) CHECK (pct_physical_progress BETWEEN 0 AND 100),
    photo_url           TEXT,
    remarks             TEXT,
    batch_id            INTEGER REFERENCES source_batch(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_work_date ON progress_update(work_id, update_date);

-- ---------------------------------------------------------------------
-- MP-level aggregate metrics - a point-in-time COMPUTED SNAPSHOT from the
-- team's feature pipeline (principal_master_mp_summary.json), not a raw
-- fact. Kept separate from `mp` (the identity/reference dimension) so a
-- refresh/recompute never has to touch the base MP registry, and so a
-- history of composite_risk_score etc. over time is possible later by
-- keeping old snapshot rows instead of overwriting them.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mp_metrics_snapshot (
    snapshot_id                         SERIAL PRIMARY KEY,
    mp_id                                TEXT NOT NULL REFERENCES mp(mp_id),

    scraped_works_recommended            INTEGER,
    total_works_count                    INTEGER,
    completed_works_count                INTEGER,
    ongoing_works_count                  INTEGER,

    total_recommended_amt                NUMERIC(16,2),
    total_sanctioned_amt                 NUMERIC(16,2),
    total_expenditure_amt                NUMERIC(16,2),
    unutilized_fund_amt                  NUMERIC(16,2),
    utilisation_rate_pct                 NUMERIC(8,2),   -- observed >100% in source (over-utilisation), not capped

    avg_sanction_delay_days              NUMERIC(10,2),
    avg_project_duration_days            NUMERIC(10,2),
    total_cost_overrun_amt               NUMERIC(16,2),

    blacklisted_contractor_works_count   INTEGER,
    blacklisted_contractor_funds_amount  NUMERIC(16,2),
    has_blacklisted_contractor_flag      BOOLEAN NOT NULL DEFAULT FALSE,

    anomaly_works_count                  INTEGER,
    excess_duration_works_count          INTEGER,
    anomaly_works_pct                    NUMERIC(6,2),

    composite_risk_score                 NUMERIC(6,2),   -- 0-100 unified risk rating

    computed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    batch_id             INTEGER REFERENCES source_batch(batch_id)
);

CREATE INDEX IF NOT EXISTS idx_mp_metrics_mp ON mp_metrics_snapshot(mp_id);
CREATE INDEX IF NOT EXISTS idx_mp_metrics_risk ON mp_metrics_snapshot(composite_risk_score);

-- ---------------------------------------------------------------------
-- Convenience view: latest known state of every work. total_paid now comes
-- from work.expenditure (the only figure that is real for WEB_SCRAPED_REAL
-- rows), NOT from SUM(payment.amount) - the payment ledger is 100%
-- synthetic today, so summing it would silently fabricate "amount paid" for
-- every real work. total_payment_ledger_amt is kept as a separate, clearly
-- labeled column so ledger-derived figures are never confused with it.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW work_latest_status AS
SELECT
    w.work_id,
    w.data_source,
    w.mp_id,
    w.agency_id,
    w.state,
    w.district,
    w.work_category,
    w.sanctioned_amount,
    w.status,
    w.sanction_date,
    w.actual_completion_date,
    w.expenditure AS total_paid,
    CASE WHEN w.sanctioned_amount > 0
         THEN ROUND(COALESCE(w.expenditure, 0) / w.sanctioned_amount * 100, 2)
         ELSE NULL END AS pct_paid,
    w.physical_progress_percent AS latest_pct_progress,
    COALESCE(led.total_payment_ledger_amt, 0) AS total_payment_ledger_amt,  -- synthetic-only coverage, see note above
    pr.pct_physical_progress AS latest_progress_update_pct,
    pr.update_date AS latest_update_date,
    (CURRENT_DATE - pr.update_date) AS days_since_last_update
FROM work w
LEFT JOIN (
    SELECT work_id, SUM(payment_amount) AS total_payment_ledger_amt
    FROM payment
    GROUP BY work_id
) led ON led.work_id = w.work_id
LEFT JOIN LATERAL (
    SELECT pct_physical_progress, update_date
    FROM progress_update pu
    WHERE pu.work_id = w.work_id
    ORDER BY update_date DESC
    LIMIT 1
) pr ON TRUE;

-- ============================================================================
-- Detection-engine output (added when the rule/ML risk-scoring pipeline was
-- built - backend/detection/). Purely additive: no existing table or column
-- above is touched, and none of this is loaded from principal_master_*.json -
-- it is COMPUTED by backend/detection/run_detection.py from columns already
-- in `work`. mp_metrics_snapshot.composite_risk_score (loaded verbatim from
-- principal_master_mp_summary.json) is a different, source-provided number
-- and is deliberately never overwritten by this pipeline; our own MP-level
-- aggregate lives in the separate mp_risk_score table below.
-- ============================================================================

-- One row per work, upserted on every detection run (ON CONFLICT (work_id) DO
-- UPDATE) rather than an append-only history like mp_metrics_snapshot: scores
-- are recomputed often during development and don't need version history yet.
CREATE TABLE IF NOT EXISTS work_risk_score (
    work_id           TEXT PRIMARY KEY REFERENCES work(work_id) ON DELETE CASCADE,
    rule_score        NUMERIC(6,2) NOT NULL,
    ml_score          NUMERIC(6,2) NOT NULL,
    composite_score   NUMERIC(6,2) NOT NULL,
    severity          TEXT NOT NULL CHECK (severity IN ('Low','Medium','High','Critical')),
    model_version     TEXT NOT NULL,
    computed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wrs_severity ON work_risk_score(severity);
CREATE INDEX IF NOT EXISTS idx_wrs_score ON work_risk_score(composite_score);
-- Serves "top N riskiest works" queries (command center / state / district /
-- MP high-risk tables) directly off the index instead of sorting at query time.
CREATE INDEX IF NOT EXISTS idx_wrs_score_desc ON work_risk_score(composite_score DESC, work_id);

-- Evidence behind each work's score: which rule(s) fired, or that the ML
-- model flagged it as a statistical outlier. Mirrors the work_ground_truth_label
-- pattern already established above. `detail` carries a short human-readable
-- description of the concrete signal (e.g. "Cost overrun 18.4%", "97th
-- percentile isolation-forest outlier") for the investigation drawer.
CREATE TABLE IF NOT EXISTS work_risk_flag (
    work_id     TEXT NOT NULL REFERENCES work(work_id) ON DELETE CASCADE,
    flag_label  TEXT NOT NULL,
    source      TEXT NOT NULL CHECK (source IN ('rule','ml_outlier')),
    detail      TEXT,
    PRIMARY KEY (work_id, flag_label, source)
);

CREATE INDEX IF NOT EXISTS idx_wrf_label ON work_risk_flag(flag_label);

-- MP-level aggregate of OUR OWN computed work_risk_score rows (kept separate
-- from mp_metrics_snapshot - see header note above). One row per MP, upserted
-- on every detection run.
CREATE TABLE IF NOT EXISTS mp_risk_score (
    mp_id                     TEXT PRIMARY KEY REFERENCES mp(mp_id) ON DELETE CASCADE,
    works_scored              INTEGER NOT NULL,
    avg_composite_score       NUMERIC(6,2) NOT NULL,
    high_risk_works_count     INTEGER NOT NULL,
    critical_risk_works_count INTEGER NOT NULL,
    aggregate_severity        TEXT NOT NULL CHECK (aggregate_severity IN ('Low','Medium','High','Critical')),
    computed_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mrs_score ON mp_risk_score(avg_composite_score DESC, mp_id);
