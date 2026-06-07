// Pure normalization: native HealthKit / Health Connect readings -> the shared
// DeviceSample shape -> the backend ingest payload.
//
// Kept dependency-free so it is unit-testable with plain jest (no native modules,
// no React Native runtime). This is where the "untrusted device data is made
// well-formed before it leaves the phone" logic lives.

import {
  CANONICAL_UNITS,
  DeviceSample,
  DeviceSampleWire,
  DeviceSamplesIngestBody,
  WearableMetric,
} from './types';

const MS_PER_MINUTE = 60_000;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/** True when a sample is well-formed enough to send. */
export function isValidSample(s: DeviceSample): boolean {
  return (
    isFiniteNumber(s.value) &&
    s.startTime instanceof Date &&
    s.endTime instanceof Date &&
    !Number.isNaN(s.startTime.getTime()) &&
    !Number.isNaN(s.endTime.getTime()) &&
    s.endTime.getTime() >= s.startTime.getTime()
  );
}

/** Serialize one sample to the backend wire shape (filling the canonical unit). */
export function toWire(s: DeviceSample): DeviceSampleWire {
  return {
    metric: s.metric,
    value: s.value,
    unit: s.unit && s.unit.length > 0 ? s.unit : CANONICAL_UNITS[s.metric],
    start_time: s.startTime.toISOString(),
    end_time: s.endTime.toISOString(),
  };
}

/** Build the POST body, dropping any malformed samples defensively. */
export function buildIngestPayload(samples: DeviceSample[]): DeviceSamplesIngestBody {
  return { samples: samples.filter(isValidSample).map(toWire) };
}

// --- Provider mappers --------------------------------------------------------
// react-native-health (HealthKit) returns quantity samples shaped roughly as
// { value: number, startDate: string, endDate: string }.

interface HKQuantitySample {
  value: number;
  startDate: string;
  endDate: string;
}

export function mapHealthKitQuantity(
  metric: WearableMetric,
  raw: HKQuantitySample[],
): DeviceSample[] {
  return raw.map((r) => ({
    metric,
    value: r.value,
    startTime: new Date(r.startDate),
    endTime: new Date(r.endDate),
  }));
}

// react-native-health-connect returns records that vary by type; steps records
// look like { count, startTime, endTime }, heart-rate-like records expose a
// single numeric field. We normalize both via a value extractor.

interface HCRecord {
  startTime: string;
  endTime?: string;
  [field: string]: unknown;
}

export function mapHealthConnectRecords(
  metric: WearableMetric,
  raw: HCRecord[],
  valueField: string,
): DeviceSample[] {
  const out: DeviceSample[] = [];
  for (const r of raw) {
    const value = r[valueField];
    if (!isFiniteNumber(value)) continue;
    const start = new Date(r.startTime);
    const end = r.endTime ? new Date(r.endTime) : start;
    out.push({ metric, value, startTime: start, endTime: end });
  }
  return out;
}

/** Convert a millisecond duration (e.g. Health Connect sleep) to minutes. */
export function millisToMinutes(ms: number): number {
  return ms / MS_PER_MINUTE;
}
