// Typed client for the backend API. Every call attaches the current Supabase
// access token; the backend verifies it and enforces the consent gate.

import { DeviceProvider, DeviceSample } from '../health/types';
import { buildIngestPayload } from '../health/normalize';
import { config } from '../lib/config';
import { supabase } from '../lib/supabase';

export type ConsentPurpose =
  | 'wearable_sync'
  | 'lab_report_ingestion'
  | 'marker_storage'
  | 'trend_analysis'
  | 'notifications';

export interface ProviderInfo {
  provider: string;
  supported: boolean;
  connected: boolean;
  last_sync_at: string | null;
}

export interface SampleRow {
  provider: string;
  metric: string;
  value: number;
  unit: string;
  start_time: string;
  end_time: string;
}

export interface SyncResult {
  provider: string;
  new_samples: number;
  synced_at: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...(await authHeader()),
    ...(init.headers ?? {}),
  };
  const resp = await fetch(`${config.apiBaseUrl}${path}`, { ...init, headers });
  if (!resp.ok) {
    let detail = resp.statusText;
    try {
      detail = (await resp.json()).detail ?? detail;
    } catch {
      // non-JSON body; keep statusText
    }
    throw new ApiError(resp.status, detail);
  }
  if (resp.status === 204) return undefined as T;
  return (await resp.json()) as T;
}

export const api = {
  grantConsent: (purpose: ConsentPurpose, policyVersion = 'v1') =>
    request('/consents', {
      method: 'POST',
      body: JSON.stringify({ purpose, policy_version: policyVersion }),
    }),

  revokeConsent: (purpose: ConsentPurpose) =>
    request(`/consents/${purpose}`, { method: 'DELETE' }),

  listProviders: () => request<ProviderInfo[]>('/wearables/providers'),

  connectWhoop: () =>
    request<{ authorization_url: string; state: string }>('/wearables/whoop/connect', {
      method: 'POST',
    }),

  syncWhoop: () => request<SyncResult>('/wearables/whoop/sync', { method: 'POST' }),

  listSamples: () => request<SampleRow[]>('/wearables/samples'),

  // Push on-device HealthKit / Health Connect samples.
  pushDeviceSamples: (provider: DeviceProvider, samples: DeviceSample[]) =>
    request<SyncResult>(`/wearables/device/${provider}/samples`, {
      method: 'POST',
      body: JSON.stringify(buildIngestPayload(samples)),
    }),
};
