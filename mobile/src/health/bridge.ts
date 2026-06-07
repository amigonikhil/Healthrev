// On-device health bridge abstraction.
//
// Apple HealthKit and Google Health Connect are device-local with no cloud API,
// so we read them on-device and push to the backend (architectural constraint
// #1). Each platform has its own native module; both satisfy this interface so
// the screens never branch on platform.

import { DeviceProvider, DeviceSample } from './types';

export interface HealthBridge {
  readonly provider: DeviceProvider;
  /** Whether the platform health store is available on this device. */
  isAvailable(): Promise<boolean>;
  /** Prompt the OS permission sheet for the metrics we read. Returns granted. */
  requestPermissions(): Promise<boolean>;
  /** Read normalized samples recorded in the last `sinceDays` days. */
  readRecentSamples(sinceDays: number): Promise<DeviceSample[]>;
}

// Lazily resolve the platform bridge so the unused module isn't imported on the
// other platform. Implementations live in healthkit.ts / healthConnect.ts.
export async function getHealthBridge(): Promise<HealthBridge> {
  const { Platform } = await import('react-native');
  if (Platform.OS === 'ios') {
    const { HealthKitBridge } = await import('./healthkit');
    return new HealthKitBridge();
  }
  if (Platform.OS === 'android') {
    const { HealthConnectBridge } = await import('./healthConnect');
    return new HealthConnectBridge();
  }
  throw new Error('On-device health is only available on iOS and Android');
}
