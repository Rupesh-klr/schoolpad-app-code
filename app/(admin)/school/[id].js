import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../src/api/client';
import { useAuth } from '../../../src/auth/AuthContext';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote, StatTile,
} from '../../../src/components/Glass';
import { Dropdown, Chevron } from '../../../src/components/Dropdown';
import { Field } from '../../../src/components/Field';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';

/**
 * One school: its classes, its teachers, and its calendar.
 *
 * Three tabs rather than three screens — they are all edited in the same
 * sitting when a term starts, and a teacher has to exist before a class can be
 * assigned one.
 */

const EVENT_TYPES = [
  { value: 'holiday',  label: '🏖 Holiday' },
  { value: 'exam',     label: '📋 Exam' },
  { value: 'event',    label: '🎉 Event' },
  { value: 'activity', label: '⚽ Activity' },
  { value: 'deadline', label: '⏰ Deadline' },
];

export default function SchoolDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { constants } = useAuth();

  const [tab, setTab] = useState('classes');
  const [school, setSchool] = useState(null);
  const [classes, setClasses] = useState(null);
  const [teachers, setTeachers] = useState(null);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [s, c, t] = await Promise.all([
        api.schools.detail(id),
        api.classes.list({ schoolId: id }),
        api.teachers.list({ schoolId: id }),
      ]);
      setSchool(s.school);
      setClasses(c.classes);
      setTeachers(t.teachers);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  const loadEvents = useCallback(async () => {
    try {
      // A wide window rather than the current month — an admin opening the
      // calendar tab wants to see the year they have planned, not just today.
      const year = new Date().getFullYear();
      const r = await api.calendar.range({
        from: `${year}-01-01`, to: `${year + 1}-12-31`, schoolId: id,
      });
      setEvents(r.events);
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (tab === 'calendar') loadEvents(); }, [tab, loadEvents]);

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <GhostButton title="← All schools" onPress={() => router.replace('/(admin)/schools')}
                   style={{ alignSelf: 'flex-start' }} />

      <Text style={styles.title}>{school?.name || 'School'}</Text>
      <Text style={styles.sub}>
        {[school?.code, school?.contactPerson, school?.phone].filter(Boolean).join(' · ')}
      </Text>

      <View style={styles.tiles}>
        <StatTile label="Classes" value={classes?.length ?? '—'} loading={!classes} />
        <StatTile label="Teachers" value={teachers?.length ?? '—'} loading={!teachers} />
        <StatTile label="Students" value={school?.studentCount ?? '—'} loading={!school} />
      </View>

      <View style={styles.tabs}>
        <Tab label="Classes" active={tab === 'classes'} onPress={() => setTab('classes')} />
        <Tab label="Teachers" active={tab === 'teachers'} onPress={() => setTab('teachers')} />
        <Tab label="Calendar" active={tab === 'calendar'} onPress={() => setTab('calendar')} />
      </View>

      <ErrorNote message={error} />

      {tab === 'classes' && (
        <ClassesTab
          schoolId={id} classes={classes} teachers={teachers} constants={constants}
          onChanged={load} onOpen={(c) => router.push(`/(admin)/class/${c.id}`)} setError={setError}
        />
      )}
      {tab === 'teachers' && (
        <TeachersTab schoolId={id} teachers={teachers} onChanged={load} setError={setError} />
      )}
      {tab === 'calendar' && (
        <CalendarTab schoolId={id} classes={classes} events={events} onChanged={loadEvents} setError={setError} />
      )}
    </ScrollView>
  );
}

// ─── Classes ─────────────────────────────────────────────────────────────────

