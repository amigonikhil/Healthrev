// Android Health Connect bridge via react-native-health-connect.
//
// Requires a custom dev client / native build and the Health Connect app
// installed on the device (Android 14+ ships it; older versions install it from
// the Play Store).

import {
  initialize,
  readRecords,
  requestPermission,
} from 'react-native-health-connect';

import { mapHealthConnectRecords } from './normalize';
import { DeviceProvider, DeviceSample } from './types';

export class HealthConnectBridge {
  readonly provider: DeviceProvider = 'health_connect';

  async isAvailable(): Promise<boolean> {
    try {
      return await initialize();
    } catch {
      return false;
    }
  }

  async requestPermissions(): Promise<boolean> {
    const granted = await requestPermission([
      { accessType: 'read', recordType: 'RestingHeartRate' },
      { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
      { accessType: 'read', recordType: 'RespiratoryRate' },
      { accessType: 'read', recordType: 'Steps' },
      { accessType: 'read', recordType: 'SleepSession' },
    ]);
    return granted.length > 0;
  }

  async readRecentSamples(sinceDays: number): Promise<DeviceSample[]> {
    const timeRangeFilter = {
      operator: 'between' as const,
      startTime: new Date(Date.now() - sinceDays * 86_400_000).toISOString(),
      endTime: new Date().toISOString(),
    };

    const [steps, rhr, resp] = await Promise.all([
      readRecords('Steps', { timeRangeFilter }),
      readRecords('RestingHeartRate', { timeRangeFilter }),
      readRecords('RespiratoryRate', { timeRangeFilter }),
    ]);

    return [
      ...mapHealthConnectRecords('steps', steps.records as never[], 'count'),
      ...mapHealthConnectRecords('resting_heart_rate', rhr.records as never[], 'beatsPerMinute'),
      ...mapHealthConnectRecords('respiratory_rate', resp.records as never[], 'rate'),
    ];
  }
}
