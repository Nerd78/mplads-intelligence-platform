-- 001 — Remove the orphaned geom trigger left behind by REV 3 of schema.sql.
--
-- ONLY needed for a database built from schema.sql REV 3 or earlier. REV 5
-- dropped PostGIS entirely, so a database created from the current schema
-- never has this trigger and this migration is a harmless no-op there.
--
-- REV 3 built work.geom, its GIST index and a trg_work_set_geom trigger
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
-- (the same tradeoff the SQLite variant of the schema already took).
--
-- Always safe to run: the IF EXISTS guards make it a no-op on any database
-- that never had the trigger, which includes every database built from
-- REV 5. REV 5 does not recreate it, so re-running schema.sql afterwards
-- will not bring it back.

DROP TRIGGER IF EXISTS trg_work_set_geom ON work;
DROP FUNCTION IF EXISTS work_set_geom();

-- Verify: expects 0 rows.
-- SELECT tgname FROM pg_trigger WHERE NOT tgisinternal AND tgname = 'trg_work_set_geom';
