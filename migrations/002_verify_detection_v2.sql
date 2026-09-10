-- 002 - Verify the detection v2 re-score is in place. READ ONLY.
--
-- Run AFTER `python run_detection.py`. Two defects were fixed in v2 and both
-- are checkable from the data alone:
--
--   1. PROGRESS_MISMATCH thresholded work.progress_mismatch_gap, which is an
--      ABSOLUTE difference. It therefore fired on both directions at once and
--      described every hit as "financial progress leads physical" - the
--      reverse of the truth for 524 of the 582 works it flagged. The rule now
--      uses the signed gap, so only the fraud direction (money spent ahead of
--      work delivered) fires.
--
--   2. IsolationForest treated works with no financial figures as extreme
--      outliers (mean ML score 99.4 vs 49.8 for populated rows) because an
--      all-zero feature vector is unlike any populated row. That measures a
--      data-collection gap, not behavior. Those 524 works are now held out of
--      ML fitting and scoring, keep their rule score, and carry an explicit
--      DATA_QUALITY_INCOMPLETE flag.
--
-- Each query prints PASS or FAIL. Any FAIL means detection has not been
-- re-run against the current code.

\echo '--- 1. PROGRESS_MISMATCH fires only when financial leads physical ---'
SELECT
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL - ' || count(*) || ' wrong-direction flags; re-run run_detection.py' END
        AS progress_mismatch_direction
FROM work_risk_flag f
JOIN work w ON w.work_id = f.work_id
WHERE f.flag_label = 'PROGRESS_MISMATCH'
  AND COALESCE(w.financial_progress_percent, 0) <= COALESCE(w.physical_progress_percent, 0);

\echo '--- 2. Works with no financial figures are excluded from ML scoring ---'
SELECT
    CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL - ' || count(*) || ' empty-financial works still carry an ML score' END
        AS ml_holdout
FROM work w
JOIN work_risk_score r ON r.work_id = w.work_id
WHERE COALESCE(w.sanctioned_amount, 0) = 0
  AND COALESCE(w.expenditure, 0) = 0
  AND r.ml_score > 0;

\echo '--- 3. Those works are flagged rather than silently dropped ---'
SELECT
    CASE WHEN count(*) > 0 THEN 'PASS - ' || count(*) || ' flagged DATA_QUALITY_INCOMPLETE'
         ELSE 'FAIL - no DATA_QUALITY_INCOMPLETE flags written' END AS dq_flagged
FROM work_risk_flag
WHERE flag_label = 'DATA_QUALITY_INCOMPLETE';

\echo '--- Current severity distribution (expected after v2: 42 Critical / 1,276 High) ---'
SELECT severity, count(*) AS works
FROM work_risk_score
GROUP BY severity
ORDER BY CASE severity WHEN 'Critical' THEN 1 WHEN 'High' THEN 2 WHEN 'Medium' THEN 3 ELSE 4 END;
