import React, { useCallback, useEffect, useState } from 'react';
import {
  Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import {
  GlassCard, GhostButton, Empty, SkeletonRows, Pill, ErrorNote,
} from '../../src/components/Glass';
import { formatBytes } from '../../src/components/FilePicker';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Notices, for students and parents.
 *
 * The audience filter runs on the server, so this screen shows whatever the
 * feed returns without deciding anything. Opening a notice marks it read —
 * requiring a separate "mark as read" tap is a step nobody performs, which
 * leaves every badge permanently lit.
 */

const CATEGORIES = [
  { value: null,        label: 'All' },
  { value: 'important', label: '⚠️ Important' },
  { value: 'notice',    label: '📢 Notices' },
  { value: 'gk',        label: '🧠 GK' },
  { value: 'homework',  label: '📝 Homework' },
];

const iconFor = (c) => ({
  gk: '🧠', notice: '📢', important: '⚠️', homework: '📝', general: '📄',
}[c] || '📄');

export default function Notices() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [docs, setDocs] = useState(null);
  const [category, setCategory] = useState(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.documents.feed({
        category: category || undefined,
        unreadOnly: unreadOnly ? 'true' : undefined,
        limit: 100,
      });
      setDocs(r.documents);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [category, unreadOnly]);

  useEffect(() => { load(); }, [load]);

  const open = async (doc) => {
    // Mark read first, but never let a failed receipt stop the open — the point
    // of the tap is to read the thing.
    if (!doc.isRead) {
      api.documents.markRead(doc.id)
        .then(() => setDocs((list) => list.map((d) => (d.id === doc.id ? { ...d, isRead: true } : d))))
        .catch(() => {});
    }
    const url = doc.url?.startsWith('/') ? `${api.baseUrl}${doc.url}` : doc.url;
    if (url) Linking.openURL(url).catch(() => setError('Could not open that link.'));
  };

  const unread = docs?.filter((d) => !d.isRead).length ?? 0;

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
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Notices</Text>
          <Text style={styles.sub}>
            {unread > 0 ? `${unread} unread` : 'You are up to date'}
          </Text>
        </View>
        {unread > 0 && <Pill label={String(unread)} tone="pending" />}
      </View>

      <View style={styles.chipRow}>
        {CATEGORIES.map((c) => (
          <Chip
            key={c.value || 'all'}
            label={c.label}
            active={category === c.value}
            onPress={() => setCategory(c.value)}
          />
        ))}
        <Chip
          label={unreadOnly ? '● Unread only' : '○ Unread only'}
          active={unreadOnly}
          onPress={() => setUnreadOnly((u) => !u)}
        />
      </View>

      <ErrorNote message={error} />

      {!docs && !error && <SkeletonRows rows={4} />}

      {docs?.length === 0 ? (
        <Empty
          title={unreadOnly ? 'Nothing unread' : 'No notices yet'}
          hint={unreadOnly ? 'You have read everything.' : 'Anything your school shares will appear here.'}
        />
      ) : docs?.map((d) => (
        <Pressable key={d.id} onPress={() => open(d)} accessibilityRole="button"
                   accessibilityLabel={`${d.title}${d.isRead ? '' : ', unread'}`}>
          <GlassCard strong={!d.isRead} style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              {/* A dot, not bold text — bold on an unread row makes the list
                  jump as items are read. */}
              <View style={styles.iconWrap}>
                <Text style={styles.icon}>{iconFor(d.category)}</Text>
                {!d.isRead && <View style={styles.dot} />}
              </View>

              <View style={{ flex: 1 }}>
                <Text style={[styles.rowTitle, !d.isRead && { fontWeight: '700' }]} numberOfLines={2}>
                  {d.title}
                </Text>
                {d.description ? (
                  <Text style={styles.rowDesc} numberOfLines={2}>{d.description}</Text>
                ) : null}
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[
                    d.category === 'general' ? null : d.category.toUpperCase(),
                    d.sourceType === 'file' ? formatBytes(d.sizeBytes) : 'Link',
                    d.publishedAt ? new Date(d.publishedAt).toLocaleDateString() : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>

              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}

      <GhostButton title="← Back to learning" onPress={() => router.replace('/(student)/home')}
                   style={{ marginTop: spacing.lg }} />
    </ScrollView>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}
               accessibilityRole="button" accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textMuted, marginTop: 2 },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.lg },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center',
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 32, alignItems: 'center' },
  icon: { fontSize: 20 },
  dot: {
    position: 'absolute', top: -2, right: 0,
    width: 9, height: 9, borderRadius: 5, backgroundColor: colors.accentFrom,
  },
  rowTitle: { ...typography.body, color: colors.text },
  rowDesc: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  rowMeta: { ...typography.caption, color: colors.textFaint, marginTop: 4 },
  chevron: { fontSize: 22, color: colors.textFaint },
});
