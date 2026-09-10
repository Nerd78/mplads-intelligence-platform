"""Vectorized rule engine.

One function per ground-truth anomaly label (see docs/DB gap notes / the
plan doc for why these 8 labels specifically). Every rule operates on the
whole `enriched_df` frame at once (pandas boolean masks / groupby) -- no
per-row Python loops over the 111K+ works.

Each rule contributes:
  - a boolean mask (which works it flags)
  - a per-flagged-row `detail` string (concrete evidence for the
    investigation drawer)
  - a fixed point weight added to that work's rule_score

`run_rules()` combines all of them into one long "flags" DataFrame (mirrors
work_risk_flag's shape) plus a wide boolean frame (one column per label, used
by evaluate.py to compare against work_ground_truth_label) plus the summed
rule_score per work.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

# Point weights -- named constants, not buried magic numbers. Carried over
# from the client-side prototype (mplads-ai-pulse-main/src/lib/mplads-data.ts
# calculateRiskScore) which these rules replace as the single source of truth.
POINTS = {
    "AWARDED_TO_BLACKLISTED_CONTRACTOR": 35,
    "SANCTION_DELAY_EXCEEDS_90_DAYS": 10,
    "EXCESS_PROJECT_DURATION_VS_NATIONAL_AVG": 15,
    "COST_OVERRUN": 20,
    "PROGRESS_MISMATCH": 25,
    "DELAYED_WORK": 15,
    "UNUSUAL_EXPENDITURE": 20,
    "DUPLICATE_WORK": 25,
    "AGENCY_ANOMALY": 15,
    "GEOGRAPHIC_ANOMALY": 15,
}

DUPLICATE_SIMILARITY_THRESHOLD = 0.85  # configurable
MIN_AGENCY_SAMPLE_SIZE = 5
AGENCY_ZSCORE_THRESHOLD = 2.0
MIN_GEO_GROUP_SIZE = 3
GEO_ZSCORE_THRESHOLD = 2.5

EARTH_RADIUS_KM = 6371.0


@dataclass
class RuleResult:
    flags: pd.DataFrame  # columns: work_id, flag_label, source, detail
    wide: pd.DataFrame  # index=work_id, one bool column per POINTS key
    rule_score: pd.Series  # index=work_id, summed (uncapped) point total


def _add(rows: list, wide: dict, work_ids: pd.Index, label: str, details: pd.Series):
    """Records a rule hit for every work_id in `details`'s index."""
    mask = pd.Series(False, index=work_ids)
    mask.loc[details.index] = True
    wide[label] = mask
    for wid, detail in details.items():
        rows.append({"work_id": wid, "flag_label": label, "source": "rule", "detail": detail})


def rule_blacklisted_contractor(df: pd.DataFrame) -> pd.Series:
    mask = df["is_contractor_blacklisted"] | df["is_blacklisted_contractor_anomaly"]
    hit = df.loc[mask]
    reason = hit["blacklisted_reason"].fillna("Contractor is on the blacklist registry")
    return reason


def rule_sanction_delay(df: pd.DataFrame) -> pd.Series:
    mask = df["sanction_delay_days"] > 90
    hit = df.loc[mask]
    return hit["sanction_delay_days"].map(lambda d: f"Sanction delayed {int(d)} days (> 90)")


def rule_excess_duration(df: pd.DataFrame) -> pd.Series:
    mask = df["duration_to_national_avg_ratio"] > 1.5
    hit = df.loc[mask]
    return hit["duration_to_national_avg_ratio"].map(
        lambda r: f"Project duration is {r:.2f}x the national average (> 1.5x)"
    )


def rule_cost_overrun(df: pd.DataFrame) -> pd.Series:
    mask = df["cost_overrun_percent"] > 10
    hit = df.loc[mask]
    return hit["cost_overrun_percent"].map(lambda p: f"Cost overrun {p:.1f}% (> 10%)")


def rule_progress_mismatch(df: pd.DataFrame) -> pd.Series:
    """Money spent ahead of work delivered.

    Uses the SIGNED gap, not the source `progress_mismatch_gap` column: that
    column is an absolute difference (verified on all 111,525 rows), so
    thresholding it fired on both directions at once. Of the 582 works it
    flagged, only 58 had financial actually ahead of physical -- the other
    524 were the opposite case (work delivered, payment not yet recorded),
    which is not this anomaly and was being reported with a message that
    asserted the reverse of what the data said.

    Direction matters here: paying ahead of delivery is the fraud pattern;
    delivering ahead of payment is usually an unpaid contractor or lagging
    paperwork.
    """
    mask = df["progress_gap_financial_minus_physical"] > 20
    hit = df.loc[mask]
    return hit["progress_gap_financial_minus_physical"].map(
        lambda g: f"Financial progress leads physical progress by {g:.1f} points (> 20)"
    )


