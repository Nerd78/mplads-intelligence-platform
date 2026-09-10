# Runbook — getting the platform running locally

End-to-end steps to go from a fresh clone to a populated dashboard, plus the
things that actually break on the way. Verified on Windows 11, PostgreSQL 18.4,
Node 22.12, Python 3.13.

## 0. Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| PostgreSQL | 18.4 | PostGIS **not** required — see step 2 |
| Node | 22.12 | frontend dev server |
| Python | 3.13 | backend, loader, detection engine |

## 1. Backend dependencies

```bash
cd backend
cp .env.example .env
pip install -r requirements.txt
```

Set `DATABASE_URL` in `backend/.env`. **If the password contains reserved URL
characters, percent-encode them** — an `@` in the password must be written
`%40`, otherwise psycopg2 reads everything before the last `@` as credentials
and fails with a confusing host error:

```
DATABASE_URL=postgresql://postgres:My%40Pass@localhost:5432/mplads
```

`backend/.env` is gitignored and must stay that way.

## 2. Database schema (without PostGIS)

```bash
psql -U postgres -h localhost -f schema.sql
```

`schema.sql` is idempotent, so re-running it is safe.

**PostGIS is optional and skipped in this setup.** Without the extension the
script reports two errors and continues:

```
ERROR:  extension "postgis" is not available
ERROR:  column "geom" does not exist
```

Both are expected. `work.geom` and its GIST index simply don't get created.
There is one catch worth knowing:

> The `trg_work_set_geom` trigger **is still created**, even though the `geom`
> column it writes to is not. Left in place it makes *every* insert into `work`
> fail. Drop it once, after applying the schema:
>
> ```bash
> psql -U postgres -d mplads -f migrations/001_drop_orphan_geom_trigger.sql
> ```

Nothing else depends on it: the geo API routes aggregate by state name, and
geo-anomaly detection runs in the Python layer off plain `latitude`/`longitude`
— the same tradeoff already documented in [LOCAL_DEV_SETUP.md](LOCAL_DEV_SETUP.md)
for the SQLite variant. Install PostGIS and re-run `schema.sql` if DB-side
spatial queries are ever needed.

## 3. Load the master dataset

The three `principal_master_*.json` files are not in git (the works file alone
is ~200MB). Point the loader at wherever they live:

```bash
cd backend
python load_master_dataset.py --data-dir /path/to/master_json
```

Expected result on the current dataset:

| Table | Rows |
|---|---:|
| `work` | 111,525 |
| `work_ground_truth_label` | 118,175 |
| `payment` | 12,040 |
| `payment_ground_truth_label` | 12,053 |
| `mp` / `mp_metrics_snapshot` | 776 |
| `vendor` | 200 |

## 4. Run the detection engine

```bash
cd backend/detection
python run_detection.py
```

> `detection/db.py` reads `DATABASE_URL` from the **environment only** — it
> never calls `load_dotenv()`, so `backend/.env` is not picked up automatically
> the way it is for the API. Export the variable first, or pass it inline:
>
> ```bash
> DATABASE_URL=$(grep '^DATABASE_URL=' ../.env | cut -d= -f2-) python run_detection.py
> ```

> Delete `model.joblib` first whenever the *rows* used for fitting change.
> `run_detection.py` only retrains automatically when the feature **count**
> differs, so a population change silently reuses the stale model.

Takes ~45s for 111k works. Writes `work_risk_score` (111,525),
`work_risk_flag` and `mp_risk_score` (776), then regenerates
`backend/reports/detection_evaluation.{md,json}`.

Severity split on the current dataset (v2): 72,825 Low / 37,382 Medium /
1,276 High / 42 Critical. 524 works with no financial figures are held out of
ML scoring and flagged `DATA_QUALITY_INCOMPLETE` — see
[DETECTION_CHANGELOG.md](DETECTION_CHANGELOG.md) for why.

## 5. Start the API

```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

`app/db.py` builds its pool lazily, so uvicorn starts even with no database —
`/` answers immediately while `/health` and the data routes 500. Use `/health`
as the real readiness check, not `/`.

## 6. Start the frontend

```bash
cd mplads-ai-pulse-main
cp .env.example .env      # VITE_API_BASE_URL, defaults to http://localhost:8000
npm install
npm run dev
```

Serves on **:8080** (Vite falls back to 8081+ if taken; the API's CORS rule
matches any localhost port, so that's fine).

> `react-simple-maps@3` declares peer React 16/17/18 and has no React 19
> build, so a plain `npm install` fails with `ERESOLVE`. The repo ships an
> `.npmrc` setting `legacy-peer-deps=true` so this resolves without extra
> flags.

## Verifying it all works

```bash
curl http://localhost:8000/health          # {"status":"ok"}
curl http://localhost:8000/stats/overview  # total_works: 111525
```

The dashboard fetches client-side, so server-rendered HTML shows empty states
until hydration — "No scored MPs yet" in `curl` output is normal and not a
symptom of a broken database.
