import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { GlassButton, GhostButton, GlassCard, ErrorNote } from '../../src/components/Glass';
import { CodeInput } from '../../src/components/Field';
import { colors, spacing, typography } from '../../src/theme/tokens';

/**
 * OTP verification.
 *
 * Auto-submits the moment the last digit lands. Making someone type six digits
 * and then hunt for a button is a step that exists only because the form was
 * written that way.
 */
export default function Otp() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { verifyOtp, constants } = useAuth();
  const { identifier, channel } = useLocalSearchParams();

  const length = constants?.otpLength ?? 6;
  const cooldown = constants?.otpResendCooldownSeconds ?? 60;

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(cooldown);

  useEffect(() => {
    if (seconds <= 0) return undefined;
    const t = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [seconds]);

  const submit = async (value = code) => {
    if (value.length !== length || busy) return;
    setError('');
    setBusy(true);
    try {
      const result = await verifyOtp(String(identifier), value);
      if (!result.registered) {
        router.replace({
          pathname: '/(auth)/register',
          params: { registrationToken: result.registrationToken, identifier: result.identifier },
        });
      }
      // When they are registered, verifyOtp already stored the session and the
      // guard routes them. Nothing to do here.
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const onChange = (value) => {
    setCode(value);
    setError('');
    if (value.length === length) submit(value);
  };

  const resend = async () => {
    setError('');
    try {
      await api.auth.requestOtp(String(identifier));
      setSeconds(cooldown);
      setCode('');
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Enter the code</Text>
      <Text style={styles.subtitle}>
        Sent to <Text style={styles.identifier}>{identifier}</Text>
        {channel === 'whatsapp' ? ' on WhatsApp' : ''}
      </Text>

      <GlassCard style={{ marginTop: spacing.xl }}>
        <CodeInput length={length} value={code} onChangeText={onChange} error={error ? ' ' : ''} />

        <GlassButton
          title="Verify"
          onPress={() => submit()}
          loading={busy}
          disabled={code.length !== length}
        />

        <View style={styles.resendRow}>
          {seconds > 0
            ? <Text style={styles.resendWait}>Resend available in {seconds}s</Text>
            : <GhostButton title="Resend code" onPress={resend} />}
        </View>

        <ErrorNote message={error} />
      </GlassCard>

      <GhostButton title="← Use a different number" onPress={() => router.back()} style={{ marginTop: spacing.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  identifier: { color: colors.text, fontWeight: '600' },
  resendRow: { alignItems: 'center', marginTop: spacing.md },
  resendWait: { ...typography.small, color: colors.textFaint },
});
