import React, { useCallback, useEffect, useState } from 'react';
import {
  Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import { GlassCard, GhostButton, Empty, SkeletonRows, Pill } from '../../src/components/Glass';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Student home — section 1.3.
 *
 * Deliberately plain: subjects, what they were last doing, and a way back into
 * it. No streaks, no points, no leaderboard. V1 asked for simple, and every
 * one of those is a feature that has to be maintained and explained to parents.
 */
export default function Home() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [data, setData] = useState(null);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    // Separate awaits: a failing notices count must not blank the whole home
    // screen, and a student with no class still deserves their notices badge.
    try {
      setData(await api.content.mine());
      setError('');
    } catch (err) {
      setError(err.message);
    }
    api.documents.unreadCount()
      .then((r) => setUnread(r.unread))
      .catch(() => setUnread(0));
  }, []);

  useEffect(() => { load(); }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const firstName = user?.fullName?.split(' ')[0] || 'there';
  const continueItem = data?.recent?.find((r) => r.status !== 'completed') || data?.recent?.[0];

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accentFrom} />}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.greeting}>Hello, {firstName}</Text>
          <Text style={styles.sub}>
            {user?.schoolName ? `${user.schoolName} · ` : ''}Class {data?.classLevel ?? user?.classLevel ?? '—'}
          </Text>
        </View>
        <Pressable
          onPress={() => router.push('/(student)/myclass')}
          accessibilityRole="button"
          accessibilityLabel="My class — timetable, dress code and calendar"
          style={styles.bell}
        >
          <Text style={styles.bellIcon}>🏫</Text>
        </Pressable>

        <Pressable
          onPress={() => router.push('/(student)/notices')}
          accessibilityRole="button"
          accessibilityLabel={unread ? `Notices, ${unread} unread` : 'Notices'}
          style={styles.bell}
        >
          <Text style={styles.bellIcon}>📢</Text>
          {unread > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{unread > 9 ? '9+' : unread}</Text>
            </View>
          )}
        </Pressable>
      </View>

      {continueItem && (
        <Pressable
          onPress={() => router.push(`/(student)/item/${continueItem.itemId}`)}
          accessibilityRole="button"
          accessibilityLabel={`Continue learning: ${continueItem.title}`}
        >
          <GlassCard strong style={styles.continueCard}>
            <Text style={styles.continueLabel}>CONTINUE LEARNING</Text>
            <Text style={styles.continueTitle} numberOfLines={2}>{continueItem.title}</Text>
            <Text style={styles.continueSub} numberOfLines={1}>{continueItem.topicTitle}</Text>
          </GlassCard>
        </Pressable>
      )}

      <Text style={styles.sectionTitle}>Subjects</Text>

      {!data && !error && <SkeletonRows rows={4} />}

      {error ? (
        <Empty title="Could not load your subjects" hint={error} />
      ) : data?.subjects?.length === 0 ? (
        <Empty
          title="No subjects yet"
          hint="Your school hasn't published content for your class. Check back soon."
        />
      ) : (
        <View style={styles.grid}>
          {data?.subjects?.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => router.push(`/(student)/node/${s.id}`)}
              style={styles.gridItem}
              accessibilityRole="button"
              accessibilityLabel={`${s.title}, ${s.chapterCount} chapters`}
            >
              <GlassCard>
                <Text style={styles.subjectTitle} numberOfLines={2}>{s.title}</Text>
                <Text style={styles.subjectMeta}>
                  {s.chapterCount} chapter{s.chapterCount === 1 ? '' : 's'}
                </Text>
              </GlassCard>
            </Pressable>
          ))}
        </View>
      )}

      {data?.recent?.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>Recently opened</Text>
          {data.recent.map((r) => (
            <Pressable key={r.itemId} onPress={() => router.push(`/(student)/item/${r.itemId}`)}>
              <GlassCard style={{ marginBottom: spacing.sm }}>
                <View style={styles.recentRow}>
                  <Text style={styles.recentIcon}>{iconFor(r.itemType)}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.recentTitle} numberOfLines={1}>{r.title}</Text>
                    <Text style={styles.recentSub} numberOfLines={1}>{r.topicTitle}</Text>
                  </View>
                  {r.status === 'completed' && <Pill label="Done" tone="active" />}
                </View>
              </GlassCard>
            </Pressable>
          ))}
        </>
      )}

      <GhostButton title="Sign out" onPress={signOut} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

/** Emoji, not an icon font — no extra bundle weight and no missing glyphs. */
function iconFor(type) {
  return { video: '▶', pdf: '📄', image: '🖼', link: '🔗' }[type] || '•';
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.lg, gap: spacing.md },
  greeting: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted, marginTop: 2 },

  continueCard: { marginBottom: spacing.lg },
  continueLabel: { ...typography.caption, color: colors.accentFrom, marginBottom: spacing.xs },
  continueTitle: { ...typography.h2, color: colors.text },
  continueSub: { ...typography.small, color: colors.textMuted, marginTop: 4 },

  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  // Two columns on a phone, more on a tablet — the container is capped at 900
  // so a desktop browser does not stretch cards to the full window width.
  gridItem: { flexGrow: 1, flexBasis: '46%', minWidth: 150 },
  subjectTitle: { ...typography.h3, color: colors.text },
  subjectMeta: { ...typography.small, color: colors.textFaint, marginTop: spacing.xs },

  recentRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  recentIcon: { fontSize: 20, color: colors.accentFrom, width: 26, textAlign: 'center' },
  recentTitle: { ...typography.body, color: colors.text },
  recentSub: { ...typography.small, color: colors.textFaint, marginTop: 2 },

  bell: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
  },
  bellIcon: { fontSize: 18 },
  badge: {
    position: 'absolute', top: 2, right: 2, minWidth: 18, height: 18,
    borderRadius: 9, backgroundColor: colors.danger,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4,
  },
  badgeText: { ...typography.caption, color: '#fff', fontSize: 10 },
});
