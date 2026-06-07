// Email OTP sign-in (Supabase). Step 1 sends a code; step 2 verifies it.

import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '../src/auth/AuthProvider';

export default function SignIn() {
  const { sendOtp, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [stage, setStage] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);

  const handleSend = async () => {
    setBusy(true);
    try {
      await sendOtp(email.trim());
      setStage('code');
    } catch (e) {
      Alert.alert('Could not send code', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async () => {
    setBusy(true);
    try {
      await verifyOtp(email.trim(), code.trim());
      router.replace('/home');
    } catch (e) {
      Alert.alert('Invalid code', (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Track your pre-diabetes markers</Text>
      <Text style={styles.sub}>Sign in with a one-time code sent to your email.</Text>

      <TextInput
        style={styles.input}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        editable={stage === 'email'}
        onChangeText={setEmail}
      />

      {stage === 'code' && (
        <TextInput
          style={styles.input}
          placeholder="6-digit code"
          keyboardType="number-pad"
          value={code}
          onChangeText={setCode}
        />
      )}

      <Pressable
        style={styles.button}
        disabled={busy}
        onPress={stage === 'email' ? handleSend : handleVerify}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>{stage === 'email' ? 'Send code' : 'Verify & continue'}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center', gap: 12 },
  heading: { fontSize: 22, fontWeight: '700' },
  sub: { fontSize: 14, color: '#555', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 14, fontSize: 16 },
  button: {
    backgroundColor: '#1f6feb',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
