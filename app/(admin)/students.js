import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../src/components/Glass';
import { Dropdown, Chevron } from '../../src/components/Dropdown';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Student management — section 2.3.
 *
 * Search by student *or* school name, narrow by school, then by a class list
 * that comes from the data rather than a hardcoded 2–10. Results are grouped
 * class-wise, and each group collapses.
 *
 * The class options come from the API's `classes` facet, computed without the
 * class filter applied — so choosing a class never removes the other options
 * and strands the admin with no way back.
 */
export default function Students() {
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [schoolId, setSchoolId] = useState(null);
  const [classLevel, setClassLevel] = useState(null);
  const [status, setStatus] = useState(null);

  // Which class groups are collapsed. Absent = expanded, so a newly appearing
  // class is visible by default — an admin searching for a student should not
  // have to discover that the match was hidden inside a folded section.
  const [collapsed, setCollapsed] = useState({});

  const load = useCallback(async () => {
    try {
      const r = await api.students.list({
        search: search || undefined,
        schoolId: schoolId || undefined,
        classLevel: classLevel || undefined,
        status: status || undefined,
        limit: 200,
      });
      setData(r);
      setError('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [search, schoolId, classLevel, status]);

  // Debounced, so typing a name is one request when they stop rather than one
  // per keystroke.
  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  useEffect(() => {
    api.meta.schools().then((r) => setSchools(r.schools || [])).catch(() => setSchools([]));
  }, []);

  /**
   * Clear the class when the school changes.
   *
   * Class 8 at one school and class 8 at another are different sets of
   * students; carrying the selection across would silently show an empty list
   * that looks like a bug.
   */
  const onSchoolChange = (v) => { setSchoolId(v); setClassLevel(null); };

  const schoolOptions = useMemo(
    () => schools.map((s) => ({ value: s.id, label: s.name, hint: s.code })),
    [schools],
  );

  const classOptions = useMemo(
    () => (data?.classes || []).map((c) => ({
      value: c.classLevel,
      label: c.classLevel ? `Class ${c.classLevel}` : 'No class set',
      hint: `${c.count} student${c.count === 1 ? '' : 's'}`,
    })),
    [data],
  );

  /** Group the page of students by class, preserving the server's ordering. */
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of data?.students || []) {
      const key = s.classLevel ?? 'none';
      if (!map.has(key)) {
        map.set(key, { key, classLevel: s.classLevel, students: [] });
      }
      map.get(key).students.push(s);
    }
    return [...map.values()];
  }, [data]);

  const multipleClasses = groups.length > 1;
  const allCollapsed = multipleClasses && groups.every((g) => collapsed[g.key]);

  const toggleAll = () => {
    setCollapsed(allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.key, true])));
  };

  const setStudentStatus = async (student, next) => {
    try {
      await api.students.setStatus(student.id, next);
      await load();
    } catch (err) {
      Alert.alert('Could not update', err.message);
    }
  };

  const activeFilters = [
    schoolId && schools.find((s) => s.id === schoolId)?.name,
    classLevel && `Class ${classLevel}`,
    status,
    search && `“${search}”`,
  ].filter(Boolean);

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Students</Text>
      <Text style={styles.count}>
        {data ? `${data.total} student${data.total === 1 ? '' : 's'}` : 'Loading…'}
        {activeFilters.length ? ` · ${activeFilters.join(' · ')}` : ''}
      </Text>

      {/* ── Filters ────────────────────────────────────────────────────────── */}
      <GlassCard style={{ marginBottom: spacing.lg }}>
        <Field
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Student name, school, phone, email or code"
          hint="Searches the school name too — no need to pick it below first."
          style={{ marginBottom: spacing.md }}
        />

        <View style={styles.filterRow}>
          <View style={styles.filterCol}>
            <Dropdown
              label="School"
              value={schoolId}
              options={schoolOptions}
              onChange={onSchoolChange}
              placeholder="All schools"
            />
          </View>

          <View style={styles.filterCol}>
            <Dropdown
              label="Class"
              value={classLevel}
              options={classOptions}
              onChange={setClassLevel}
              placeholder={classOptions.length ? 'All classes' : 'No classes yet'}
              disabled={classOptions.length === 0}
            />
          </View>
        </View>

        <Text style={styles.label}>Status</Text>
        <View style={styles.chipRow}>
          {[null, 'pending', 'active', 'inactive'].map((s) => (
            <Chip
              key={s || 'all'}
              label={s || 'All'}
              active={status === s}
              onPress={() => setStatus(s)}
            />
          ))}
        </View>

        {activeFilters.length > 0 && (
          <GhostButton
            title="Clear filters"
            onPress={() => { setSearch(''); setSchoolId(null); setClassLevel(null); setStatus(null); }}
          />
        )}

        <ErrorNote message={error} />
      </GlassCard>

      {/* ── Results, grouped class-wise ────────────────────────────────────── */}
      {multipleClasses && (
        <Pressable onPress={toggleAll} style={styles.toggleAll} accessibilityRole="button">
          <Text style={styles.toggleAllText}>
            {allCollapsed ? 'Expand all' : 'Collapse all'} · {groups.length} classes
          </Text>
        </Pressable>
      )}

      {loading && !data && <SkeletonRows rows={5} />}

      {data && groups.length === 0 && (
        <Empty
          title="No students match"
          hint={activeFilters.length ? 'Try clearing a filter.' : 'Registrations will appear here.'}
        />
      )}

      {groups.map((g) => {
        const isOpen = !collapsed[g.key];
        return (
          <View key={g.key} style={{ marginBottom: spacing.md }}>
            <Pressable
              onPress={() => setCollapsed((c) => ({ ...c, [g.key]: isOpen }))}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
              accessibilityLabel={`${g.classLevel ? `Class ${g.classLevel}` : 'No class set'}, ${g.students.length} students`}
              style={({ pressed }) => [styles.groupHeader, pressed && { opacity: 0.75 }]}
            >
              <Chevron open={isOpen} size={15} color={colors.accentFrom} />
              <Text style={styles.groupTitle}>
                {g.classLevel ? `Class ${g.classLevel}` : 'No class set'}
              </Text>
              <View style={styles.groupCount}>
                <Text style={styles.groupCountText}>{g.students.length}</Text>
              </View>
            </Pressable>

            {isOpen && g.students.map((s) => (
              <GlassCard key={s.id} style={{ marginBottom: spacing.sm }}>
                <View style={styles.row}>
                  <View style={{ flex: 1, minWidth: 160 }}>
                    <Text style={styles.name}>{s.fullName}</Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {[s.schoolName || 'No school', s.section && `Sec ${s.section}`, s.phone || s.email]
                        .filter(Boolean).join(' · ')}
                    </Text>
                    <Text style={styles.sub}>
                      {s.accessCode ? `Code ${s.accessCode}` : 'No code'}
                      {s.lastLoginAt
                        ? ` · last seen ${new Date(s.lastLoginAt).toLocaleDateString()}`
                        : ' · never signed in'}
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
          </View>
        );
      })}

      {data && data.total > data.students.length && (
        <Text style={styles.truncated}>
          Showing {data.students.length} of {data.total}. Narrow the filters to see the rest.
        </Text>
      )}
    </ScrollView>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  count: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  label: {
    ...typography.caption, color: colors.textMuted, textTransform: 'uppercase',
    marginBottom: spacing.xs, marginLeft: spacing.xs,
  },

  // Side by side when there is room, stacked on a phone.
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  filterCol: { flexGrow: 1, flexBasis: 200, minWidth: 180 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.sm },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center', maxWidth: 200,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted, textTransform: 'capitalize' },

  toggleAll: { alignSelf: 'flex-end', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  toggleAllText: { ...typography.small, color: colors.accentFrom },

  groupHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.xs, marginBottom: spacing.xs,
  },
  groupTitle: { ...typography.h3, color: colors.text, flex: 1 },
  groupCount: {
    minWidth: 30, paddingHorizontal: spacing.sm, paddingVertical: 2,
    borderRadius: radius.pill, backgroundColor: colors.glassStrong, alignItems: 'center',
  },
  groupCountText: { ...typography.caption, color: colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  sub: { ...typography.small, color: colors.textFaint, marginTop: 2 },

  truncated: { ...typography.small, color: colors.textFaint, textAlign: 'center', marginTop: spacing.md },
});
