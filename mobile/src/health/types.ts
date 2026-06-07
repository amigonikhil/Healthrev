// Wearable domain types for the mobile bridge.
//
// These MIRROR the backend `WearableMetric` enum and the `/wearables/device/
// {provider}/samples` ingest contract (see backend/app/schemas.py). Apple/Google
// health data has no cloud API, so the app reads it on-device and pushes it to
// the backend in this shape (architectural constraint #1).

export type WearableMetric =
  | 'resting_heart_rate'
  | 'hrv'
  | 'sleep_duration'
  | 'sleep_efficiency'
  | 'recovery_score'
  | 'steps'
  | 'respiratory_rate';

// On-device providers (cloud providers like Whoop use the OAuth flow instead).
export type DeviceProvider = 'apple_health' | 'health_connect';

// Canonical units, kept in lockstep with backend CANONICAL_UNITS.
export const CANONICAL_UNITS: Record<WearableMetric, string> = {
  resting_heart_rate: 'bpm',
  hrv: 'ms',
  sleep_duration: 'min',
  sleep_efficiency: 'percent',
  recovery_score: 'percent',
  steps: 'count',
  respiratory_rate: 'breaths_per_min',
};

// A normalized sample as held in app memory.
export interface DeviceSample {
  metric: WearableMetric;
  value: number;
  startTime: Date;
  endTime: Date;
  unit?: string;
}

// Wire shape accepted by the backend ingest endpoint (snake_case + ISO times).
export interface DeviceSampleWire {
  metric: WearableMetric;
  value: number;
  unit: string;
  start_time: string;
  end_time: string;
}

export interface DeviceSamplesIngestBody {
  samples: DeviceSampleWire[];
}
