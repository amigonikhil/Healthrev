"""Pure normalization of Whoop API payloads into `WearableSample`s.

Kept separate from the HTTP client so the mapping can be unit-tested
exhaustively against representative payloads with no network.

Field names follow the Whoop Developer API (v1). Whoop is migrating its API
over time, so VERIFY endpoints/fields against current docs before production
(per CLAUDE.md "verify current caps when wiring"). Only records Whoop marks
`score_state == "SCORED"` are mapped; pending/unscorable records are skipped.

No PHI is logged here — this module only transforms data, it does not log.
"""

from __future__ import annotations

from datetime import datetime

from app.wearables.metrics import WearableMetric, WearableProvider, WearableSample

_SCORED = "SCORED"


def _parse_ts(value: str) -> datetime:
    # Whoop timestamps are RFC3339, e.g. "2026-06-01T08:00:00.000Z".
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def _sample(metric: WearableMetric, value: float, start: datetime, end: datetime) -> WearableSample:
    return WearableSample(
        provider=WearableProvider.WHOOP,
        metric=metric,
        value=float(value),
        start_time=start,
        end_time=end,
    )


def normalize_recovery(records: list[dict]) -> list[WearableSample]:
    """Map Whoop `/v1/recovery` records → resting HR, HRV, recovery score."""
    out: list[WearableSample] = []
    for rec in records:
        if rec.get("score_state") != _SCORED:
            continue
        score = rec.get("score") or {}
        ts_raw = rec.get("created_at")
        if ts_raw is None:
            continue
        ts = _parse_ts(ts_raw)

        rhr = score.get("resting_heart_rate")
        if rhr is not None:
            out.append(_sample(WearableMetric.RESTING_HEART_RATE, rhr, ts, ts))

        hrv = score.get("hrv_rmssd_milli")
        if hrv is not None:
            out.append(_sample(WearableMetric.HRV, hrv, ts, ts))

        recovery = score.get("recovery_score")
        if recovery is not None:
            out.append(_sample(WearableMetric.RECOVERY_SCORE, recovery, ts, ts))
    return out


def normalize_sleep(records: list[dict]) -> list[WearableSample]:
    """Map Whoop `/v1/activity/sleep` records → duration, efficiency, resp rate."""
    out: list[WearableSample] = []
    for rec in records:
        if rec.get("score_state") != _SCORED:
            continue
        start_raw, end_raw = rec.get("start"), rec.get("end")
        if not start_raw or not end_raw:
            continue
        start, end = _parse_ts(start_raw), _parse_ts(end_raw)
        score = rec.get("score") or {}

        stages = score.get("stage_summary") or {}
        in_bed = stages.get("total_in_bed_time_milli")
        awake = stages.get("total_awake_time_milli")
        if in_bed is not None and awake is not None:
            asleep_min = max(0.0, (in_bed - awake) / 60000.0)
            out.append(_sample(WearableMetric.SLEEP_DURATION, asleep_min, start, end))

        efficiency = score.get("sleep_efficiency_percentage")
        if efficiency is not None:
            out.append(_sample(WearableMetric.SLEEP_EFFICIENCY, efficiency, start, end))

        resp = score.get("respiratory_rate")
        if resp is not None:
            out.append(_sample(WearableMetric.RESPIRATORY_RATE, resp, start, end))
    return out
