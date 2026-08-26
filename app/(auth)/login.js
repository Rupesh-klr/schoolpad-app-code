import React, { useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { GlassButton, GlassCard, ErrorNote } from '../../src/components/Glass';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Sign in.
 *
 * Two modes on one screen: students and parents enter a phone or email and get
 * an OTP; admins use a password. A separate admin URL would be one more thing
 * to explain, and the toggle makes the role split visible rather than hidden.
 */
export default function Login() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signInAdmin } = useAuth();

  const [mode, setMode] = useState('otp');
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendOtp = async () => {
    setError('');
    setBusy(true);
    try {
      const result = await api.auth.requestOtp(identifier.trim());
      router.push({
        pathname: '/(auth)/otp',
        params: { identifier: result.identifier, channel: result.channel },
      });
    } catch (err) {
      // The server tells an admin who tries OTP to use a password instead.
      // Switching the form for them is friendlier than making them find it.
      if (err.code === 'USE_PASSWORD_LOGIN') {
        setMode('admin');
        setEmail(identifier.trim());
        setError('This is an admin account — sign in with your password.');
      } else {
        setError(err.message);
      }
    } finally {
      setBusy(false);
    }
  };

  const adminSignIn = async () => {
    setError('');
    setBusy(true);
    try {
      await signInAdmin(email.trim(), password);
      // No navigation here — the guard in _layout.js sees the new session and
      // routes to the dashboard. Pushing as well would double-navigate.
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.brand}>
          <Text style={styles.logo}>◆</Text>
          <Text style={styles.title}>Learning App</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <GlassCard style={styles.card}>
          <View style={styles.segment}>
            <SegmentTab label="Student / Parent" active={mode === 'otp'} onPress={() => { setMode('otp'); setError(''); }} />
            <SegmentTab label="Admin" active={mode === 'admin'} onPress={() => { setMode('admin'); setError(''); }} />
          </View>

          {mode === 'otp' ? (
            <>
              <Field
                label="Mobile number or email"
                value={identifier}
                onChangeText={setIdentifier}
                placeholder="+91 98765 43210"
                keyboardType={identifier.includes('@') ? 'email-address' : 'phone-pad'}
                hint="We'll send you a one-time code."
                onSubmitEditing={sendOtp}
              />
              <GlassButton
                title="Send code"
                onPress={sendOtp}
                loading={busy}
                disabled={identifier.trim().length < 5}
              />
            </>
          ) : (
            <>
              <Field
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="admin@example.com"
                keyboardType="email-address"
              />
              <Field
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry
                onSubmitEditing={adminSignIn}
              />
              <GlassButton
                title="Sign in"
                onPress={adminSignIn}
                loading={busy}
                disabled={!email.trim() || !password}
              />
            </>
          )}

          <ErrorNote message={error} />
        </GlassCard>

        <Text style={styles.footer}>
          New here? Enter your number above — we'll create your account after verification.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SegmentTab({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      style={[styles.tab, active && styles.tabActive]}
    >
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  brand: { alignItems: 'center', marginBottom: spacing.xl },
  logo: { fontSize: 44, color: colors.accentFrom, marginBottom: spacing.sm },
  title: { ...typography.h1, color: colors.text },
  subtitle: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs },
  card: { marginBottom: spacing.lg },

  segment: {
    flexDirection: 'row', backgroundColor: colors.glass, borderRadius: radius.pill,
    padding: 4, marginBottom: spacing.lg,
  },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.glassStrong },
  tabText: { ...typography.small, color: colors.textMuted },
  tabTextActive: { color: colors.text, fontWeight: '600' },

  footer: { ...typography.small, color: colors.textFaint, textAlign: 'center', paddingHorizontal: spacing.lg },
});
