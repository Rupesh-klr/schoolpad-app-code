import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../../src/api/client';
import {
  GlassCard, GhostButton, Empty, SkeletonRows, Pill, ErrorNote,
} from '../../../src/components/Glass';
import { colors, radius, spacing, typography } from '../../../src/theme/tokens';

/**
 * Browsing below a subject — chapters, topics, and the files in them.
 *
 * One screen for every level. The API returns children and items together, so
 * a chapter with a stray PDF attached directly to it renders correctly without
 * a special case.
 */

const ITEM_ICON = { video: '▶', pdf: '📄', image: '🖼', link: '🔗' };

export default function BrowseNode() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.content.children(id));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const children = data?.children || [];
  const items = data?.items || [];
  const done = items.filter((i) => i.progressStatus === 'completed').length;

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
      <GhostButton title="← Back" onPress={() => router.back()} style={{ alignSelf: 'flex-start' }} />

      <Text style={styles.title}>{data?.node?.title || 'Loading…'}</Text>
      {data?.node?.description ? (
        <Text style={styles.description}>{data.node.description}</Text>
      ) : null}

      {items.length > 0 && (
        <View style={styles.progressRow}>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round((done / items.length) * 100)}%` }]} />
          </View>
          <Text style={styles.progressText}>{done}/{items.length}</Text>
        </View>
      )}

      <ErrorNote message={error} />
      {!data && !error && <SkeletonRows rows={4} />}

      {data && children.length === 0 && items.length === 0 && (
        <Empty title="Nothing here yet" hint="Your school hasn't added anything to this section." />
      )}

      {children.map((c) => (
        <Pressable key={c.id} onPress={() => router.push(`/(student)/node/${c.id}`)}
                   accessibilityRole="button" accessibilityLabel={`Open ${c.title}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>{c.title}</Text>
                {c.description ? (
                  <Text style={styles.rowMeta} numberOfLines={2}>{c.description}</Text>
                ) : (
                  <Text style={styles.rowMeta}>{c.nodeType}</Text>
                )}
              </View>
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}

      {items.length > 0 && children.length > 0 && <Text style={styles.sectionTitle}>Files</Text>}

      {items.map((it) => (
        <Pressable key={it.id} onPress={() => router.push(`/(student)/item/${it.id}?node=${id}`)}
                   accessibilityRole="button"
                   accessibilityLabel={`${it.title}${it.progressStatus === 'completed' ? ', completed' : ''}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <Text style={styles.itemIcon}>{ITEM_ICON[it.itemType] || '📄'}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle} numberOfLines={2}>{it.title}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[it.itemType, it.durationSecs ? formatDuration(it.durationSecs) : null]
                    .filter(Boolean).join(' · ')}
                </Text>
              </View>
              {it.progressStatus === 'completed'
                ? <Pill label="done" tone="active" />
                : it.progressStatus ? <Pill label="started" tone="pending" /> : null}
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const formatDuration = (secs) => {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginTop: spacing.sm },
  description: { ...typography.body, color: colors.textMuted, marginTop: spacing.xs, marginBottom: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },

  progressRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginVertical: spacing.md },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.glass, overflow: 'hidden' },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.success },
  progressText: { ...typography.caption, color: colors.textMuted },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  itemIcon: { fontSize: 19, width: 26, textAlign: 'center', color: colors.accentFrom },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowMeta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textFaint },
});