function ClassesTab({ schoolId, classes, teachers, constants, onChanged, onOpen, setError }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    classLevel: null, section: '', title: '', description: '',
    dressCode: '', planOfAction: '', notes: '', classTeacherId: null, room: '',
  });

  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const min = constants?.minClass ?? 2;
  const max = constants?.maxClass ?? 10;
  const levelOptions = Array.from({ length: max - min + 1 }, (_, i) => ({
    value: min + i, label: `Class ${min + i}`,
  }));

  const submit = async () => {
    setSaving(true);
    try {
      await api.classes.create({
        schoolId: Number(schoolId),
        classLevel: f.classLevel,
        section: f.section.trim() || null,
        title: f.title.trim() || null,
        description: f.description.trim() || null,
        dressCode: f.dressCode.trim() || null,
        planOfAction: f.planOfAction.trim() || null,
        notes: f.notes.trim() || null,
        classTeacherId: f.classTeacherId || null,
        room: f.room.trim() || null,
      });
      setF({ classLevel: null, section: '', title: '', description: '',
             dressCode: '', planOfAction: '', notes: '', classTeacherId: null, room: '' });
      setOpen(false);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{open ? 'New class' : 'Add a class'}</Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <View style={styles.row2}>
            <View style={styles.col}>
              <Dropdown label="Class" value={f.classLevel} options={levelOptions}
                        onChange={(v) => set('classLevel', v)} placeholder="Choose" clearable={false} />
            </View>
            <View style={styles.col}>
              <Field label="Section (optional)" value={f.section} onChangeText={(v) => set('section', v)}
                     placeholder="A" autoCapitalize="characters" maxLength={16} />
            </View>
          </View>

          <Field label="Title (optional)" value={f.title} onChangeText={(v) => set('title', v)}
                 placeholder="Class 6-A — Explorers" autoCapitalize="sentences" />
          <Field label="Description" value={f.description} onChangeText={(v) => set('description', v)}
                 placeholder="What this class is about" autoCapitalize="sentences" />
          <Field label="Plan of action" value={f.planOfAction} onChangeText={(v) => set('planOfAction', v)}
                 placeholder="Term 1: … Term 2: …" autoCapitalize="sentences"
                 hint="What the class is working towards. Students and parents see this." />
          <Field label="Dress code" value={f.dressCode} onChangeText={(v) => set('dressCode', v)}
                 placeholder="Navy blue uniform. White shoes on Wednesday." autoCapitalize="sentences" />
          <Field label="Important notes" value={f.notes} onChangeText={(v) => set('notes', v)}
                 placeholder="Anything parents should know" autoCapitalize="sentences" />

          <View style={styles.row2}>
            <View style={styles.col}>
              <Dropdown
                label="Class teacher"
                value={f.classTeacherId}
                options={(teachers || []).map((t) => ({ value: t.id, label: t.fullName, hint: t.subjects }))}
                onChange={(v) => set('classTeacherId', v)}
                placeholder={teachers?.length ? 'None yet' : 'Add a teacher first'}
                disabled={!teachers?.length}
              />
            </View>
            <View style={styles.col}>
              <Field label="Room" value={f.room} onChangeText={(v) => set('room', v)} placeholder="Room 12" />
            </View>
          </View>

          <GlassButton title="Add class" onPress={submit} loading={saving} disabled={!f.classLevel} />
          <GhostButton title="Cancel" onPress={() => setOpen(false)} />
        </GlassCard>
      )}

      {!classes && <SkeletonRows rows={3} />}
      {classes?.length === 0 ? (
        <Empty title="No classes yet" hint="Add one above. Students are matched to it by class level." />
      ) : classes?.map((c) => (
        <Pressable key={c.id} onPress={() => onOpen(c)} accessibilityRole="button"
                   accessibilityLabel={`Open ${c.label}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={styles.name}>{c.title || c.label}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[c.label, c.teacherName || 'No class teacher', c.room].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.sub2}>
                  {c.studentCount ?? 0} students · {c.slotCount ?? 0} periods scheduled
                </Text>
              </View>
              {!c.slotCount ? <Pill label="no timetable" tone="pending" /> : null}
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}
    </>
  );
}

// ─── Teachers ────────────────────────────────────────────────────────────────

function TeachersTab({ schoolId, teachers, onChanged, setError }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({ fullName: '', email: '', phone: '', subjects: '' });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await api.teachers.create({
        schoolId: Number(schoolId),
        fullName: f.fullName.trim(),
        email: f.email.trim() || null,
        phone: f.phone.trim() || null,
        subjects: f.subjects.trim() || null,
      });
      setF({ fullName: '', email: '', phone: '', subjects: '' });
      setOpen(false);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (t) => {
    const go = async () => {
      try { await api.teachers.remove(t.id); await onChanged(); }
      catch (err) { setError(err.message); }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Remove ${t.fullName}? Their periods stay on the timetable with nobody assigned.`)) go();
    } else go();
  };

  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{open ? 'New teacher' : 'Add a teacher'}</Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Field label="Full name" value={f.fullName} onChangeText={(v) => set('fullName', v)}
                 placeholder="Mrs. Latha Krishnan" autoCapitalize="words" />
          <Field label="Subjects" value={f.subjects} onChangeText={(v) => set('subjects', v)}
                 placeholder="Mathematics, Science" autoCapitalize="words" />
          <View style={styles.row2}>
            <View style={styles.col}>
              <Field label="Email" value={f.email} onChangeText={(v) => set('email', v)}
                     placeholder="teacher@school.example" keyboardType="email-address" />
            </View>
            <View style={styles.col}>
              <Field label="Phone" value={f.phone} onChangeText={(v) => set('phone', v)}
                     placeholder="+91…" keyboardType="phone-pad" />
            </View>
          </View>
          <GlassButton title="Add teacher" onPress={submit} loading={saving}
                       disabled={f.fullName.trim().length < 2} />
          <GhostButton title="Cancel" onPress={() => setOpen(false)} />
        </GlassCard>
      )}

      {!teachers && <SkeletonRows rows={3} />}
      {teachers?.length === 0 ? (
        <Empty title="No teachers yet" hint="Add one so classes can have a class teacher." />
      ) : teachers?.map((t) => (
        <GlassCard key={t.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 180 }}>
              <Text style={styles.name}>{t.fullName}</Text>
              <Text style={styles.meta} numberOfLines={1}>{t.subjects || 'No subjects listed'}</Text>
              <Text style={styles.sub2}>
                {[t.email, t.phone].filter(Boolean).join(' · ') || 'No contact details'}
                {` · ${t.periodCount ?? 0} periods across ${t.classCount ?? 0} classes`}
              </Text>
            </View>
            <Pill label={t.status} tone={t.status === 'active' ? 'active' : 'inactive'} />
            <GhostButton title="Remove" onPress={() => remove(t)} />
          </View>
        </GlassCard>
      ))}
    </>
  );
}

