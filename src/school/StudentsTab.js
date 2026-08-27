import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { api } from '../api/client';
import {
  GlassCard, GhostButton, Pill, Empty, SkeletonRows,
} from '../components/Glass';
import { Dropdown, Chevron } from '../components/Dropdown';
import { Sheet, SheetRow, SheetDetail } from '../components/Sheet';
import { Field } from '../components/Field';
import { colors, radius, spacing, typography } from '../theme/tokens';

/**
 * Students of one school.
 *
 * Grouped class-wise with collapsible sections, and per-student actions behind
 * a sheet. Same shape as the global Students screen, but the school is fixed —
 * an admin who opened Greenwood should not have to re-select it.
 */
export function StudentsTab({ schoolId, schoolName, setError }) {
  const [data, setData] = useState(null);
  const [search, setSearch] = useState('');
  const [classLevel, setClassLevel] = useState(null);
  const [status, setStatus] = useState(null);
  const [collapsed, setCollapsed] = useState({});
  const [selected, setSelected] = useState(null);
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.students.list({
        schoolId,
        search: search || undefined,
        classLevel: classLevel || undefined,
        status: status || undefined,
        limit: 200,
      });
      setData(r);
    } catch (err) {
      setError(err.message);
    }
  }, [schoolId, search, classLevel, status, setError]);

  // Debounced, so typing a name is one request when they stop.
  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const classOptions = useMemo(
    () => (data?.classes || []).map((c) => ({
      value: c.classLevel,
      label: c.classLevel ? `Class ${c.classLevel}` : 'No class set',
      hint: `${c.count} student${c.count === 1 ? '' : 's'}`,
    })),
    [data],
  );

  /** Group the page by class, preserving the server's ordering. */
  const groups = useMemo(() => {
    const map = new Map();
    for (const s of data?.students || []) {
      const key = s.classLevel ?? 'none';
      if (!map.has(key)) map.set(key, { key, classLevel: s.classLevel, students: [] });
      map.get(key).students.push(s);
    }
    return [...map.values()];
  }, [data]);

  const many = groups.length > 1;
  const allCollapsed = many && groups.every((g) => collapsed[g.key]);

  const change = async (student, next) => {
    try {
      await api.students.setStatus(student.id, next);
      setSelected(null);
      setNotice(`${student.fullName} is now ${next}.`);
      await load();
    } catch (err) {
      setError(err.message);
      setSelected(null);
    }
  };

  return (
    <>
      <GlassCard style={{ marginBottom: spacing.md }}>
        <Field
          label="Search"
          value={search}
          onChangeText={setSearch}
          placeholder="Name, phone, email or code"
          style={{ marginBottom: spacing.sm }}
        />

        <View style={styles.row2}>
          <View style={styles.col}>
            <Dropdown
              label="Class"
              value={classLevel}
              options={classOptions}
              onChange={setClassLevel}
              placeholder={classOptions.length ? 'All classes' : 'No students yet'}
              disabled={!classOptions.length}
            />
          </View>
          <View style={styles.col}>
            <Dropdown
              label="Status"
              value={status}
              options={[
                { value: 'pending', label: 'Pending approval' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Deactivated' },
              ]}
              onChange={setStatus}
              placeholder="Any status"
            />
          </View>
        </View>

        <Text style={styles.count}>
          {data ? `${data.total} student${data.total === 1 ? '' : 's'} at ${schoolName}` : 'Loading…'}
        </Text>
      </GlassCard>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {many && (
        <Pressable
          onPress={() => setCollapsed(allCollapsed ? {} : Object.fromEntries(groups.map((g) => [g.key, true])))}
          style={styles.toggleAll}
          accessibilityRole="button"
        >
          <Text style={styles.toggleAllText}>
            {allCollapsed ? 'Expand all' : 'Collapse all'} · {groups.length} classes
          </Text>
        </Pressable>
      )}

      {!data && <SkeletonRows rows={4} />}

      {data && groups.length === 0 && (
        <Empty
          title="No students match"
          hint={search || classLevel || status ? 'Try clearing a filter.' : 'Nobody has registered for this school yet.'}
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
              <Pressable key={s.id} onPress={() => setSelected(s)} accessibilityRole="button"
                         accessibilityLabel={`${s.fullName}, ${s.status}`}>
                <GlassCard style={{ marginBottom: spacing.sm }}>
                  <View style={styles.row}>
                    <View style={{ flex: 1, minWidth: 150 }}>
                      <Text style={styles.name}>{s.fullName}</Text>
                      <Text style={styles.meta} numberOfLines={1}>
                        {[s.section && `Sec ${s.section}`, s.phone || s.email].filter(Boolean).join(' · ')}
                      </Text>
                      <Text style={styles.sub}>
                        {s.accessCode ? `Code ${s.accessCode}` : 'No code'}
                        {s.lastLoginAt
                          ? ` · last seen ${new Date(s.lastLoginAt).toLocaleDateString()}`
                          : ' · never signed in'}
                      </Text>
                    </View>
                    <Pill label={s.status} tone={s.status} />
                    <Text style={styles.chevron}>›</Text>
                  </View>
                </GlassCard>
              </Pressable>
            ))}
          </View>
        );
      })}

      {/* ── Per-student actions ────────────────────────────────────────────── */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.fullName}
        subtitle={selected
          ? [schoolName, selected.classLevel ? `Class ${selected.classLevel}` : 'No class'].join(' · ')
          : ''}
      >
        {selected?.status === 'pending' && (
          <SheetRow icon="✅" tone="success" label="Approve this student"
                    hint="They get access to their class content immediately."
                    onPress={() => change(selected, 'active')} />
        )}
        {selected?.status === 'active' && (
          <SheetRow icon="⛔" tone="danger" label="Deactivate this student"
                    hint="Signs them out everywhere and blocks content until reactivated."
                    onPress={() => change(selected, 'inactive')} />
        )}
        {selected?.status === 'inactive' && (
          <SheetRow icon="✅" tone="success" label="Reactivate this student"
                    onPress={() => change(selected, 'active')} />
        )}

        <SheetDetail label="Status" value={selected?.status} />
        <SheetDetail label="Contact" value={selected?.phone || selected?.email} />
        <SheetDetail label="Access code" value={selected?.accessCode || 'None — approved by an admin'} />
        <SheetDetail label="Registered"
                     value={selected?.registeredAt ? new Date(selected.registeredAt).toLocaleDateString() : '—'} />
        <SheetDetail label="Last seen"
                     value={selected?.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleString() : 'Never signed in'} />
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  col: { flexGrow: 1, flexBasis: 160, minWidth: 140 },
  count: { ...typography.small, color: colors.textFaint },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },

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
  chevron: { fontSize: 22, color: colors.textFaint },
});
