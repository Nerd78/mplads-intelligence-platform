# Local dev on SQLite, deploy on Postgres — how it works

**Short answer: yes, this works, and it's now actually wired up and tested** — not just "should work in theory." A teammate without Postgres installed can develop and test the whole loader against a local SQLite file; when the project is hosted, the team switches to the Postgres connection string and nothing else changes.

## What to do

Anyone without Postgres installed builds a local dev database from `schema_sqlite.sql`:

```bash
python3 -c "import sqlite3; sqlite3.connect('mplads_dev.db').executescript(open('schema_sqlite.sql').read())"
```

Then runs `loader.py` exactly as before, just pointed at that file:

```bash
python loader.py --file "Allocated Limit for Honble MPs.csv" --table mp \
    --db sqlite:///mplads_dev.db --source-type manual_export
```

Whoever has the hosted Postgres instance runs the same command with `--db postgresql://user:pass@host/mplads` (built from `schema.sql`/`schema_adminer.sql`) instead. Same file, same code, same command shape — only the URL changes.

## What actually had to change to make that true

`loader.py`'s upsert logic used to hardcode `sqlalchemy.dialects.postgresql.insert(...)`, which would have broken immediately against a SQLite engine. It now picks the right dialect's `insert()` off the engine at runtime (`_dialect_insert()`), and both dialects implement the exact same `.on_conflict_do_update(index_elements=..., set_=...)` call — verified directly, not assumed, so the rest of the upsert code needed zero other changes.

SQLite also does not enforce foreign keys by default on a fresh connection (confirmed: `PRAGMA foreign_keys` reads `0` out of the box) — an orphaned `work.mp_id`/`payment.work_id` would silently insert on SQLite while Postgres correctly rejects it. `loader.py`'s new `make_engine()` turns `PRAGMA foreign_keys = ON` on automatically for every `sqlite://` connection it opens, so both backends now reject the same bad data the same way. This was confirmed with a real test: the same orphaned insert was rejected through `make_engine()` and silently accepted through a plain `create_engine()` without the pragma — the fix is real, not cosmetic.

## What's genuinely different between the two files

`schema_sqlite.sql` mirrors `schema.sql` table-for-table, column-for-column, with these exceptions (all documented in `schema_sqlite.sql`'s own header comment too):

- No PostGIS. There's no `geom` column, no geo-sync trigger, no spatial (GIST) index in the SQLite version — SQLite has no built-in geography type. `latitude`/`longitude` (plain columns) are kept in both, which is enough for geo-anomaly detection done in the Python/ML layer. If the project later needs DB-side spatial queries at scale ("works within N km of point X" on a live dashboard), that's Postgres-only — one more reason production stays on Postgres.
- `SERIAL` → `INTEGER PRIMARY KEY AUTOINCREMENT`, `TIMESTAMPTZ` → `TEXT` (ISO-8601, UTC) — SQLite doesn't have either of the Postgres types.
- The `work_latest_status` view is written with `CREATE VIEW` (SQLite has no `CREATE OR REPLACE VIEW` — confirmed, it's a syntax error) and scalar subqueries instead of a `LATERAL` join (SQLite doesn't support `LATERAL`), but returns the same columns with the same meaning.
- SQLite doesn't enforce `NUMERIC(16,2)`'s precision/scale the way Postgres does — a bug that writes a string into a money column would error in Postgres and might silently "work" in SQLite. This is the main reason to still test against real Postgres before anything goes live, not treat SQLite as a full substitute for that check.

## Tested, not assumed

Ran the real `Allocated Limit for Honble MPs.csv` (543 real MPs) through `loader.py` unchanged into a fresh SQLite file and a fresh local Postgres+PostGIS instance, then diffed every row: **543/543 identical**, including the derived `mp_id` hash matching across both (proof the same code produces the same output regardless of backend). Re-ran both loads a second time — row counts stayed at 543 on both (idempotent upsert, not duplicated), while `source_batch` correctly recorded 2 separate load events on both, exactly as designed.

## What this does not change

`build_work_table()`/`build_agency_table()` in `loader.py` still target the pre-master-dataset column shape and don't yet populate the revised `work` table (`data_source`, `work_category`, ground-truth columns, etc. — see the gap-analysis doc). That's a separate, already-known task and applies identically regardless of which database backend you're using — it's not something the SQLite/Postgres question changes.