def rule_delayed_work(df: pd.DataFrame) -> pd.Series:
    mask = df["completion_delay_days"] > 180
    hit = df.loc[mask]
    return hit["completion_delay_days"].map(lambda d: f"Completion delayed {int(d)} days (> 180)")


def rule_unusual_expenditure(df: pd.DataFrame, progress_mismatch_mask: pd.Series) -> pd.Series:
    # Threshold checked directly against the labeled UNUSUAL_EXPENDITURE rows:
    # every one of them has utilisation >= ~99.5% (funds recorded as fully
    # disbursed) -- "> 60%" was too loose a proxy for that. Physical progress
    # still meaningfully incomplete (< 95%) is what makes full disbursement
    # unusual rather than a normal completed project.
    mask = (
        (df["utilisation_pct"] >= 99)
        & (df["physical_progress_percent"] < 95)
        & (~progress_mismatch_mask)
    )
    hit = df.loc[mask]
    return hit.apply(
        lambda r: (
            f"{r['utilisation_pct']:.0f}% of funds utilised but only "
            f"{r['physical_progress_percent']:.0f}% physical progress"
        ),
        axis=1,
    )


def rule_duplicate_work(df: pd.DataFrame, threshold: float = DUPLICATE_SIMILARITY_THRESHOLD) -> pd.Series:
    """Candidate retrieval + verification, grouped by MP:

    Comparing work_description similarity across an MP's *entire* portfolio
    with only a category filter is dominated by templated boilerplate ("
    Construction/Improvement of Road at location N") that makes unrelated
    works look near-identical by character n-grams alone -- confirmed against
    this dataset's false positives. A genuinely resubmitted/duplicated work
    also shares its exact `sanctioned_amount` and `recommendation_date` with
    the original (verified directly against the labeled duplicate pairs), so
    candidate retrieval groups by (mp_id, sanctioned_amount,
    recommendation_date) first -- a coincidental match on both by two
    unrelated works is practically impossible -- and TF-IDF character n-gram
    cosine similarity on the description is then the verification step
    within that tiny candidate set, not the primary filter.
    """
    details: dict[str, str] = {}
    desc = df["work_description"].fillna("")
    groups = df.groupby(["mp_id", "sanctioned_amount", "recommendation_date"], dropna=False).groups
    for _, idx in groups.items():
        if len(idx) < 2 or len(idx) > 200:  # guard against pathological group sizes
            continue
        texts = desc.loc[idx].tolist()
        if all(t.strip() == "" for t in texts):
            continue
        try:
            vectorizer = TfidfVectorizer(analyzer="char_wb", ngram_range=(3, 5), min_df=1)
            matrix = vectorizer.fit_transform(texts)
            sim = cosine_similarity(matrix)
        except ValueError:
            continue
        n = len(idx)
        idx_list = list(idx)
        for i in range(n):
            for j in range(i + 1, n):
                score = sim[i, j]
                if score >= threshold:
                    wid_i, wid_j = idx_list[i], idx_list[j]
                    detail = f"Same sanctioned amount & recommendation date, {score * 100:.0f}% similar description to work {wid_j}"
                    details[wid_i] = max(details.get(wid_i, ""), detail, key=len)
                    detail_j = f"Same sanctioned amount & recommendation date, {score * 100:.0f}% similar description to work {wid_i}"
                    details[wid_j] = max(details.get(wid_j, ""), detail_j, key=len)
    return pd.Series(details)


