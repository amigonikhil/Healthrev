// iOS HealthKit bridge via react-native-health.
//
// Requires a custom dev client / native build (not Expo Go) and the HealthKit
// entitlement (added by the react-native-health config plugin in app.json).

import AppleHealthKit, {
  HealthInputOptions,
  HealthKitPermissions,
} from 'react-native-health';

import { mapHealthKitQuantity } from './normalize';
import { DeviceProvider, DeviceSample, WearableMetric } from './types';

const PERMS: HealthKitPermissions = {
  permissions: {
    read: [
      AppleHealthKit.Constants.Permissions.RestingHeartRate,
      AppleHealthKit.Constants.Permissions.HeartRateVariability,
      AppleHealthKit.Constants.Permissions.RespiratoryRate,
      AppleHealthKit.Constants.Permissions.StepCount,
      AppleHealthKit.Constants.Permissions.SleepAnalysis,
    ],
    write: [],
  },
};

function initHealthKit(): Promise<void> {
  return new Promise((resolve, reject) => {
    AppleHealthKit.initHealthKit(PERMS, (err: string) => {
      if (err) reject(new Error(err));
      else resolve();
    });
  });
}

type HKMethod = (
  opts: HealthInputOptions,
  cb: (err: string | null, results: { value: number; startDate: string; endDate: string }[]) => void,
) => void;

function readQuantity(
  metric: WearableMetric,
  method: HKMethod,
  opts: HealthInputOptions,
): Promise<DeviceSample[]> {
  return new Promise((resolve, reject) => {
    method(opts, (err, results) => {
      if (err) reject(new Error(err));
      else resolve(mapHealthKitQuantity(metric, results ?? []));
    });
  });
}

export class HealthKitBridge {
  readonly provider: DeviceProvider = 'apple_health';

  async isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      AppleHealthKit.isAvailable((_err: object, available: boolean) => resolve(!!available));
    });
  }

  async requestPermissions(): Promise<boolean> {
    try {
      await initHealthKit();
      return true;
    } catch {
      return false;
    }
  }

  async readRecentSamples(sinceDays: number): Promise<DeviceSample[]> {
    const opts: HealthInputOptions = {
      startDate: new Date(Date.now() - sinceDays * 86_400_000).toISOString(),
    };
    const [rhr, hrv, resp, steps] = await Promise.all([
      readQuantity('resting_heart_rate', AppleHealthKit.getRestingHeartRateSamples, opts),
      readQuantity('hrv', AppleHealthKit.getHeartRateVariabilitySamples, opts),
      readQuantity('respiratory_rate', AppleHealthKit.getRespiratoryRateSamples, opts),
      readQuantity('steps', AppleHealthKit.getDailyStepCountSamples, opts),
    ]);
    return [...rhr, ...hrv, ...resp, ...steps];
  }
}
