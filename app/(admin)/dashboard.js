import React, { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { GlassCard, StatTile, Pill, Empty } from '../../src/components/Glass';
import { colors, spacing, typography } from '../../src/theme/tokens';

/** Dashboard tiles — section 2.1. */
export default function Dashboard() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api.admin.dashboard()); setError(''); }
    catch (err) { setError(err.message); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loading = !data && !error;

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

      {error ? <Empty title="Could not load the dashboard" hint={error} /> : (
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

          <Text style={styles.sectionTitle}>Latest registrations</Text>

          {data?.recentStudents?.length === 0 ? (
            <Empty title="No students yet" hint="Registrations will appear here as they arrive." />
          ) : (
            data?.recentStudents?.map((s) => (
              <GlassCard key={s.id} style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name} numberOfLines={1}>{s.fullName}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[s.schoolName, s.classLevel ? `Class ${s.classLevel}` : null]
                        .filter(Boolean).join(' · ') || 'No school set'}
                    </Text>
                  </View>
                  <Pill label={s.status} tone={s.status} />
                </View>
              </GlassCard>
            ))
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.sm },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  name: { ...typography.body, color: colors.text },
  meta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
});
