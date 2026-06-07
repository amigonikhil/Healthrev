// Dashboard: consent, connect a cloud wearable (Whoop), pull on-device health,
// and view synced samples. Condition-first framing (metabolic health).

import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { ApiError, SampleRow, api } from '../src/api/client';
import { useAuth } from '../src/auth/AuthProvider';
import { getHealthBridge } from '../src/health/bridge';

const METRIC_LABELS: Record<string, string> = {
  resting_heart_rate: 'Resting HR',
  hrv: 'HRV',
  sleep_duration: 'Sleep',
  sleep_efficiency: 'Sleep efficiency',
  recovery_score: 'Recovery',
  steps: 'Steps',
  respiratory_rate: 'Respiratory rate',
};

export default function Home() {
  const { signOut } = useAuth();
  const [samples, setSamples] = useState<SampleRow[]>([]);
  const [consentGranted, setConsentGranted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSamples(await api.listSamples());
      setConsentGranted(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 403) setConsentGranted(false);
      else Alert.alert('Could not load data', (e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const withBusy = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Something went wrong', (e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const giveConsent = () =>
    withBusy('consent', async () => {
      await api.grantConsent('wearable_sync');
      setConsentGranted(true);
      await refresh();
    });

  const connectWhoop = () =>
    withBusy('whoop', async () => {
      const { authorization_url } = await api.connectWhoop();
      await WebBrowser.openAuthSessionAsync(authorization_url, 'healthrev://');
      // Whoop redirects to the backend callback, which stores the tokens.
      await api.syncWhoop().catch(() => undefined);
      await refresh();
    });

  const syncDevice = () =>
    withBusy('device', async () => {
      const bridge = await getHealthBridge();
      if (!(await bridge.isAvailable())) {
        Alert.alert('Unavailable', 'Health data is not available on this device.');
        return;
      }
      if (!(await bridge.requestPermissions())) {
        Alert.alert('Permission needed', 'Allow health access to sync your data.');
        return;
      }
      const recent = await bridge.readRecentSamples(7);
      const result = await api.pushDeviceSamples(bridge.provider, recent);
      Alert.alert('Synced', `${result.new_samples} new sample(s) from your device.`);
      await refresh();
    });

  if (!consentGranted) {
    return (
      <View style={styles.center}>
        <Text style={styles.heading}>One quick consent</Text>
        <Text style={styles.body}>
          To sync wearable and on-device health data, we need your explicit consent. You can
          revoke it any time; we keep an audit trail of every access.
        </Text>
        <ActionButton label="I consent to sync my health data" busy={busy === 'consent'} onPress={giveConsent} />
        <Pressable onPress={signOut}>
          <Text style={styles.link}>Sign out</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={samples}
      keyExtractor={(item, i) => `${item.metric}-${item.start_time}-${i}`}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={refresh} />}
      ListHeaderComponent={
        <View style={styles.actions}>
          <ActionButton label="Connect Whoop" busy={busy === 'whoop'} onPress={connectWhoop} />
          <ActionButton label="Sync device health" busy={busy === 'device'} onPress={syncDevice} />
        </View>
      }
      ListEmptyComponent={
        <Text style={styles.empty}>No samples yet. Connect Whoop or sync your device above.</Text>
      }
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.metric}>{METRIC_LABELS[item.metric] ?? item.metric}</Text>
          <Text style={styles.value}>
            {item.value} {item.unit}
          </Text>
          <Text style={styles.time}>{new Date(item.start_time).toLocaleString()}</Text>
        </View>
      )}
    />
  );
}

function ActionButton({
  label,
  busy,
  onPress,
}: {
  label: string;
  busy: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={styles.button} disabled={busy} onPress={onPress}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>{label}</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, padding: 24, justifyContent: 'center', gap: 14 },
  heading: { fontSize: 22, fontWeight: '700' },
  body: { fontSize: 15, color: '#444', lineHeight: 22 },
  link: { color: '#1f6feb', textAlign: 'center', marginTop: 12 },
  list: { padding: 16, gap: 10 },
  actions: { gap: 10, marginBottom: 8 },
  button: { backgroundColor: '#1f6feb', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#777', marginTop: 24 },
  row: { borderWidth: 1, borderColor: '#eee', borderRadius: 8, padding: 12, gap: 2 },
  metric: { fontSize: 15, fontWeight: '600' },
  value: { fontSize: 18 },
  time: { fontSize: 12, color: '#888' },
});
