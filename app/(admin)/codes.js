import React, { useCallback, useEffect, useState } from 'react';
import {
  Alert, Linking, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import {
  GlassButton, GhostButton, GlassCard, StatTile, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../src/components/Glass';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Access codes — section 2.4, plus generation and sharing.
 *
 * Every share format is rendered by the server (`/api/codes/share`). The three
 * clients would otherwise each grow their own copy of the formatting and drift
 * apart; here the app only decides which app to hand the finished text to.
 */
export default function Codes() {
  const insets = useSafeAreaInsets();
  const { constants } = useAuth();
  const codeLength = constants?.accessCodeLength ?? 10;

  const [stats, setStats] = useState(null);
  const [codes, setCodes] = useState(null);
  const [schools, setSchools] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');

  const [count, setCount] = useState('20');
  const [schoolId, setSchoolId] = useState(null);
  const [classLevel, setClassLevel] = useState('');
  const [generating, setGenerating] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, list] = await Promise.all([
        api.codes.stats(),
        api.codes.list({ status: filter || undefined, limit: 50 }),
      ]);
      setStats(s);
      setCodes(list.codes);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [filter]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.meta.schools().then((r) => setSchools(r.schools || [])).catch(() => {}); }, []);

  const generate = async () => {
    setError('');
    setNotice('');
    setGenerating(true);
    try {
      const result = await api.codes.generate({
        count: Number(count),
        schoolId: schoolId ?? undefined,
        classLevel: classLevel ? Number(classLevel) : undefined,
      });
      setLastBatch(result);
      setNotice(`${result.count} codes generated.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  /** Ask the server for formatted text, then hand it to the right target. */
  const share = async (format) => {
    if (!lastBatch) return;
    setError('');
    try {
      const rendered = await api.codes.share({ batchId: lastBatch.batchId, format });

      if (format === 'whatsapp') {
        // wa.me works on every platform including the web build, where the
        // whatsapp:// scheme is not registered and silently does nothing.
        const url = `https://wa.me/?text=${encodeURIComponent(rendered.text)}`;
        const opened = await Linking.canOpenURL(url);
        if (opened) await Linking.openURL(url);
        else await copy(rendered.text, 'WhatsApp is not available — codes copied instead.');
        return;
      }

      if (format === 'email') {
        const url = `mailto:?subject=${encodeURIComponent(rendered.subject)}&body=${encodeURIComponent(rendered.text)}`;
        const opened = await Linking.canOpenURL(url);
        if (opened) await Linking.openURL(url);
        else await copy(rendered.text, 'No mail app found — codes copied instead.');
        return;
      }

      if (format === 'csv') {
        // The sandboxed web build cannot start a download, and writing a file
        // on device then sharing it needs expo-file-system. Copying the CSV is
        // the one path that works identically everywhere.
        await copy(rendered.text, `CSV for ${rendered.count} codes copied.`);
        return;
      }

      await copy(rendered.text, `${rendered.count} codes copied.`);
    } catch (err) {
      setError(err.message);
    }
  };

  const copy = async (text, message) => {
    await Clipboard.setStringAsync(text);
    setNotice(message);
  };

  /** The OS share sheet, for anything not covered by the buttons. */
  const shareSheet = async () => {
    if (!lastBatch) return;
    try {
      const rendered = await api.codes.share({ batchId: lastBatch.batchId, format: 'plain' });
      if (Platform.OS === 'web') {
        await copy(rendered.text, 'Codes copied — paste them wherever you need.');
        return;
      }
      await Share.share({ message: rendered.text, title: 'Access codes' });
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleStatus = async (row) => {
    const next = row.status === 'inactive' ? 'unused' : 'inactive';
    try {
      await api.codes.setStatus(row.id, next);
      await load();
    } catch (err) {
      Alert.alert('Could not change the code', err.message);
    }
  };

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
    >
      <Text style={styles.title}>Access codes</Text>

      <View style={styles.tiles}>
        <StatTile label="Total"    value={stats?.total ?? '—'}    loading={!stats} />
        <StatTile label="Used"     value={stats?.used ?? '—'}     tone="success" loading={!stats} />
        <StatTile label="Unused"   value={stats?.unused ?? '—'}   tone="warning" loading={!stats} />
        <StatTile label="Inactive" value={stats?.inactive ?? '—'} tone="danger"  loading={!stats} />
      </View>

      {/* ── Generate ───────────────────────────────────────────────────────── */}
      <GlassCard style={{ marginBottom: spacing.lg }}>
        <Text style={styles.cardTitle}>Generate codes</Text>
        <Text style={styles.cardHint}>
          {codeLength} digits each, unique, single use. Up to {stats?.bulkMax ?? 5000} per batch.
        </Text>

        <View style={styles.formRow}>
          <Field
            label="How many"
            value={count}
            onChangeText={(v) => setCount(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            style={{ flex: 1, minWidth: 110 }}
          />
          <Field
            label="Class (optional)"
            value={classLevel}
            onChangeText={(v) => setClassLevel(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            placeholder="6"
            style={{ flex: 1, minWidth: 110 }}
          />
        </View>

        <Text style={styles.label}>School (optional)</Text>
        <View style={styles.chipRow}>
          {schools.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => setSchoolId(schoolId === s.id ? null : s.id)}
              style={[styles.chip, schoolId === s.id && styles.chipActive]}
            >
              <Text style={[styles.chipText, schoolId === s.id && { color: colors.text }]} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </View>

        <GlassButton
          title={`Generate ${count || 0} codes`}
          onPress={generate}
          loading={generating}
          disabled={!Number(count)}
        />

        {notice ? <Text style={styles.notice}>{notice}</Text> : null}
        <ErrorNote message={error} />
      </GlassCard>

      {/* ── Share the batch just generated ─────────────────────────────────── */}
      {lastBatch && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Text style={styles.cardTitle}>Share {lastBatch.count} codes</Text>
          <Text style={styles.cardHint}>Batch {String(lastBatch.batchId).slice(0, 8)}</Text>

          <View style={styles.preview}>
            {lastBatch.codes.slice(0, 5).map((c) => (
              <Text key={c.id} style={styles.previewCode}>{c.code}</Text>
            ))}
            {lastBatch.count > 5 && <Text style={styles.previewMore}>+{lastBatch.count - 5} more</Text>}
          </View>

          <View style={styles.shareRow}>
            <ShareChip label="WhatsApp" icon="💬" onPress={() => share('whatsapp')} />
            <ShareChip label="Email"    icon="✉"  onPress={() => share('email')} />
            <ShareChip label="Copy"     icon="⧉"  onPress={() => share('plain')} />
            <ShareChip label="CSV"      icon="⤓"  onPress={() => share('csv')} />
            <ShareChip label="More"     icon="⋯"  onPress={shareSheet} />
          </View>
        </GlassCard>
      )}

      {/* ── The list ───────────────────────────────────────────────────────── */}
      <View style={styles.filterRow}>
        {['', 'unused', 'used', 'inactive'].map((f) => (
          <Pressable key={f || 'all'} onPress={() => setFilter(f)} style={[styles.chip, filter === f && styles.chipActive]}>
            <Text style={[styles.chipText, filter === f && { color: colors.text }]}>{f || 'All'}</Text>
          </Pressable>
        ))}
      </View>

      {!codes && !error && <SkeletonRows rows={4} />}

      {codes?.length === 0 ? (
        <Empty title="No codes" hint="Generate a batch above." />
      ) : codes?.map((row) => (
        <GlassCard key={row.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.codeRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.codeText}>{row.code}</Text>
              <Text style={styles.codeMeta} numberOfLines={1}>
                {[row.schoolName, row.classLevel ? `Class ${row.classLevel}` : null,
                  row.student ? `→ ${row.student.fullName}` : null].filter(Boolean).join(' · ') || 'Unassigned'}
              </Text>
            </View>
            <Pill label={row.status} tone={row.status === 'used' ? 'active' : row.status === 'inactive' ? 'inactive' : 'pending'} />
            {row.status !== 'used' && (
              <GhostButton title={row.status === 'inactive' ? 'Enable' : 'Disable'} onPress={() => toggleStatus(row)} />
            )}
          </View>
        </GlassCard>
      ))}
    </ScrollView>
  );
}

function ShareChip({ label, icon, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Share codes via ${label}`}
      style={({ pressed }) => [styles.shareChip, pressed && { opacity: 0.6 }]}
    >
      <Text style={styles.shareIcon}>{icon}</Text>
      <Text style={styles.shareLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },

  cardTitle: { ...typography.h3, color: colors.text },
  cardHint: { ...typography.small, color: colors.textMuted, marginTop: 2, marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },

  formRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center', maxWidth: 220,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },

  notice: { ...typography.small, color: colors.success, marginTop: spacing.sm, textAlign: 'center' },

  preview: {
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md, gap: 2,
  },
  previewCode: { fontFamily: typography.mono, fontSize: 15, color: colors.text, letterSpacing: 1 },
  previewMore: { ...typography.small, color: colors.textFaint, marginTop: spacing.xs },

  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shareChip: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 74, minHeight: 60,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
  },
  shareIcon: { fontSize: 20, color: colors.text },
  shareLabel: { ...typography.caption, color: colors.textMuted },

  codeRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  codeText: { fontFamily: typography.mono, fontSize: 17, color: colors.text, letterSpacing: 1.5 },
  codeMeta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
});
