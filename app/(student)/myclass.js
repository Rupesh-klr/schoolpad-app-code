import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import {
  GlassCard, GhostButton, Empty, SkeletonRows, Pill, ErrorNote,
} from '../../src/components/Glass';
import { Chevron } from '../../src/components/Dropdown';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * My class — for students and parents.
 *
 * Read-only. Everything here is set by the school in the admin dashboard; the
 * point of the screen is that a parent can answer "what does she need tomorrow"
 * without messaging anyone.
 *
 * A parent gets one section per child, since `classes/mine` returns the union
 * of their children's classes.
 */

const TODAY = new Date().getDay() === 0 ? 7 : new Date().getDay();   // ISO: Mon=1..Sun=7

const EVENT_ICON = {
  holiday: '🏖', exam: '📋', event: '🎉', activity: '⚽', deadline: '⏰',
};

export default function MyClass() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isParent } = useAuth();

  const [classes, setClasses] = useState(null);
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [openDay, setOpenDay] = useState(TODAY);

  const load = useCallback(async () => {
    try {
      const r = await api.classes.mine();
      setClasses(r.classes);
      setError('');
    } catch (err) {
      setError(err.message);
    }
    // Independent: a calendar failure must not blank the timetable.
    api.calendar.upcoming(8).then((r) => setEvents(r.events)).catch(() => setEvents([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={colors.accentFrom}
        />
      }
    >
      <Text style={styles.title}>{isParent ? 'My children' : 'My class'}</Text>

      <ErrorNote message={error} />
      {!classes && !error && <SkeletonRows rows={4} />}

      {classes?.length === 0 && (
        <Empty
          title="No class set up yet"
          hint="Your school hasn't published class details. They'll appear here once it does."
        />
      )}

      {classes?.map((c) => (
        <View key={`${c.id}-${c.child?.id || 'me'}`} style={{ marginBottom: spacing.xl }}>
          {c.child && (
            <View style={styles.childHeader}>
              <Text style={styles.childName}>{c.child.fullName}</Text>
              <Pill label={c.label} tone="default" />
            </View>
          )}

          {/* ── Overview ─────────────────────────────────────────────────── */}
          <GlassCard strong style={{ marginBottom: spacing.md }}>
            <Text style={styles.className}>{c.title || c.label}</Text>
            <Text style={styles.classMeta}>
              {[c.schoolName, c.label, c.room].filter(Boolean).join(' · ')}
            </Text>

            {c.teacherName ? (
              <View style={styles.teacherRow}>
                <Text style={styles.teacherIcon}>👩‍🏫</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teacherName}>{c.teacherName}</Text>
                  <Text style={styles.teacherLabel}>Class teacher</Text>
                </View>
              </View>
            ) : null}

            {c.description ? <Text style={styles.body}>{c.description}</Text> : null}
          </GlassCard>

          {c.dressCode ? (
            <InfoCard icon="👕" title="Dress code" body={c.dressCode} tone="accent" />
          ) : null}
          {c.planOfAction ? (
            <InfoCard icon="🎯" title="Plan of action" body={c.planOfAction} />
          ) : null}
          {c.notes ? (
            <InfoCard icon="📌" title="Important notes" body={c.notes} tone="warning" />
          ) : null}

          {/* ── Timetable ────────────────────────────────────────────────── */}
          <Text style={styles.sectionTitle}>Timetable</Text>

          {c.timetable?.every((d) => d.periods.length === 0) ? (
            <Empty title="No timetable yet" hint="Your school hasn't published one." />
          ) : c.timetable?.filter((d) => d.periods.length > 0).map((d) => {
            const isOpen = openDay === d.weekday;
            return (
              <View key={d.weekday} style={{ marginBottom: spacing.xs }}>
                <Pressable
                  onPress={() => setOpenDay(isOpen ? 0 : d.weekday)}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  accessibilityLabel={`${d.dayName}, ${d.periods.length} periods`}
                  style={({ pressed }) => [styles.dayHeader, pressed && { opacity: 0.75 }]}
                >
                  <Chevron open={isOpen} size={14} color={colors.accentFrom} />
                  <Text style={styles.dayName}>{d.dayName}</Text>
                  {d.weekday === TODAY && <Pill label="today" tone="active" />}
                  <Text style={styles.dayCount}>{d.periods.length}</Text>
                </Pressable>

                {isOpen && d.periods.map((p) => (
                  <View key={p.id} style={[styles.period, p.isBreak && styles.periodBreak]}>
                    <View style={styles.timeCol}>
                      <Text style={styles.timeText}>{p.startTime || '—'}</Text>
                      <Text style={styles.timeSub}>{p.endTime || ''}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.subject, p.isBreak && { color: colors.textMuted }]}>
                        {p.isBreak ? `☕ ${p.subject}` : p.subject}
                      </Text>
                      {!p.isBreak && (
                        <Text style={styles.periodMeta} numberOfLines={1}>
                          {[p.teacherName, p.room].filter(Boolean).join(' · ') || 'No teacher assigned'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.periodNo}>{p.periodNo}</Text>
                  </View>
                ))}
              </View>
            );
          })}
        </View>
      ))}

      {/* ── Calendar ───────────────────────────────────────────────────────── */}
      {events.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Coming up</Text>
          {events.map((e) => (
            <GlassCard key={e.id} style={{ marginBottom: spacing.sm }}>
              <View style={styles.eventRow}>
                <View style={styles.dateChip}>
                  <Text style={styles.dateDay}>{String(e.startsOn).slice(8, 10)}</Text>
                  <Text style={styles.dateMon}>{monthName(e.startsOn)}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.eventTitle}>
                    {EVENT_ICON[e.eventType] || '📅'}  {e.title}
                  </Text>
                  <Text style={styles.eventMeta} numberOfLines={1}>
                    {[
                      e.scope === 'global' ? 'Everyone' : e.classLabel || e.schoolName,
                      e.endsOn && e.endsOn !== e.startsOn ? `until ${e.endsOn}` : null,
                    ].filter(Boolean).join(' · ')}
                  </Text>
                  {e.description ? <Text style={styles.eventDesc} numberOfLines={2}>{e.description}</Text> : null}
                </View>
              </View>
            </GlassCard>
          ))}
        </>
      )}

      {!isParent && (
        <GhostButton title="← Back to learning" onPress={() => router.replace('/(student)/home')}
                     style={{ marginTop: spacing.lg }} />
      )}
    </ScrollView>
  );
}

