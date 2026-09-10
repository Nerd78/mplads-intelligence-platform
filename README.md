# MPLADS Intelligence Platform

An AI-powered anomaly detection and investigation platform for the MPLADS
scheme (MP Local Area Development Scheme), built for Smart India Hackathon
2026 (Problem Statement 26102).

It combines a real data-collection pipeline against the eSAKSHI portal, a
rule + machine-learning detection engine validated against a labeled
synthetic benchmark, a FastAPI backend, and a role-based investigation
dashboard over 111,525 works.

---

## Run it

Two terminals. The database must already be set up — see
[First-time setup](#first-time-setup) if this is a fresh clone.

### Terminal 1 — backend (port 8000)

```bash
cd backend
python -m uvicorn app.main:app --reload --port 8000
```

> Use `python -m uvicorn`, not bare `uvicorn`. Installing via
> `pip install -r requirements.txt` does not reliably put the `uvicorn`
> executable on PATH on Windows, and the bare command fails with
> "command not found".

### Terminal 2 — frontend (port 8080)

```bash
cd mplads-ai-pulse-main
npm run dev
```

Then open **<http://localhost:8080>**.

Vite falls back to 8081+ if 8080 is taken. The API's CORS rule matches any
localhost port, so that is fine — but the frontend reads the API URL from
`VITE_API_BASE_URL`, so the *backend* port is not interchangeable.

### Check it came up

```bash
curl http://localhost:8000/health          # {"status":"ok"}
curl http://localhost:8000/stats/overview  # total_works: 111525
```

Use `/health` as the readiness check, not `/`. The connection pool is built
lazily, so `/` answers even when the database is unreachable.

---

## First-time setup

Full step-by-step instructions, including the failure modes worth knowing
about, are in **[docs/RUNBOOK.md](docs/RUNBOOK.md)**. The short version:

### 1. Backend dependencies and connection string

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
```

Set `DATABASE_URL` in `backend/.env`. **Percent-encode reserved characters in
the password** — an `@` must be written `%40`, or psycopg2 reads everything
before the last `@` as credentials and fails with a confusing host error:

```ini
DATABASE_URL=postgresql://postgres:My%40Pass@localhost:5432/mplads
```

`backend/.env` is gitignored and must stay that way.

### 2. Schema

```bash
psql -U postgres -h localhost -f schema.sql
```

Idempotent, so re-running is safe. **PostGIS is not required** as of REV 5 —
there is no `geom` column, GIST index or sync trigger. If your database was
built from REV 3, run `migrations/001_drop_orphan_geom_trigger.sql` once, or
every insert into `work` will fail.

### 3. Load the data

The three `principal_master_*.json` files are not in git (the works file alone
is ~200MB). Point the loader at wherever they live:

```bash
cd backend
python load_master_dataset.py --data-dir /path/to/master_json
```

Loads 111,525 works, 12,040 payments, 776 MPs, 200 vendors and their
ground-truth labels.

### 4. Score everything

```bash
cd backend/detection
DATABASE_URL=$(grep '^DATABASE_URL=' ../.env | cut -d= -f2-) python run_detection.py
```

PowerShell:

```powershell
cd backend\detection
$env:DATABASE_URL = (Select-String '^DATABASE_URL=' ..\.env).Line -replace '^DATABASE_URL=',''
python run_detection.py
```

> Two things bite here:
>
> - `detection/db.py` reads `DATABASE_URL` from the **environment only** — it
>   never calls `load_dotenv()`, so `backend/.env` is not picked up the way it
>   is for the API. Pass it explicitly, as above.
> - Delete `model.joblib` first whenever the *rows* used for fitting change.
>   `run_detection.py` only retrains automatically when the feature **count**
>   differs, so a population change silently reuses the stale model.

Takes ~45s. Current output: **72,825 Low / 37,382 Medium / 1,276 High /
42 Critical**, plus 524 works held out of ML scoring and flagged
`DATA_QUALITY_INCOMPLETE` — see
[DETECTION_CHANGELOG.md](docs/DETECTION_CHANGELOG.md) for why.

### 5. Frontend dependencies

```bash
cd mplads-ai-pulse-main
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:8000
npm install            # .npmrc sets legacy-peer-deps for react-simple-maps@3
```

---

## Already have the database? Pulling this branch

`schema.sql` is for a fresh database. If you already have one, follow
**[migrations/README.md](migrations/README.md)** — in short: apply the numbered
SQL files, then **re-run the detection engine**, because the risk tables are
derived output and are regenerated rather than migrated.

---

## Structure

- **`mplads-scraper/`** — scraper for the real eSAKSHI REST API (works,
  payments, MP allocation data) plus fund-analysis utilities.
- **`schema.sql`** / **`schema_adminer.sql`** — PostgreSQL schema: works,
  payments, MPs, vendors, ground-truth labels, and the detection engine's
  `work_risk_score` / `work_risk_flag` / `mp_risk_score` tables.
  `schema_adminer.sql` is the same file with the psql-only `\gexec` / `\c`
  bootstrap lines removed, for Adminer and other plain-SQL runners.
- **`backend/detection/`** — the detection engine: a vectorized rule engine
  (10 rules, one per anomaly type) plus an unsupervised Isolation Forest,
  combined into a documented 0–100 composite risk score. Evaluated against
  the dataset's labeled `SYNTHETIC_BENCHMARK` records (the only subset with
  genuine, independently injected ground truth) — see
  `backend/reports/detection_evaluation.md` after a run.
- **`backend/app/`** — FastAPI backend serving works, payments, MPs, alerts,
  geospatial aggregates, and model evaluation results.
- **`mplads-ai-pulse-main/`** — the frontend: a TanStack Start + React 19 +
  Vite dashboard. Routes: Command Center, National / State / District / MP
  Intelligence, Risk Queue, Works, Payments, Risk Map, Model Evaluation, and
  the per-work Project Investigation case file.
- **`migrations/`** — ordered, idempotent SQL applied on top of `schema.sql`,
  plus [the procedure to run after pulling](migrations/README.md).
- **`docs/dataset-schema/`** — the data dictionary and JSON Schema contracts
  for the three `principal_master_*` files. The datasets themselves are not
  committed, so this is the spec to build or validate them against.
- **`docs/`** — [RUNBOOK.md](docs/RUNBOOK.md) (setup, end to end),
  [DETECTION_CHANGELOG.md](docs/DETECTION_CHANGELOG.md) (scoring changes and
  the evidence for them), [UI_DESIGN_SYSTEM.md](docs/UI_DESIGN_SYSTEM.md)
  (design rules and the reasoning behind them).

## Honest limits

The platform is explicit about what its numbers do and do not prove:

- Independent ground truth exists **only** for the 3,958
  `SYNTHETIC_BENCHMARK` records, where 8 fraud scenarios were deliberately
  injected. Precision/recall/F1 on that subset is a real evaluation.
- The three labels on the 107,567 real records are themselves thresholds
  already computed into the source data, so matching them is a **consistency
  check, not independent validation**. The Model Evaluation page says so on
  screen rather than only in the docs.
- A flag is a signal to investigate, not a finding of fraud. Every flagged
  work shows the specific rule and value that fired it.

## Data

The raw/derived MPLADS datasets (`MPLADS.csv`, `principal_master_*.{csv,json}`,
`mplads-scraper/data/`) are not committed here — they're large (the full
works dataset alone is ~200MB as JSON) and reproducible via the scraper.
