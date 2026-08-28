import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import {
  GlassButton, GhostButton, GlassCard, StatTile, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../src/components/Glass';
import { Sheet, SheetRow, SheetDetail } from '../../src/components/Sheet';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Dashboard — section 2.1 tiles, plus the approval queue.
 *
 * Approving a student is the one job an admin does daily, especially at the
 * start of term. Making them navigate to Students and filter to pending first
 * turns a two-second action into a four-step one, so the queue lives here.
 */
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [data, setData] = useState(null);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [approvingAll, setApprovingAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const [d, p] = await Promise.all([
        api.admin.dashboard(),
        api.students.list({ status: 'pending', limit: 50 }),
      ]);
      setData(d);
      setPending(p.students);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const setStatus = async (student, status) => {
    setBusyId(student.id);
    try {
      await api.students.setStatus(student.id, status);
      // Drop the row immediately rather than waiting for the refetch — the
      // list is the queue, and a row that lingers invites a second tap.
      setPending((list) => list.filter((s) => s.id !== student.id));
      setSelected(null);
      setNotice(`${student.fullName} ${status === 'active' ? 'approved' : 'declined'}.`);
      await load();
    } catch (err) {
      setError(err.message);
      setSelected(null);
    } finally {
      setBusyId(null);
    }
  };

  /**
   * Approve everyone waiting.
   *
   * Sequential, not Promise.all: fifty parallel writes against one connection
   * pool is how a burst turns into timeouts, and the ordering makes a partial
   * failure obvious — the ones left in the list are the ones that did not work.
   */
  const approveAll = async () => {
    const go = async () => {
      setApprovingAll(true);
      let done = 0;
      try {
        for (const s of [...(pending || [])]) {
          await api.students.setStatus(s.id, 'active');
          done += 1;
          setPending((list) => list.filter((x) => x.id !== s.id));
        }
        setNotice(`${done} student${done === 1 ? '' : 's'} approved.`);
      } catch (err) {
        setError(`Approved ${done}, then stopped: ${err.message}`);
      } finally {
        setApprovingAll(false);
        await load();
      }
    };

    const n = pending?.length ?? 0;
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Approve all ${n} students waiting? They all get access immediately.`)) go();
    } else go();
  };

  const loading = !data && !error;
  const waiting = pending?.length ?? 0;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={colors.accentFrom}
        />
      }
    >
      <Text style={styles.title}>Dashboard</Text>

      <ErrorNote message={error} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {/* ── Approval queue ─────────────────────────────────────────────────── */}
      {waiting > 0 && (
        <GlassCard strong style={styles.queue}>
          <View style={styles.queueHead}>
            <View style={{ flex: 1 }}>
              <Text style={styles.queueTitle}>
                {waiting} student{waiting === 1 ? '' : 's'} waiting for approval
              </Text>
              <Text style={styles.queueHint}>
                They registered without an access code. Approving gives them their class content.
              </Text>
            </View>
            {waiting > 1 && (
              <GhostButton title="Approve all" onPress={approveAll} />
            )}
          </View>

          {pending.map((s) => (
            <View key={s.id} style={styles.pendingRow}>
              <Pressable
                onPress={() => setSelected(s)}
                style={{ flex: 1, minWidth: 150 }}
                accessibilityRole="button"
                accessibilityLabel={`Details for ${s.fullName}`}
              >
                <Text style={styles.name}>{s.fullName}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[s.schoolName || 'No school',
                    s.classLevel ? `Class ${s.classLevel}` : 'No class',
                    s.phone || s.email].filter(Boolean).join(' · ')}
                </Text>
              </Pressable>

              <GlassButton
                title="Approve"
                onPress={() => setStatus(s, 'active')}
                loading={busyId === s.id || approvingAll}
                style={{ minWidth: 118 }}
              />
            </View>
          ))}
        </GlassCard>
      )}

      {pending && waiting === 0 && (
        <GlassCard style={{ marginBottom: spacing.lg }}>
          <Text style={styles.allClear}>✓  Nobody is waiting for approval</Text>
        </GlassCard>
      )}

      {/* ── Tiles ──────────────────────────────────────────────────────────── */}
      {!error && (
        <>
          <View style={styles.tiles}>
            <StatTile label="Schools"      value={data?.schools.total ?? '—'}   loading={loading} />
            <StatTile label="Students"     value={data?.students.total ?? '—'}  loading={loading} />
            <StatTile label="Total codes"  value={data?.codes.total ?? '—'}     loading={loading} />
            <StatTile label="Used codes"   value={data?.codes.used ?? '—'}      tone="success" loading={loading} />
            <StatTile label="Unused codes" value={data?.codes.unused ?? '—'}    tone="warning" loading={loading} />
          </View>

          <View style={styles.tiles}>
            <StatTile label="Pending approval" value={data?.students.pending ?? '—'} tone="warning" loading={loading} />
            <StatTile label="Active students"  value={data?.students.active ?? '—'}  tone="success" loading={loading} />
            <StatTile label="Parents"          value={data?.parents.total ?? '—'}    loading={loading} />
            <StatTile label="Content items"    value={data?.content.items ?? '—'}    loading={loading} />
          </View>

          <View style={styles.sectionHead}>
            <Text style={styles.sectionTitle}>Latest registrations</Text>
            <GhostButton title="All students →" onPress={() => router.push('/(admin)/students')} />
          </View>

          {loading && <SkeletonRows rows={3} />}

          {data?.recentStudents?.length === 0 ? (
            <Empty title="No students yet" hint="Registrations will appear here as they arrive." />
          ) : (
            data?.recentStudents?.map((s) => (
              <GlassCard key={s.id} style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <View style={{ flex: 1, minWidth: 150 }}>
                    <Text style={styles.name} numberOfLines={1}>{s.fullName}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[s.schoolName, s.classLevel ? `Class ${s.classLevel}` : null]
                        .filter(Boolean).join(' · ') || 'No school set'}
                    </Text>
                  </View>
                  <Pill label={s.status} tone={s.status} />
                  {/* Pending rows are actionable here too — the queue above is
                      capped at 50, and this list is what an admin scans first. */}
                  {s.status === 'pending' && (
                    <GlassButton
                      title="Approve"
                      onPress={() => setStatus(s, 'active')}
                      loading={busyId === s.id}
                      style={{ minWidth: 110 }}
                    />
                  )}
                </View>
              </GlassCard>
            ))
          )}
        </>
      )}

      {/* ── Per-student sheet ──────────────────────────────────────────────── */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.fullName}
        subtitle={selected ? [selected.schoolName, selected.classLevel ? `Class ${selected.classLevel}` : null]
          .filter(Boolean).join(' · ') : ''}
      >
        <SheetRow
          icon="✅" tone="success" label="Approve"
          hint="They get their class content immediately."
          onPress={() => setStatus(selected, 'active')}
        />
        <SheetRow
          icon="⛔" tone="danger" label="Decline"
          hint="Keeps the account but blocks access. They can be approved later."
          onPress={() => setStatus(selected, 'inactive')}
        />
        <SheetDetail label="Contact" value={selected?.phone || selected?.email} />
        <SheetDetail label="School" value={selected?.schoolName || 'Not set'} />
        <SheetDetail label="Class" value={selected?.classLevel ? `Class ${selected.classLevel}` : 'Not set'} />
        <SheetDetail
          label="Registered"
          value={selected?.registeredAt ? new Date(selected.registeredAt).toLocaleString() : '—'}
        />
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },

  sectionHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, marginBottom: spacing.md, gap: spacing.md, flexWrap: 'wrap',
  },
  sectionTitle: { ...typography.h3, color: colors.text },

  queue: {
    marginBottom: spacing.lg,
    borderColor: 'rgba(251, 191, 36, 0.45)',
  },
  queueHead: {
    flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md,
    marginBottom: spacing.md, flexWrap: 'wrap',
  },
  queueTitle: { ...typography.h3, color: colors.warning },
  queueHint: { ...typography.small, color: colors.textMuted, marginTop: 2 },

  pendingRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md, flexWrap: 'wrap',
    paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.glassBorder,
  },

  allClear: { ...typography.body, color: colors.success, textAlign: 'center' },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
});
