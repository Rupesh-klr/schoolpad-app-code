import React, { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { GlassButton, GlassCard, ErrorNote } from '../../src/components/Glass';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * The details collected after OTP verification.
 *
 * Nothing was created in the database until this form is submitted — a verified
 * phone number with no name or class is a half-account the admin dashboard
 * would have to display and explain.
 */
export default function Register() {
  const insets = useSafeAreaInsets();
  const { register, constants } = useAuth();
  const { registrationToken, identifier } = useLocalSearchParams();

  const minClass = constants?.minClass ?? 2;
  const maxClass = constants?.maxClass ?? 10;
  const classes = Array.from({ length: maxClass - minClass + 1 }, (_, i) => minClass + i);

  const [role, setRole] = useState('student');
  const [fullName, setFullName] = useState('');
  const [schools, setSchools] = useState([]);
  const [schoolId, setSchoolId] = useState(null);
  const [classLevel, setClassLevel] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Not fatal if it fails — school is optional at registration and a code can
    // set it later, so a dropdown that cannot load must not block sign-up.
    api.meta.schools().then((r) => setSchools(r.schools || [])).catch(() => setSchools([]));
  }, []);

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await register({
        registrationToken: String(registrationToken),
        fullName: fullName.trim(),
        role,
        ...(role === 'student' ? { schoolId, classLevel } : {}),
      });
      // The guard routes to the gate screen, since the new account is pending.
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ready = fullName.trim().length >= 2 && (role === 'parent' || !!classLevel);

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>A few details</Text>
        <Text style={styles.subtitle}>Verified: {identifier}</Text>

        <GlassCard style={{ marginTop: spacing.lg }}>
          <Text style={styles.label}>I am a</Text>
          <View style={styles.chipRow}>
            <Chip label="Student" active={role === 'student'} onPress={() => setRole('student')} />
            <Chip label="Parent / Guardian" active={role === 'parent'} onPress={() => setRole('parent')} />
          </View>

          <Field
            label="Full name"
            value={fullName}
            onChangeText={setFullName}
            placeholder="Your name"
            autoCapitalize="words"
          />

          {role === 'student' && (
            <>
              <Text style={styles.label}>Class</Text>
              <View style={styles.chipRow}>
                {classes.map((c) => (
                  <Chip key={c} label={String(c)} active={classLevel === c} onPress={() => setClassLevel(c)} compact />
                ))}
              </View>

              {schools.length > 0 && (
                <>
                  <Text style={styles.label}>School (optional)</Text>
                  <View style={styles.chipRow}>
                    {schools.map((s) => (
                      <Chip
                        key={s.id}
                        label={s.name}
                        active={schoolId === s.id}
                        onPress={() => setSchoolId(schoolId === s.id ? null : s.id)}
                      />
                    ))}
                  </View>
                  <Text style={styles.hint}>
                    If you have an access code, it will set your school and class automatically.
                  </Text>
                </>
              )}
            </>
          )}

          <GlassButton title="Create my account" onPress={submit} loading={busy} disabled={!ready} style={{ marginTop: spacing.md }} />
          <ErrorNote message={error} />
        </GlassCard>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Chip({ label, active, onPress, compact = false }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, compact && styles.chipCompact, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, maxWidth: 560, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, textAlign: 'center' },
  subtitle: { ...typography.small, color: colors.textMuted, textAlign: 'center', marginTop: spacing.xs },
  label: {
    ...typography.caption, color: colors.textMuted, textTransform: 'uppercase',
    marginBottom: spacing.xs, marginLeft: spacing.xs,
  },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderRadius: radius.pill, borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: colors.glass, minHeight: 40, justifyContent: 'center',
  },
  chipCompact: { minWidth: 46, alignItems: 'center', paddingHorizontal: spacing.sm },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted },
  chipTextActive: { color: colors.text, fontWeight: '600' },
  hint: { ...typography.small, color: colors.textFaint, marginBottom: spacing.md, marginLeft: spacing.xs },
});
