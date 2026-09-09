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

## Running locally

**Database**: PostgreSQL with `schema.sql` applied (see that file's header
for setup notes).

**Detection engine + API**:
```bash
cd backend
cp .env.example .env   # set DATABASE_URL
pip install -r requirements.txt
python load_master_dataset.py       # loads principal_master_*.json (see Data below)
python detection/run_detection.py   # scores every work, writes the risk tables
uvicorn app.main:app --reload --port 8000
```

**Frontend**:
```bash
cd mplads-ai-pulse-main
cp .env.example .env   # VITE_API_BASE_URL, defaults to http://localhost:8000
npm install
npm run dev
```

## Data

The raw/derived MPLADS datasets (`MPLADS.csv`, `principal_master_*.{csv,json}`,
`mplads-scraper/data/`) are not committed here — they're large (the full
works dataset alone is ~200MB as JSON) and reproducible via the scraper.
