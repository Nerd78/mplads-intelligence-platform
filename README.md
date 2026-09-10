# MPLADS Intelligence Platform

An AI-powered anomaly detection and investigation platform for the MPLADS
scheme (MP Local Area Development Scheme), built for Smart India Hackathon
2026 (Problem Statement 26102).

It combines a real data-collection pipeline against the eSAKSHI portal, a
rule + machine-learning detection engine validated against a labeled
synthetic benchmark, a FastAPI backend, and a role-based investigation
dashboard.

## Structure

- **`mplads-scraper/`** — scraper for the real eSAKSHI REST API (works,
  payments, MP allocation data) plus fund-analysis utilities.
- **`schema.sql`** / **`schema_adminer.sql`** — PostgreSQL schema: works,
  payments, MPs, vendors, ground-truth labels, and the detection engine's
  `work_risk_score` / `work_risk_flag` / `mp_risk_score` tables.
- **`backend/detection/`** — the detection engine: a vectorized rule engine
  (10 rules, one per anomaly type) plus an unsupervised Isolation Forest,
  combined into a documented 0–100 composite risk score. Evaluated against
  the dataset's labeled `SYNTHETIC_BENCHMARK` records (the only subset with
  genuine, independently injected ground truth) — see
  `backend/reports/detection_evaluation.md` after a run.
- **`backend/app/`** — FastAPI backend serving works, payments, MPs, alerts,
  geospatial aggregates, and model evaluation results.
- **`mplads-ai-pulse-main/`** — the frontend: a TanStack Start + React 19 +
  shadcn/ui dashboard (Command Center, National/State/District/MP
  Intelligence, Risk Queue, Works, Payments, Risk Map, Model Evaluation).
- **`migrations/`** — ordered, idempotent SQL applied on top of `schema.sql`,
  plus [the procedure to run after pulling](migrations/README.md).
- **`docs/dataset-schema/`** — the data dictionary and JSON Schema contracts
  for the three `principal_master_*` files. The datasets themselves are not
  committed, so this is the spec to build or validate them against.
- **`docs/`** — [RUNBOOK.md](docs/RUNBOOK.md) (setup, end to end),
  [DETECTION_CHANGELOG.md](docs/DETECTION_CHANGELOG.md) (scoring changes and
  the evidence for them), [UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md)
  (design rules and the reasoning behind them),
  [DB_GAP_ANALYSIS.md](docs/DB_GAP_ANALYSIS.md),
  [LOCAL_DEV_SETUP.md](docs/LOCAL_DEV_SETUP.md) (SQLite dev path).

## Already have the database? Pulling this branch

`schema.sql` is for a fresh database. If you already have one, follow
**[migrations/README.md](migrations/README.md)** — in short: apply the numbered
SQL files, then **re-run the detection engine**, because the risk tables are
derived output and are regenerated rather than migrated.

## Running locally

Full step-by-step instructions, including the failure modes worth knowing
about, are in **[docs/RUNBOOK.md](docs/RUNBOOK.md)**. The short version:

**Database**: PostgreSQL with `schema.sql` applied (see that file's header for
setup notes). PostGIS is **not** required as of REV 5. If your database was
built from REV 3, run `migrations/001_drop_orphan_geom_trigger.sql` once —
see the runbook.

**Detection engine + API**:

```bash
cd backend
cp .env.example .env   # set DATABASE_URL (percent-encode '@' in the password as %40)
pip install -r requirements.txt
python load_master_dataset.py --data-dir /path/to/master_json

# run_detection reads DATABASE_URL from the environment, not backend/.env
cd detection
DATABASE_URL=$(grep '^DATABASE_URL=' ../.env | cut -d= -f2-) python run_detection.py

cd .. && uvicorn app.main:app --reload --port 8000
```

**Frontend**:

```bash
cd mplads-ai-pulse-main
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:8000
npm install            # .npmrc sets legacy-peer-deps for react-simple-maps@3
npm run dev            # serves on :8080
```

Check readiness with `curl localhost:8000/health` — `/` answers even with no
database, because the connection pool is built lazily.

## Data

The raw/derived MPLADS datasets (`MPLADS.csv`, `principal_master_*.{csv,json}`,
`mplads-scraper/data/`) are not committed here — they're large (the full
works dataset alone is ~200MB as JSON) and reproducible via the scraper.
