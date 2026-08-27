import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../src/api/client';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../../src/components/Glass';
import { Dropdown, Chevron } from '../../../src/components/Dropdown';
import { Field } from '../../../src/components/Field';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';

/**
 * One class: its details and its weekly timetable.
 *
 * The timetable is edited as a whole week and saved in one call — the API
 * replaces every slot in a transaction, so a dropped connection leaves either
 * the old week or the new one, never half of each.
 */

const DAYS = [
  { weekday: 1, short: 'Mon' }, { weekday: 2, short: 'Tue' }, { weekday: 3, short: 'Wed' },
  { weekday: 4, short: 'Thu' }, { weekday: 5, short: 'Fri' }, { weekday: 6, short: 'Sat' },
  { weekday: 7, short: 'Sun' },
];

const DEFAULT_PERIODS = 8;

export default function ClassDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [teachers, setTeachers] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [tab, setTab] = useState('details');

  // Details form
  const [f, setF] = useState(null);
  const [savingDetails, setSavingDetails] = useState(false);

  // Timetable grid: { "weekday-period": { subject, startTime, endTime, teacherId, room, isBreak } }
  const [grid, setGrid] = useState({});
  const [periods, setPeriods] = useState(DEFAULT_PERIODS);
  const [day, setDay] = useState(1);
  const [savingWeek, setSavingWeek] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.classes.detail(id);
      setData(r);
      setF({
        title: r.class.title || '', description: r.class.description || '',
        dressCode: r.class.dressCode || '', planOfAction: r.class.planOfAction || '',
        notes: r.class.notes || '', room: r.class.room || '',
        classTeacherId: r.class.classTeacherId || null,
      });

      const next = {};
      let maxPeriod = DEFAULT_PERIODS;
      for (const d of r.timetable) {
        for (const p of d.periods) {
          next[`${d.weekday}-${p.periodNo}`] = {
            subject: p.subject, startTime: p.startTime || '', endTime: p.endTime || '',
            teacherId: p.teacherId, room: p.room || '', isBreak: p.isBreak,
          };
          if (p.periodNo > maxPeriod) maxPeriod = p.periodNo;
        }
      }
      setGrid(next);
      setPeriods(maxPeriod);

      const t = await api.teachers.list({ schoolId: r.class.schoolId });
      setTeachers(t.teachers);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const cell = (wd, p) => grid[`${wd}-${p}`] || {};
  const setCell = (wd, p, patch) =>
    setGrid((g) => ({ ...g, [`${wd}-${p}`]: { ...(g[`${wd}-${p}`] || {}), ...patch } }));

  const saveDetails = async () => {
    setSavingDetails(true); setNotice('');
    try {
      await api.classes.update(id, {
        title: f.title.trim() || null,
        description: f.description.trim() || null,
        dressCode: f.dressCode.trim() || null,
        planOfAction: f.planOfAction.trim() || null,
        notes: f.notes.trim() || null,
        room: f.room.trim() || null,
        classTeacherId: f.classTeacherId || null,
      });
      setNotice('Saved. Students and parents see this immediately.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingDetails(false);
    }
  };

  const saveWeek = async () => {
    setSavingWeek(true); setNotice('');
    try {
      const slots = [];
      for (const d of DAYS) {
        for (let p = 1; p <= periods; p += 1) {
          const c = cell(d.weekday, p);
          // A blank subject means "free period" — the API drops it rather than
          // storing an empty row the grid would have to filter out on read.
          if (!c.subject?.trim() && !c.isBreak) continue;
          slots.push({
            weekday: d.weekday, periodNo: p,
            subject: c.subject?.trim() || '',
            startTime: c.startTime || null, endTime: c.endTime || null,
            teacherId: c.teacherId || null, room: c.room?.trim() || null,
            isBreak: !!c.isBreak,
          });
        }
      }
      const r = await api.classes.saveTimetable(id, slots);
      setNotice(`Timetable saved — ${r.saved} periods across the week.`);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingWeek(false);
    }
  };

  /** Copy one day's periods onto every weekday — most schools repeat Mon–Fri. */
  const copyToWeekdays = () => {
    setGrid((g) => {
      const next = { ...g };
      for (let p = 1; p <= periods; p += 1) {
        const src = g[`${day}-${p}`];
        for (const d of DAYS.slice(0, 5)) {
          if (d.weekday === day) continue;
          if (src) next[`${d.weekday}-${p}`] = { ...src };
          else delete next[`${d.weekday}-${p}`];
        }
      }
      return next;
    });
    setNotice('Copied to Monday–Friday. Not saved yet.');
  };

  const teacherOptions = teachers.map((t) => ({ value: t.id, label: t.fullName, hint: t.subjects }));
  const cls = data?.class;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <GhostButton
        title="← Back to school"
        onPress={() => router.replace(cls ? `/(admin)/school/${cls.schoolId}` : '/(admin)/schools')}
        style={{ alignSelf: 'flex-start' }}
      />

      <Text style={styles.title}>{cls?.title || cls?.label || 'Class'}</Text>
      <Text style={styles.sub}>
        {[cls?.schoolName, cls?.label, cls?.teacherName, cls?.room].filter(Boolean).join(' · ')}
      </Text>

      <View style={styles.tabs}>
        <Tab label="Details" active={tab === 'details'} onPress={() => setTab('details')} />
        <Tab label="Timetable" active={tab === 'timetable'} onPress={() => setTab('timetable')} />
        <Tab label={`Students (${data?.students?.length ?? 0})`} active={tab === 'students'} onPress={() => setTab('students')} />
      </View>

      <ErrorNote message={error} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {!data && <SkeletonRows rows={4} />}

      {tab === 'details' && f && (
        <GlassCard>
          <Field label="Title" value={f.title} onChangeText={(v) => setF({ ...f, title: v })}
                 placeholder="Class 6-A — Explorers" autoCapitalize="sentences" />
          <Field label="Description" value={f.description} onChangeText={(v) => setF({ ...f, description: v })}
                 placeholder="What this class is about" autoCapitalize="sentences" />
          <Field label="Plan of action" value={f.planOfAction} onChangeText={(v) => setF({ ...f, planOfAction: v })}
                 placeholder="Term 1: … Term 2: …" autoCapitalize="sentences"
                 hint="Students and parents see this on their class screen." />
          <Field label="Dress code" value={f.dressCode} onChangeText={(v) => setF({ ...f, dressCode: v })}
                 placeholder="Navy blue uniform. White shoes on Wednesday." autoCapitalize="sentences" />
          <Field label="Important notes" value={f.notes} onChangeText={(v) => setF({ ...f, notes: v })}
                 placeholder="Anything parents should know" autoCapitalize="sentences" />

          <View style={styles.row2}>
            <View style={styles.col}>
              <Dropdown label="Class teacher" value={f.classTeacherId} options={teacherOptions}
                        onChange={(v) => setF({ ...f, classTeacherId: v })}
                        placeholder={teachers.length ? 'None' : 'Add a teacher first'}
                        disabled={!teachers.length} />
            </View>
            <View style={styles.col}>
              <Field label="Room" value={f.room} onChangeText={(v) => setF({ ...f, room: v })} placeholder="Room 12" />
            </View>
          </View>

          <GlassButton title="Save details" onPress={saveDetails} loading={savingDetails} />
        </GlassCard>
      )}

      {tab === 'timetable' && (
        <>
          <View style={styles.dayRow}>
            {DAYS.map((d) => {
              const filled = Array.from({ length: periods }, (_, i) => cell(d.weekday, i + 1))
                .filter((c) => c.subject?.trim() || c.isBreak).length;
              return (
                <Pressable key={d.weekday} onPress={() => setDay(d.weekday)}
                           style={[styles.dayTab, day === d.weekday && styles.dayTabActive]}
                           accessibilityRole="tab" accessibilityState={{ selected: day === d.weekday }}>
                  <Text style={[styles.dayText, day === d.weekday && { color: colors.text, fontWeight: '700' }]}>
                    {d.short}
                  </Text>
                  <Text style={styles.dayCount}>{filled || '–'}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={styles.toolbar}>
            <GhostButton title="− period" onPress={() => setPeriods((p) => Math.max(1, p - 1))} />
            <Text style={styles.periodCount}>{periods} periods</Text>
            <GhostButton title="+ period" onPress={() => setPeriods((p) => Math.min(20, p + 1))} />
            <GhostButton title="Copy to Mon–Fri" onPress={copyToWeekdays} />
          </View>

          {Array.from({ length: periods }, (_, i) => i + 1).map((p) => {
            const c = cell(day, p);
            return (
              <GlassCard key={p} style={{ marginBottom: spacing.sm }}>
                <View style={styles.periodHead}>
                  <View style={styles.periodBadge}>
                    <Text style={styles.periodBadgeText}>{p}</Text>
                  </View>
                  <Pressable onPress={() => setCell(day, p, { isBreak: !c.isBreak })}
                             style={[styles.breakToggle, c.isBreak && styles.breakToggleOn]}
                             accessibilityRole="switch" accessibilityState={{ checked: !!c.isBreak }}>
                    <Text style={[styles.breakText, c.isBreak && { color: colors.text }]}>
                      {c.isBreak ? '☕ Break' : 'Mark as break'}
                    </Text>
                  </Pressable>
                </View>

                <Field
                  label={c.isBreak ? 'Label' : 'Subject'}
                  value={c.subject || ''}
                  onChangeText={(v) => setCell(day, p, { subject: v })}
                  placeholder={c.isBreak ? 'Lunch' : 'Mathematics — leave blank for a free period'}
                  autoCapitalize="words"
                />

                <View style={styles.row2}>
                  <View style={styles.col}>
                    <Field label="Start" value={c.startTime || ''} onChangeText={(v) => setCell(day, p, { startTime: v })}
                           placeholder="09:00" hint="HH:MM" maxLength={5} />
                  </View>
                  <View style={styles.col}>
                    <Field label="End" value={c.endTime || ''} onChangeText={(v) => setCell(day, p, { endTime: v })}
                           placeholder="09:45" hint="HH:MM" maxLength={5} />
                  </View>
                </View>

                {!c.isBreak && (
                  <View style={styles.row2}>
                    <View style={styles.col}>
                      <Dropdown label="Teacher" value={c.teacherId} options={teacherOptions}
                                onChange={(v) => setCell(day, p, { teacherId: v })}
                                placeholder={teachers.length ? 'Unassigned' : 'No teachers yet'}
                                disabled={!teachers.length} />
                    </View>
                    <View style={styles.col}>
                      <Field label="Room" value={c.room || ''} onChangeText={(v) => setCell(day, p, { room: v })}
                             placeholder="Room 12" />
                    </View>
                  </View>
                )}
              </GlassCard>
            );
          })}

          <GlassButton title="Save the whole week" onPress={saveWeek} loading={savingWeek} />
          <Text style={styles.hint}>
            Saves every day at once. Blank subjects are dropped as free periods.
          </Text>
        </>
      )}

      {tab === 'students' && (
        data?.students?.length === 0 ? (
          <Empty title="Nobody in this class yet"
                 hint={`Students are matched by class level — anyone set to ${cls?.label} at this school appears here.`} />
        ) : data?.students?.map((s) => (
          <GlassCard key={s.id} style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <Text style={[styles.name, { flex: 1 }]}>{s.fullName}</Text>
              <Pill label={s.status} tone={s.status} />
            </View>
          </GlassCard>
        ))
      )}
    </ScrollView>
  );
}

function Tab({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}
               accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && { color: colors.text, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.sm },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },

  tabs: { flexDirection: 'row', backgroundColor: colors.glass, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.glassStrong },
  tabText: { ...typography.small, color: colors.textMuted },

  dayRow: { flexDirection: 'row', gap: 4, marginBottom: spacing.md, flexWrap: 'wrap' },
  dayTab: {
    flexGrow: 1, minWidth: 48, paddingVertical: spacing.sm, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass, alignItems: 'center',
  },
  dayTabActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  dayText: { ...typography.small, color: colors.textMuted },
  dayCount: { ...typography.caption, color: colors.textFaint, fontSize: 10 },

  toolbar: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.md, flexWrap: 'wrap' },
  periodCount: { ...typography.small, color: colors.textMuted },

  periodHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  periodBadge: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.accentSoft,
    alignItems: 'center', justifyContent: 'center',
  },
  periodBadgeText: { ...typography.small, color: colors.text, fontWeight: '700' },
  breakToggle: {
    paddingHorizontal: spacing.md, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
  },
  breakToggleOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  breakText: { ...typography.caption, color: colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  col: { flexGrow: 1, flexBasis: 160, minWidth: 130 },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },
  hint: { ...typography.small, color: colors.textFaint, textAlign: 'center', marginTop: spacing.sm },
});
