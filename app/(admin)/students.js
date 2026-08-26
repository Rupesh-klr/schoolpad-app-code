import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../src/components/Glass';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Student management — section 2.3.
 *
 * List, search, filter by school and class, approve, deactivate, and see the
 * code each student used.
 */
export default function Students() {
  const insets = useSafeAreaInsets();

  const [students, setStudents] = useState(null);
  const [schools, setSchools] = useState([]);
  const [search, setSearch] = useState('');
  const [schoolId, setSchoolId] = useState(null);
  const [classLevel, setClassLevel] = useState(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [total, setTotal] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api.students.list({
        search: search || undefined,
        schoolId: schoolId || undefined,
        classLevel: classLevel || undefined,
        status: status || undefined,
        limit: 50,
      });
      setStudents(r.students);
      setTotal(r.total);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [search, schoolId, classLevel, status]);

  // Debounced, so typing a name is one request when they stop rather than one
  // per keystroke.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => { api.meta.schools().then((r) => setSchools(r.schools || [])).catch(() => {}); }, []);

  const setStudentStatus = async (student, next) => {
    try {
      await api.students.setStatus(student.id, next);
      await load();
    } catch (err) {
      Alert.alert('Could not update', err.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}>
      <Text style={styles.title}>Students</Text>
      <Text style={styles.count}>{total} total</Text>

      <GlassCard style={{ marginBottom: spacing.lg }}>
        <Field
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Name, phone, email or code"
          style={{ marginBottom: spacing.sm }}
        />

        <Text style={styles.label}>Status</Text>
        <View style={styles.chipRow}>
          {['', 'pending', 'active', 'inactive'].map((s) => (
            <Chip key={s || 'all'} label={s || 'All'} active={status === s} onPress={() => setStatus(s)} />
          ))}
        </View>

        <Text style={styles.label}>Class</Text>
        <View style={styles.chipRow}>
          <Chip label="All" active={!classLevel} onPress={() => setClassLevel(null)} />
          {Array.from({ length: 9 }, (_, i) => i + 2).map((c) => (
            <Chip key={c} label={String(c)} active={classLevel === c} onPress={() => setClassLevel(classLevel === c ? null : c)} />
          ))}
        </View>

        {schools.length > 0 && (
          <>
            <Text style={styles.label}>School</Text>
            <View style={styles.chipRow}>
              <Chip label="All" active={!schoolId} onPress={() => setSchoolId(null)} />
              {schools.map((s) => (
                <Chip key={s.id} label={s.name} active={schoolId === s.id} onPress={() => setSchoolId(schoolId === s.id ? null : s.id)} />
              ))}
            </View>
          </>
        )}

        <ErrorNote message={error} />
      </GlassCard>

      {!students && !error && <SkeletonRows rows={5} />}

      {students?.length === 0 ? (
        <Empty title="No students match" hint="Try clearing the filters." />
      ) : students?.map((s) => (
        <GlassCard key={s.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.name}>{s.fullName}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[s.schoolName, s.classLevel ? `Class ${s.classLevel}` : null, s.phone || s.email]
                  .filter(Boolean).join(' · ')}
              </Text>
              <Text style={styles.sub}>
                {s.accessCode ? `Code ${s.accessCode}` : 'No code'}
                {s.lastLoginAt ? ` · last seen ${new Date(s.lastLoginAt).toLocaleDateString()}` : ' · never signed in'}
              </Text>
            </View>

            <Pill label={s.status} tone={s.status} />

            {s.status === 'pending' && (
              <GlassButton title="Approve" onPress={() => setStudentStatus(s, 'active')} style={{ minWidth: 110 }} />
            )}
            {s.status === 'active' && (
              <GhostButton title="Deactivate" onPress={() => setStudentStatus(s, 'inactive')} />
            )}
            {s.status === 'inactive' && (
              <GhostButton title="Reactivate" onPress={() => setStudentStatus(s, 'active')} />
            )}
          </View>
        </GlassCard>
      ))}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button">
      <Text style={[styles.chipText, active && { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  count: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center', maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  sub: { ...typography.small, color: colors.textFaint, marginTop: 2 },
});
