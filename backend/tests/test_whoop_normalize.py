"""Tests for Whoop payload → WearableSample normalization."""

from __future__ import annotations

from app.wearables.metrics import WearableMetric, WearableProvider
from app.wearables.whoop_normalize import normalize_recovery, normalize_sleep

RECOVERY = [
    {
        "score_state": "SCORED",
        "created_at": "2026-06-01T08:00:00.000Z",
        "score": {
            "recovery_score": 66,
            "resting_heart_rate": 54,
            "hrv_rmssd_milli": 48.5,
        },
    },
    {  # not scored → skipped entirely
        "score_state": "PENDING_SCORE",
        "created_at": "2026-06-02T08:00:00.000Z",
        "score": {"recovery_score": 70},
    },
]

SLEEP = [
    {
        "score_state": "SCORED",
        "start": "2026-06-01T23:00:00.000Z",
        "end": "2026-06-02T07:00:00.000Z",
        "score": {
            "stage_summary": {
                "total_in_bed_time_milli": 28_800_000,  # 480 min
                "total_awake_time_milli": 1_800_000,  # 30 min
            },
            "sleep_efficiency_percentage": 92.0,
            "respiratory_rate": 14.2,
        },
    }
]


def test_recovery_maps_three_metrics_from_scored_record_only():
    samples = normalize_recovery(RECOVERY)
    metrics = {s.metric for s in samples}
    assert metrics == {
        WearableMetric.RESTING_HEART_RATE,
        WearableMetric.HRV,
        WearableMetric.RECOVERY_SCORE,
    }
    assert all(s.provider == WearableProvider.WHOOP for s in samples)
    rhr = next(s for s in samples if s.metric == WearableMetric.RESTING_HEART_RATE)
    assert rhr.value == 54
    assert rhr.unit == "bpm"


def test_recovery_skips_unscored():
    samples = normalize_recovery(RECOVERY)
    # Only the 2026-06-01 record contributes; the pending one is skipped.
    assert all(s.start_time.day == 1 for s in samples)


def test_sleep_duration_is_in_bed_minus_awake_in_minutes():
    samples = normalize_sleep(SLEEP)
    dur = next(s for s in samples if s.metric == WearableMetric.SLEEP_DURATION)
    assert dur.value == 450.0  # (480 - 30) minutes
    assert dur.unit == "min"


def test_sleep_efficiency_and_resp_rate():
    samples = normalize_sleep(SLEEP)
    eff = next(s for s in samples if s.metric == WearableMetric.SLEEP_EFFICIENCY)
    resp = next(s for s in samples if s.metric == WearableMetric.RESPIRATORY_RATE)
    assert eff.value == 92.0
    assert resp.value == 14.2


def test_dedup_keys_are_distinct_per_metric():
    samples = normalize_recovery(RECOVERY) + normalize_sleep(SLEEP)
    keys = [s.dedup_key for s in samples]
    assert len(keys) == len(set(keys))


def test_missing_optional_fields_are_skipped():
    records = [{"score_state": "SCORED", "created_at": "2026-06-01T08:00:00.000Z", "score": {}}]
    assert normalize_recovery(records) == []
