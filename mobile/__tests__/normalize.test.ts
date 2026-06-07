import {
  buildIngestPayload,
  isValidSample,
  mapHealthConnectRecords,
  mapHealthKitQuantity,
  millisToMinutes,
  toWire,
} from '../src/health/normalize';
import { DeviceSample } from '../src/health/types';

const sample = (over: Partial<DeviceSample> = {}): DeviceSample => ({
  metric: 'steps',
  value: 1000,
  startTime: new Date('2026-06-01T00:00:00Z'),
  endTime: new Date('2026-06-01T23:59:59Z'),
  ...over,
});

describe('isValidSample', () => {
  it('accepts a well-formed sample', () => {
    expect(isValidSample(sample())).toBe(true);
  });

  it('rejects NaN/Infinity values', () => {
    expect(isValidSample(sample({ value: NaN }))).toBe(false);
    expect(isValidSample(sample({ value: Infinity }))).toBe(false);
  });

  it('rejects an inverted time window', () => {
    expect(
      isValidSample(
        sample({
          startTime: new Date('2026-06-02T00:00:00Z'),
          endTime: new Date('2026-06-01T00:00:00Z'),
        }),
      ),
    ).toBe(false);
  });
});

describe('toWire', () => {
  it('fills the canonical unit when missing and emits ISO times', () => {
    const w = toWire(sample({ metric: 'resting_heart_rate', value: 58, unit: undefined }));
    expect(w.unit).toBe('bpm');
    expect(w.metric).toBe('resting_heart_rate');
    expect(w.start_time).toBe('2026-06-01T00:00:00.000Z');
  });

  it('keeps an explicit unit', () => {
    expect(toWire(sample({ unit: 'count' })).unit).toBe('count');
  });
});

describe('buildIngestPayload', () => {
  it('drops malformed samples', () => {
    const body = buildIngestPayload([sample(), sample({ value: NaN })]);
    expect(body.samples).toHaveLength(1);
    expect(body.samples[0].metric).toBe('steps');
  });
});

describe('mapHealthKitQuantity', () => {
  it('maps HealthKit quantity samples', () => {
    const out = mapHealthKitQuantity('resting_heart_rate', [
      { value: 60, startDate: '2026-06-01T06:00:00Z', endDate: '2026-06-01T06:00:00Z' },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].value).toBe(60);
    expect(out[0].startTime.toISOString()).toBe('2026-06-01T06:00:00.000Z');
  });
});

describe('mapHealthConnectRecords', () => {
  it('extracts the value field and defaults end to start', () => {
    const out = mapHealthConnectRecords(
      'steps',
      [{ startTime: '2026-06-01T00:00:00Z', count: 8421 }],
      'count',
    );
    expect(out[0].value).toBe(8421);
    expect(out[0].endTime.getTime()).toBe(out[0].startTime.getTime());
  });

  it('skips records whose value field is missing or non-numeric', () => {
    const out = mapHealthConnectRecords(
      'steps',
      [{ startTime: '2026-06-01T00:00:00Z', count: 'oops' as unknown as number }],
      'count',
    );
    expect(out).toHaveLength(0);
  });
});

describe('millisToMinutes', () => {
  it('converts ms to minutes', () => {
    expect(millisToMinutes(27_000_000)).toBe(450);
  });
});