function InfoCard({ icon, title, body, tone }) {
  const border = tone === 'warning' ? 'rgba(251,191,36,0.35)'
    : tone === 'accent' ? 'rgba(109,139,255,0.35)' : colors.glassBorder;
  return (
    <GlassCard style={{ marginBottom: spacing.md, borderColor: border }}>
      <View style={styles.infoHead}>
        <Text style={styles.infoIcon}>{icon}</Text>
        <Text style={styles.infoTitle}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
    </GlassCard>
  );
}

const monthName = (iso) => {
  const m = Number(String(iso || '').slice(5, 7));
  return ['', 'JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'][m] || '';
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },

  childHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  childName: { ...typography.h2, color: colors.text },

  className: { ...typography.h2, color: colors.text },
  classMeta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  body: { ...typography.body, color: colors.textMuted, marginTop: spacing.sm, lineHeight: 21 },

  teacherRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.md,
    paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: colors.glassBorder,
  },
  teacherIcon: { fontSize: 20 },
  teacherName: { ...typography.body, color: colors.text, fontWeight: '600' },
  teacherLabel: { ...typography.caption, color: colors.textFaint },

  infoHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  infoIcon: { fontSize: 17 },
  infoTitle: { ...typography.h3, color: colors.text },

  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },

  dayHeader: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.sm,
    borderRadius: radius.md, backgroundColor: colors.glass,
    borderWidth: 1, borderColor: colors.glassBorder,
  },
  dayName: { ...typography.body, color: colors.text, fontWeight: '600', flex: 1 },
  dayCount: { ...typography.caption, color: colors.textFaint },

  period: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingVertical: spacing.sm, paddingHorizontal: spacing.md,
    marginTop: 2, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.04)',
  },
  periodBreak: { backgroundColor: 'rgba(255,255,255,0.02)' },
  timeCol: { width: 52 },
  timeText: { ...typography.small, color: colors.text, fontFamily: typography.mono },
  timeSub: { ...typography.caption, color: colors.textFaint, fontFamily: typography.mono, fontSize: 10 },
  subject: { ...typography.body, color: colors.text },
  periodMeta: { ...typography.small, color: colors.textFaint, marginTop: 1 },
  periodNo: { ...typography.caption, color: colors.textFaint },

  eventRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  dateChip: {
    width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.accentSoft,
    borderWidth: 1, borderColor: colors.glassBorder, alignItems: 'center', justifyContent: 'center',
  },
  dateDay: { ...typography.h3, color: colors.text },
  dateMon: { ...typography.caption, color: colors.textMuted, fontSize: 9 },
  eventTitle: { ...typography.body, color: colors.text },
  eventMeta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  eventDesc: { ...typography.small, color: colors.textMuted, marginTop: 2 },
});
