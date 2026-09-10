-- 001 — Remove the orphaned geom trigger on installs without PostGIS.
--
-- schema.sql builds work.geom, its GIST index and a trg_work_set_geom trigger
-- that keeps geom in sync with latitude/longitude. When PostGIS is not
-- available, `CREATE EXTENSION postgis` fails and the geom column is never
-- created — but the trigger and its function ARE, because they are plain
-- plpgsql and their body is not validated at creation time.
--
-- The result is a table that rejects every insert:
--
--     ERROR:  record "new" has no field "geom"
--
-- Nothing else depends on it. The geo API routes aggregate by state name, and
-- geo-anomaly detection runs in the Python layer off plain latitude/longitude
-- (see docs/LOCAL_DEV_SETUP.md, which documents the same tradeoff for the
-- SQLite path).
--
-- Safe to run when PostGIS *is* installed: the IF EXISTS guards make it a
-- no-op there, though in that case you want the trigger, so run schema.sql
-- again afterwards to recreate it.

DROP TRIGGER IF EXISTS trg_work_set_geom ON work;
DROP FUNCTION IF EXISTS work_set_geom();

-- Verify: expects 0 rows.
-- SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_work_set_geom';
