import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { GlassCard } from '../../../src/components/Glass';
import { colors, spacing, typography } from '../../../src/theme/tokens';

/**
 * Content — not built yet.
 *
 * Video, PDF, image and web-link players, with a "mark as completed" action.
 *
 * The API side is complete, so this screen is UI work only.
 */
export default function Screen() {
  const insets = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg }]}>
      <Text style={styles.title}>Content</Text>
      <GlassCard>
        <Text style={styles.heading}>Not built yet</Text>
        <Text style={styles.body}>Video, PDF, image and web-link players, with a "mark as completed" action.</Text>
        <View style={styles.list}>
          <Text style={styles.endpoint}>GET    /api/content/nodes/:id/children</Text>
          <Text style={styles.endpoint}>POST   /api/content/items/:id/progress</Text>
        </View>
        <Text style={styles.footer}>
          These endpoints are implemented and tested — this screen is the remaining work.
        </Text>
      </GlassCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text, marginBottom: spacing.lg },
  heading: { ...typography.h3, color: colors.warning, marginBottom: spacing.sm },
  body: { ...typography.body, color: colors.textMuted, marginBottom: spacing.md },
  list: { gap: 4, marginBottom: spacing.md },
  endpoint: { fontFamily: typography.mono, fontSize: 13, color: colors.text },
  footer: { ...typography.small, color: colors.textFaint },
});
