import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../src/auth/AuthContext';
import { GlassButton, GhostButton, GlassCard, ErrorNote, Shimmer } from '../../src/components/Glass';
import { CodeInput } from '../../src/components/Field';
import { colors, spacing, typography } from '../../src/theme/tokens';

/**
 * The post-registration gate — section 1.2.
 *
 * Two ways through: redeem a code for immediate access, or wait for an admin.
 * Both are on one screen because a student who was given a code and a student
 * who was not are the same person until they check their bag.
 */
export default function Gate() {
  const { user, constants, redeemCode, refreshUser, signOut, isParent } = useAuth();
  const insets = useSafeAreaInsets();

  const length = constants?.accessCodeLength ?? 10;

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [checking, setChecking] = useState(false);

  /**
   * Poll for an admin approval that happens while this screen is open.
   *
   * 20 seconds, not 2: approval is a human action minutes away at best, and a
   * tight poll would spend a child's mobile data to learn nothing.
   */
  useEffect(() => {
    const t = setInterval(() => { refreshUser(); }, 20000);
    return () => clearInterval(t);
  }, [refreshUser]);

  const submit = async () => {
    if (code.length !== length) return;
    setError('');
    setBusy(true);
    try {
      await redeemCode(code);
      // The guard sees status: active and routes onward.
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const checkNow = async () => {
    setChecking(true);
    await refreshUser();
    setChecking(false);
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Almost there</Text>
      <Text style={styles.subtitle}>
        Hi {user?.fullName?.split(' ')[0] || 'there'} — your account needs to be activated.
      </Text>

      {/* Parents prove the relationship with their child's code, so the copy
          differs even though the mechanism is the same. */}
      <GlassCard style={{ marginTop: spacing.lg }}>
        <Text style={styles.cardTitle}>
          {isParent ? "Enter your child's access code" : 'Enter your access code'}
        </Text>
        <Text style={styles.cardHint}>
          {length} digits, from your school.
        </Text>

        <View style={{ marginTop: spacing.md }}>
          <CodeInput
            length={length}
            value={code}
            onChangeText={(v) => { setCode(v); setError(''); }}
            autoFocus={false}
            error={error ? ' ' : ''}
          />
        </View>

        <GlassButton title="Activate now" onPress={submit} loading={busy} disabled={code.length !== length} />
        <ErrorNote message={error} />
      </GlassCard>

      <View style={styles.divider}>
        <View style={styles.line} />
        <Text style={styles.dividerText}>or</Text>
        <View style={styles.line} />
      </View>

      <GlassCard>
        <Text style={styles.cardTitle}>Wait for approval</Text>
        <Text style={styles.cardHint}>
          Your school's administrator can approve your account. This page updates on its own.
        </Text>

        <View style={styles.waiting}>
          <Shimmer width={200} height={10} />
          <Text style={styles.waitingText}>Waiting for approval…</Text>
        </View>

        <GlassButton title="Check now" variant="ghost" onPress={checkNow} loading={checking} />
      </GlassCard>

      <GhostButton title="Sign out" onPress={signOut} style={{ marginTop: spacing.lg }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.body, color: colors.textMuted, textAlign: 'center', marginTop: spacing.sm },
  cardTitle: { ...typography.h3, color: colors.text, marginBottom: 4 },
  cardHint: { ...typography.small, color: colors.textMuted },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.glassBorder },
  dividerText: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' },
  waiting: { alignItems: 'center', paddingVertical: spacing.lg, gap: spacing.sm },
  waitingText: { ...typography.small, color: colors.textFaint },
});
