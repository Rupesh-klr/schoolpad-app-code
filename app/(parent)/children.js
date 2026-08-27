import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../src/components/Glass';
import { CodeInput } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * A parent's children.
 *
 * Linking is by the child's access code, never by phone number — the code is
 * the proof of relationship. Linking by number would let anyone who knows a
 * child's number attach themselves to that child's account, which is the worst
 * failure this system could have.
 */
export default function Children() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { constants, signOut } = useAuth();

  const length = constants?.accessCodeLength ?? 10;

  const [data, setData] = useState(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.parent.children());
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const link = async () => {
    setError(''); setNotice(''); setBusy(true);
    try {
      const r = await api.parent.link(code);
      setNotice(`Linked to ${r.childName}.`);
      setCode('');
      setAdding(false);
      await load();
    } catch (err) {
      setError(err.message);
      setCode('');
    } finally {
      setBusy(false);
    }
  };

  const unlink = async (child) => {
    const go = async () => {
      try { await api.parent.unlink(child.id); await load(); }
      catch (err) { setError(err.message); }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Unlink ${child.fullName}? You can link again with their code.`)) go();
    } else go();
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={colors.accentFrom}
        />
      }
    >
      <Text style={styles.title}>My children</Text>
      <Text style={styles.sub}>
        {data ? `${data.children.length} of ${data.limit} linked` : 'Loading…'}
      </Text>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      <ErrorNote message={error} />

      {!data && !error && <SkeletonRows rows={2} />}

      {data?.children?.length === 0 && !adding && (
        <Empty title="No children linked yet" hint="Use your child's access code to link their account." />
      )}

      {data?.children?.map((c) => (
        <GlassCard key={c.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.name}>{c.fullName}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[c.schoolName, c.classLevel ? `Class ${c.classLevel}` : null, c.relation]
                  .filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.sub2}>
                {c.progress.completed} of {c.progress.started} items completed
                {c.lastLoginAt ? ` · last seen ${new Date(c.lastLoginAt).toLocaleDateString()}` : ' · never signed in'}
              </Text>
            </View>
            <Pill label={c.status} tone={c.status} />
            <GhostButton title="Unlink" onPress={() => unlink(c)} />
          </View>
        </GlassCard>
      ))}

      {data && data.remaining > 0 && (
        adding ? (
          <GlassCard strong style={{ marginTop: spacing.md }}>
            <Text style={styles.cardTitle}>Enter your child's access code</Text>
            <Text style={styles.cardHint}>
              {length} digits, the same code they used to activate their account.
            </Text>
            <View style={{ marginTop: spacing.md }}>
              <CodeInput length={length} value={code} onChangeText={(v) => { setCode(v); setError(''); }}
                         autoFocus={false} error={error ? ' ' : ''} />
            </View>
            <GlassButton title="Link child" onPress={link} loading={busy} disabled={code.length !== length} />
            <GhostButton title="Cancel" onPress={() => { setAdding(false); setCode(''); }} />
          </GlassCard>
        ) : (
          <GlassButton title="+ Link a child" onPress={() => setAdding(true)} style={{ marginTop: spacing.md }} />
        )
      )}

      {data?.remaining === 0 && (
        <Text style={styles.limit}>
          You have linked the maximum of {data.limit} children.
        </Text>
      )}

      {data?.children?.length > 0 && (
        <Pressable onPress={() => router.push('/(student)/myclass')} accessibilityRole="button">
          <GlassCard style={{ marginTop: spacing.lg }}>
            <View style={styles.row}>
              <Text style={styles.linkIcon}>🏫</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>Class details & timetable</Text>
                <Text style={styles.sub2}>Dress code, plan of action, weekly schedule and calendar</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      )}

      <GhostButton title="Sign out" onPress={signOut} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  cardTitle: { ...typography.h3, color: colors.text },
  cardHint: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  sub2: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },
  limit: { ...typography.small, color: colors.textFaint, textAlign: 'center', marginTop: spacing.md },
  linkIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  chevron: { fontSize: 22, color: colors.textFaint },
});