// ─── Calendar ────────────────────────────────────────────────────────────────

function CalendarTab({ schoolId, classes, events, onChanged, setError }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [f, setF] = useState({
    title: '', description: '', eventType: 'event',
    scope: 'school', classId: null, startsOn: '', endsOn: '',
  });
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      await api.calendar.create({
        title: f.title.trim(),
        description: f.description.trim() || null,
        eventType: f.eventType,
        scope: f.scope,
        schoolId: f.scope === 'school' ? Number(schoolId) : undefined,
        classId: f.scope === 'class' ? f.classId : undefined,
        startsOn: f.startsOn.trim(),
        endsOn: f.endsOn.trim() || null,
      });
      setF({ title: '', description: '', eventType: 'event', scope: 'school',
             classId: null, startsOn: '', endsOn: '' });
      setOpen(false);
      await onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = async (e) => {
    try { await api.calendar.remove(e.id); await onChanged(); }
    catch (err) { setError(err.message); }
  };

  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
  const ready = f.title.trim().length >= 2 && validDate(f.startsOn)
    && (f.scope !== 'class' || !!f.classId);

  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{open ? 'New event' : 'Add a holiday, exam or event'}</Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Field label="Title" value={f.title} onChangeText={(v) => set('title', v)}
                 placeholder="Half-yearly exams" autoCapitalize="sentences" />
          <Field label="Description (optional)" value={f.description} onChangeText={(v) => set('description', v)}
                 placeholder="Details students and parents should know" autoCapitalize="sentences" />

          <Text style={styles.label}>Type</Text>
          <View style={styles.chipRow}>
            {EVENT_TYPES.map((t) => (
              <Chip key={t.value} label={t.label} active={f.eventType === t.value}
                    onPress={() => set('eventType', t.value)} />
            ))}
          </View>

          <Text style={styles.label}>Who sees it</Text>
          <View style={styles.chipRow}>
            <Chip label="Whole school" active={f.scope === 'school'} onPress={() => set('scope', 'school')} />
            <Chip label="One class" active={f.scope === 'class'} onPress={() => set('scope', 'class')} />
          </View>

          {f.scope === 'class' && (
            <Dropdown
              label="Class"
              value={f.classId}
              options={(classes || []).map((c) => ({ value: c.id, label: c.title || c.label, hint: c.label }))}
              onChange={(v) => set('classId', v)}
              placeholder={classes?.length ? 'Choose a class' : 'No classes yet'}
              disabled={!classes?.length}
              clearable={false}
            />
          )}

          <View style={styles.row2}>
            <View style={styles.col}>
              {/* A plain date field, not a picker. RN has no cross-platform date
                  picker without another native module, and YYYY-MM-DD is what
                  the API takes — so there is nothing to convert or mis-convert. */}
              <Field label="Starts on" value={f.startsOn} onChangeText={(v) => set('startsOn', v)}
                     placeholder="2026-09-10" hint="YYYY-MM-DD" maxLength={10} />
            </View>
            <View style={styles.col}>
              <Field label="Ends on (optional)" value={f.endsOn} onChangeText={(v) => set('endsOn', v)}
                     placeholder="2026-09-18" hint="Leave blank for one day" maxLength={10} />
            </View>
          </View>

          <GlassButton title="Add to calendar" onPress={submit} loading={saving} disabled={!ready} />
          <GhostButton title="Cancel" onPress={() => setOpen(false)} />
        </GlassCard>
      )}

      {!events && <SkeletonRows rows={3} />}
      {events?.length === 0 ? (
        <Empty title="Nothing scheduled" hint="Add holidays, exams and events above." />
      ) : events?.map((e) => (
        <GlassCard key={e.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <View style={styles.dateChip}>
              <Text style={styles.dateDay}>{e.startsOn?.slice(8, 10)}</Text>
              <Text style={styles.dateMon}>{monthName(e.startsOn)}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.name}>{e.title}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {[
                  EVENT_TYPES.find((t) => t.value === e.eventType)?.label,
                  e.scope === 'global' ? 'Everyone' : e.classLabel || e.schoolName,
                  e.endsOn && e.endsOn !== e.startsOn ? `until ${e.endsOn}` : null,
                ].filter(Boolean).join(' · ')}
              </Text>
              {e.description ? <Text style={styles.sub2} numberOfLines={2}>{e.description}</Text> : null}
            </View>
            <GhostButton title="Delete" onPress={() => remove(e)} />
          </View>
        </GlassCard>
      ))}
    </>
  );
}

const monthName = (iso) => {
  if (!iso) return '';
  const m = Number(String(iso).slice(5, 7));
  return ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m] || '';
};

function Tab({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}
               accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && { color: colors.text, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
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
  title: { ...typography.h1, color: colors.text, marginTop: spacing.sm },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },

  tabs: { flexDirection: 'row', backgroundColor: colors.glass, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.glassStrong },
  tabText: { ...typography.small, color: colors.textMuted },

  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  composerTitle: { ...typography.h3, color: colors.text },
  label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs, marginLeft: spacing.xs },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  col: { flexGrow: 1, flexBasis: 200, minWidth: 160 },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  sub2: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textFaint },

  dateChip: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  dateDay: { ...typography.h3, color: colors.text },
  dateMon: { ...typography.caption, color: colors.textMuted, fontSize: 9 },
});