def rule_agency_anomaly(df: pd.DataFrame, any_other_flag: pd.Series) -> pd.Series:
    """Agencies (>=5 works) whose own anomaly rate is a z-score outlier vs the
    population of qualifying agencies. Every work under an outlier agency is
    flagged (agency-level signal attached to each of its works).

    Grouped by `implementing_agency` (the raw free-text field, 100% populated
    in the source data) rather than the `agency_id` foreign key -- agency_id
    is reserved in the schema for a fuzzy-resolved canonical agency entity
    that has not been populated by any loader yet (see schema.sql's own note
    on `agency`), so grouping by it would silently drop every work into one
    all-NULL bucket."""
    tmp = pd.DataFrame(
        {"implementing_agency": df["implementing_agency"], "flagged": any_other_flag.reindex(df.index).fillna(False)}
    )
    counts = tmp.groupby("implementing_agency").size()
    qualifying = counts[counts >= MIN_AGENCY_SAMPLE_SIZE].index
    if len(qualifying) < 2:
        return pd.Series(dtype=str)
    rates = tmp[tmp["implementing_agency"].isin(qualifying)].groupby("implementing_agency")["flagged"].mean()
    mean, std = rates.mean(), rates.std(ddof=0)
    if not std or math.isnan(std) or std == 0:
        return pd.Series(dtype=str)
    z = (rates - mean) / std
    outlier_agencies = z[z > AGENCY_ZSCORE_THRESHOLD]
    if outlier_agencies.empty:
        return pd.Series(dtype=str)
    details = {}
    for agency_name, zscore in outlier_agencies.items():
        rate = rates[agency_name]
        agency_work_ids = df.index[df["implementing_agency"] == agency_name]
        for wid in agency_work_ids:
            details[wid] = (
                f"Implementing agency '{agency_name}'s anomaly rate {rate * 100:.0f}% is a "
                f"statistical outlier (z={zscore:.1f}) across its {counts[agency_name]} works"
            )
    return pd.Series(details)


def _haversine_km(lat1, lon1, lat2, lon2):
    lat1, lon1, lat2, lon2 = map(np.radians, [lat1, lon1, lat2, lon2])
    dlat, dlon = lat2 - lat1, lon2 - lon1
    a = np.sin(dlat / 2) ** 2 + np.cos(lat1) * np.cos(lat2) * np.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * np.arcsin(np.sqrt(a))


def rule_geographic_anomaly(df: pd.DataFrame) -> pd.Series:
    """Only for geo-tagged rows: flags a work whose distance from its own
    state's centroid (among other geo-tagged works in that state) is a
    z-score outlier. Presented purely as a signal, never as proof."""
    geo = df[df["latitude"].notna() & df["longitude"].notna()]
    details = {}
    for state, group in geo.groupby("state"):
        if len(group) < MIN_GEO_GROUP_SIZE:
            continue
        centroid_lat, centroid_lon = group["latitude"].mean(), group["longitude"].mean()
        dist = _haversine_km(group["latitude"], group["longitude"], centroid_lat, centroid_lon)
        mean, std = dist.mean(), dist.std(ddof=0)
        if not std or std == 0:
            continue
        z = (dist - mean) / std
        outliers = z[z > GEO_ZSCORE_THRESHOLD]
        for wid, zscore in outliers.items():
            details[wid] = (
                f"{dist.loc[wid]:.0f} km from the {state} works centroid "
                f"(z={zscore:.1f}, n={len(group)})"
            )
    return pd.Series(details)


def run_rules(df: pd.DataFrame) -> RuleResult:
    rows: list = []
    wide: dict = {}
    work_ids = df.index

    progress_mismatch_hits = rule_progress_mismatch(df)
    progress_mismatch_mask = pd.Series(False, index=work_ids)
    progress_mismatch_mask.loc[progress_mismatch_hits.index] = True

    per_rule = {
        "AWARDED_TO_BLACKLISTED_CONTRACTOR": rule_blacklisted_contractor(df),
        "SANCTION_DELAY_EXCEEDS_90_DAYS": rule_sanction_delay(df),
        "EXCESS_PROJECT_DURATION_VS_NATIONAL_AVG": rule_excess_duration(df),
        "COST_OVERRUN": rule_cost_overrun(df),
        "PROGRESS_MISMATCH": progress_mismatch_hits,
        "DELAYED_WORK": rule_delayed_work(df),
        "UNUSUAL_EXPENDITURE": rule_unusual_expenditure(df, progress_mismatch_mask),
        "DUPLICATE_WORK": rule_duplicate_work(df),
    }

    for label, details in per_rule.items():
        _add(rows, wide, work_ids, label, details)

    # Agency anomaly depends on the OTHER rules already having fired.
    any_other_flag = pd.Series(False, index=work_ids)
    for label in per_rule:
        any_other_flag |= wide[label]
    agency_hits = rule_agency_anomaly(df, any_other_flag)
    _add(rows, wide, work_ids, "AGENCY_ANOMALY", agency_hits)

    geo_hits = rule_geographic_anomaly(df)
    _add(rows, wide, work_ids, "GEOGRAPHIC_ANOMALY", geo_hits)

    flags_df = pd.DataFrame(rows, columns=["work_id", "flag_label", "source", "detail"])
    wide_df = pd.DataFrame(wide, index=work_ids).fillna(False)

    rule_score = pd.Series(0.0, index=work_ids)
    for label, points in POINTS.items():
        rule_score += wide_df[label].astype(float) * points

    return RuleResult(flags=flags_df, wide=wide_df, rule_score=rule_score)
