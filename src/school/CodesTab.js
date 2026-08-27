import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { api } from '../api/client';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, StatTile,
} from '../components/Glass';
import { Dropdown, Chevron } from '../components/Dropdown';
import { Sheet, SheetRow, SheetDetail } from '../components/Sheet';
import { Field } from '../components/Field';
import { colors, radius, spacing, typography } from '../theme/tokens';

/**
 * Access codes for one school.
 *
 * The same data as the global Codes screen, filtered to this school and with
 * per-code actions behind a sheet. A row with four buttons on it is unusable on
 * a phone; tapping the row and choosing from a sheet works at any width.
 */
export function CodesTab({ schoolId, schoolName, classes, constants, setError }) {
  const codeLength = constants?.accessCodeLength ?? 10;

  const [codes, setCodes] = useState(null);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState(null);
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');

  const [open, setOpen] = useState(false);
  const [count, setCount] = useState('20');
  const [classLevel, setClassLevel] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [lastBatch, setLastBatch] = useState(null);

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.codes.list({ schoolId, status: filter || undefined, limit: 200 }),
        api.codes.stats(),
      ]);
      setCodes(list.codes);
      setStats(s);
    } catch (err) {
      setError(err.message);
    }
  }, [schoolId, filter, setError]);

  useEffect(() => { load(); }, [load]);

  /**
   * Counts for this school only.
   *
   * /api/codes/stats is global, so the tiles are derived from the rows in hand
   * instead — a school's page showing every school's totals would be wrong in a
   * way nobody would notice until they acted on it.
   */
  const mine = useMemo(() => {
    const all = codes || [];
    return {
      total: all.length,
      used: all.filter((c) => c.status === 'used').length,
      unused: all.filter((c) => c.status === 'unused').length,
      inactive: all.filter((c) => c.status === 'inactive').length,
    };
  }, [codes]);

  const classOptions = useMemo(() => {
    const fromClasses = (classes || []).map((c) => c.classLevel);
    const min = constants?.minClass ?? 2;
    const max = constants?.maxClass ?? 10;
    const levels = fromClasses.length
      ? [...new Set(fromClasses)].sort((a, b) => a - b)
      : Array.from({ length: max - min + 1 }, (_, i) => min + i);
    return levels.map((l) => ({ value: l, label: `Class ${l}` }));
  }, [classes, constants]);

  const generate = async () => {
    setGenerating(true); setNotice('');
    try {
      const r = await api.codes.generate({
        count: Number(count),
        schoolId: Number(schoolId),
        classLevel: classLevel || undefined,
      });
      setLastBatch(r);
      setNotice(`${r.count} codes generated for ${schoolName}.`);
      setOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const setStatus = async (row, next) => {
    try {
      await api.codes.setStatus(row.id, next);
      setSelected(null);
      setNotice(`Code ${row.code} ${next === 'inactive' ? 'deactivated' : 'reactivated'}.`);
      await load();
    } catch (err) {
      setError(err.message);
      setSelected(null);
    }
  };

  const copyOne = async (row) => {
    await Clipboard.setStringAsync(row.code);
    setSelected(null);
    setNotice(`Code ${row.code} copied.`);
  };

  const shareBatch = async (format) => {
    if (!lastBatch) return;
    try {
      const r = await api.codes.share({ batchId: lastBatch.batchId, format });
      if (format === 'whatsapp') {
        const url = `https://wa.me/?text=${encodeURIComponent(r.text)}`;
        if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      }
      if (format === 'email') {
        const url = `mailto:?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.text)}`;
        if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      }
      if (format === 'plain' && Platform.OS !== 'web') {
        return Share.share({ message: r.text, title: 'Access codes' });
      }
      await Clipboard.setStringAsync(r.text);
      setNotice(`${r.count} codes copied.`);
      return undefined;
    } catch (err) {
      setError(err.message);
      return undefined;
    }
  };

  return (
    <>
      <View style={styles.tiles}>
        <StatTile label="Codes" value={mine.total || '—'} loading={!codes} />
        <StatTile label="Used" value={mine.used} tone="success" loading={!codes} />
        <StatTile label="Unused" value={mine.unused} tone="warning" loading={!codes} />
        <StatTile label="Off" value={mine.inactive} tone="danger" loading={!codes} />
      </View>

      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{open ? 'Generate codes' : 'Generate codes for this school'}</Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Text style={styles.hint}>
            {codeLength} digits each, unique, single use. Pre-assigned to {schoolName}.
          </Text>
          <View style={styles.row2}>
            <View style={styles.col}>
              <Field label="How many" value={count} onChangeText={(v) => setCount(v.replace(/\D/g, ''))}
                     keyboardType="number-pad" />
            </View>
            <View style={styles.col}>
              <Dropdown label="Class (optional)" value={classLevel} options={classOptions}
                        onChange={setClassLevel} placeholder="Any class" />
            </View>
          </View>
          <Text style={styles.hint}>
            A code carrying a class sets the student's class when they redeem it.
          </Text>
          <GlassButton title={`Generate ${count || 0}`} onPress={generate} loading={generating}
                       disabled={!Number(count)} />
        </GlassCard>
      )}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {lastBatch && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Text style={styles.cardTitle}>Share {lastBatch.count} new codes</Text>
          <View style={styles.preview}>
            {lastBatch.codes.slice(0, 4).map((c) => (
              <Text key={c.id} style={styles.previewCode}>{c.code}</Text>
            ))}
            {lastBatch.count > 4 && <Text style={styles.previewMore}>+{lastBatch.count - 4} more</Text>}
          </View>
          <View style={styles.shareRow}>
            <ShareChip icon="💬" label="WhatsApp" onPress={() => shareBatch('whatsapp')} />
            <ShareChip icon="✉" label="Email" onPress={() => shareBatch('email')} />
            <ShareChip icon="⧉" label="Copy" onPress={() => shareBatch('plain')} />
            <ShareChip icon="⤓" label="CSV" onPress={() => shareBatch('csv')} />
          </View>
        </GlassCard>
      )}

      <View style={styles.chipRow}>
        {[null, 'unused', 'used', 'inactive'].map((f) => (
          <Chip key={f || 'all'} label={f || 'All'} active={filter === f} onPress={() => setFilter(f)} />
        ))}
      </View>

      {!codes && <SkeletonRows rows={4} />}

      {codes?.length === 0 ? (
        <Empty title="No codes for this school" hint="Generate a batch above." />
      ) : codes?.map((row) => (
        <Pressable key={row.id} onPress={() => setSelected(row)} accessibilityRole="button"
                   accessibilityLabel={`Code ${row.code}, ${row.status}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 150 }}>
                <Text style={styles.codeText}>{row.code}</Text>
                <Text style={styles.codeMeta} numberOfLines={1}>
                  {[row.classLevel ? `Class ${row.classLevel}` : 'Any class',
                    row.student ? `→ ${row.student.fullName}` : null].filter(Boolean).join(' · ')}
                </Text>
              </View>
              <Pill
                label={row.status}
                tone={row.status === 'used' ? 'active' : row.status === 'inactive' ? 'inactive' : 'pending'}
              />
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}

      {/* ── Per-code actions ───────────────────────────────────────────────── */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.code}
        subtitle={selected ? `${schoolName} · ${selected.classLevel ? `Class ${selected.classLevel}` : 'any class'}` : ''}
      >
        {selected?.status === 'used' ? (
          <>
            <SheetRow icon="🔒" tone="muted" label="This code has been used" disabled
                      hint="A used code records which student activated with it, so it cannot be changed." />
            <SheetRow icon="⧉" label="Copy code" onPress={() => copyOne(selected)} />
            <SheetDetail label="Redeemed by" value={selected?.student?.fullName} />
            <SheetDetail label="Used at" value={selected?.usedAt ? new Date(selected.usedAt).toLocaleString() : '—'} />
          </>
        ) : (
          <>
            <SheetRow icon="⧉" label="Copy code" onPress={() => copyOne(selected)} />
            {selected?.status === 'unused' ? (
              <SheetRow icon="⛔" tone="danger" label="Deactivate this code"
                        hint="Nobody can redeem it until you turn it back on."
                        onPress={() => setStatus(selected, 'inactive')} />
            ) : (
              <SheetRow icon="✅" tone="success" label="Reactivate this code"
                        hint="It becomes redeemable again."
                        onPress={() => setStatus(selected, 'unused')} />
            )}
            <SheetDetail label="Status" value={selected?.status} />
            <SheetDetail label="Created"
                         value={selected?.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'} />
          </>
        )}
      </Sheet>
    </>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button"
               accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

function ShareChip({ icon, label, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Share via ${label}`}
               style={({ pressed }) => [styles.shareChip, pressed && { opacity: 0.6 }]}>
      <Text style={styles.shareIcon}>{icon}</Text>
      <Text style={styles.shareLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  composerTitle: { ...typography.h3, color: colors.text },
  cardTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.sm },
  hint: { ...typography.small, color: colors.textFaint, marginBottom: spacing.md },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },

  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  col: { flexGrow: 1, flexBasis: 160, minWidth: 140 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },

  preview: {
    backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: radius.md,
    padding: spacing.md, marginBottom: spacing.md, gap: 2,
  },
  previewCode: { fontFamily: typography.mono, fontSize: 15, color: colors.text, letterSpacing: 1 },
  previewMore: { ...typography.small, color: colors.textFaint, marginTop: spacing.xs },

  shareRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  shareChip: {
    alignItems: 'center', justifyContent: 'center', gap: 2,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minWidth: 74, minHeight: 58,
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
  },
  shareIcon: { fontSize: 19, color: colors.text },
  shareLabel: { ...typography.caption, color: colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  codeText: { fontFamily: typography.mono, fontSize: 17, color: colors.text, letterSpacing: 1.5 },
  codeMeta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textFaint },
});
