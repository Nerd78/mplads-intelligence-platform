# Detection engine changelog

Changes to scoring behaviour, and the evidence behind each one. Anything here
means the risk tables must be regenerated - see
[migrations/README.md](../migrations/README.md).

---

## v2 - 2026-09-10

Two defects found by asking a question the dashboard made obvious: *why is a
work Critical when its expenditure is ₹0?*

The honest part of the answer is that risk does not depend on expenditure. The
example work fired `AWARDED_TO_BLACKLISTED_CONTRACTOR` and
`EXCESS_PROJECT_DURATION_VS_NATIONAL_AVG`, neither of which needs money to have
been spent. Pulling on it surfaced two things that were genuinely wrong.

### 1. PROGRESS_MISMATCH fired on the wrong direction

`rule_progress_mismatch` thresholded `work.progress_mismatch_gap`. That column
is an **absolute** difference - verified across all 111,525 rows, where it
equals `abs(financial − physical)` every time. Thresholding it fires on both
directions at once, and every hit was described as:

> "Financial progress leads physical progress by X points"

which was the reverse of the truth for most of them:

| Direction | Works flagged (v1) |
|---|---:|
| Physical leads financial - work delivered, payment not recorded | **524** |
| Financial leads physical - money spent ahead of delivery | 58 |

The direction is the whole signal. Paying ahead of delivery is the fraud
pattern; delivering ahead of payment is usually an unpaid contractor or
lagging paperwork. The rule now uses the signed
`progress_gap_financial_minus_physical` feature, which already existed for the
ML layer.

**Effect:** 582 → 58 flags. Benchmark precision/recall/F1 for
PROGRESS_MISMATCH stayed at **1.000 / 1.000 / 1.000** - every labeled
benchmark case was already in the correct direction, so removing the 524 was
pure false-positive elimination with no loss of true positives.

### 2. IsolationForest scored missing data as fraud

524 works (0.49%) have no financial figures at all - sanctioned amount *and*
expenditure both zero. With every money column at zero their feature vector is
unlike any populated row, so the model ranked them as extreme outliers:

| | Works | Mean ML score | Mean composite |
|---|---:|---:|---:|
| All-zero financials (v1) | 524 | **99.4** | 55.4 |
| Populated financials (v1) | 111,001 | 49.8 | 23.8 |

That measures a data-collection gap, not behaviour - a classic failure mode
where absent data looks anomalous in feature space.

These works are now held out of ML fitting and scoring. They keep their rule
score (a blacklisted contractor is still a blacklisted contractor), get
`ml_score = 0`, and carry an explicit `DATA_QUALITY_INCOMPLETE` flag so they
stay visible as a data problem rather than being silently dropped or silently
inflated into the investigation queue.

### Net effect on severity

| Severity | v1 | v2 | Δ |
|---|---:|---:|---:|
| Critical | 50 | **42** | −8 |
| High | 1,343 | **1,276** | −67 |
| Medium | 37,206 | 37,382 | +176 |
| Low | 72,926 | 72,825 | −101 |

Critical works with ₹0 expenditure: **7 → 0**. Mean composite for
empty-financial records: 55.4 → 4.4.

The overall benchmark figures (precision 0.207, recall 0.926, F1 0.339) are
unchanged - the removed flags were on real records, which have no independent
ground truth, so they never entered the benchmark either way. That is exactly
why the fix had to be justified from the data rather than from a metric
moving.

### Upgrading

```bash
cd backend/detection
rm -f model.joblib     # the fitting population changed, so force a retrain
DATABASE_URL=$(grep '^DATABASE_URL=' ../.env | cut -d= -f2-) python run_detection.py
psql -U postgres -d mplads -f ../../migrations/002_verify_detection_v2.sql
```

`run_detection.py` only retrains automatically when the feature *count*
changes. This change altered which *rows* are fitted, so the stale model must
be deleted by hand.

---

## v1 - initial

Rule engine (10 rules) + Isolation Forest, combined into a documented 0–100
composite. See [`backend/reports/detection_evaluation.md`](../backend/reports/detection_evaluation.md)
after a run.
