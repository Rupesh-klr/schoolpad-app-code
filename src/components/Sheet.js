import React from 'react';
import {
  Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing, TAP, typography } from '../theme/tokens';

/**
 * A glass modal.
 *
 * Bottom sheet on a phone, centred dialog on a wide screen. The split is not
 * decoration: a centred dialog on a phone puts its actions in the middle of the
 * screen where a thumb cannot reach, and a bottom sheet on a desktop monitor
 * looks like a rendering fault.
 *
 *   <Sheet open={x} onClose={...} title="Code 1234567890">
 *     <SheetRow label="Deactivate" onPress={...} />
 *   </Sheet>
 */
export function Sheet({ open, onClose, title, subtitle, children, maxHeight = 460 }) {
  const { width } = useWindowDimensions();
  const wide = width >= 700;

  return (
    <Modal
      visible={open}
      transparent
      animationType={wide ? 'fade' : 'slide'}
      onRequestClose={onClose}
      // Android's hardware back must close the sheet, not the screen behind it.
      statusBarTranslucent
    >
      <Pressable
        style={[styles.backdrop, wide ? styles.backdropCentre : styles.backdropBottom]}
        onPress={onClose}
        accessibilityLabel="Close"
      >
        {/* Stops a tap inside from closing it. */}
        <Pressable
          style={[styles.wrap, wide ? styles.wrapWide : styles.wrapNarrow]}
          onPress={(e) => e.stopPropagation?.()}
        >
          <BlurView intensity={60} tint="dark" style={styles.sheet}>
            {/* The grabber reads as "drag me" and marks the sheet as dismissible
                on touch, where there is no visible close affordance otherwise. */}
            {!wide && <View style={styles.grabber} />}

            <View style={styles.header}>
              <View style={{ flex: 1 }}>
                {title ? <Text style={styles.title} numberOfLines={2}>{title}</Text> : null}
                {subtitle ? <Text style={styles.subtitle} numberOfLines={2}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} style={styles.close} accessibilityRole="button"
                         accessibilityLabel="Close">
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight }} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </BlurView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** One tappable action inside a Sheet. */
export function SheetRow({ label, hint, icon, tone = 'default', onPress, disabled = false }) {
  const color = {
    default: colors.text, danger: colors.danger,
    success: colors.success, muted: colors.textMuted,
  }[tone];

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      style={({ pressed }) => [styles.row, pressed && !disabled && styles.rowPressed, disabled && { opacity: 0.4 }]}
    >
      {icon ? <Text style={styles.rowIcon}>{icon}</Text> : null}
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowLabel, { color }]}>{label}</Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
    </Pressable>
  );
}

/** A non-interactive line of detail inside a Sheet. */
export function SheetDetail({ label, value }) {
  return (
    <View style={styles.detail}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue} selectable>{value ?? '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  backdropCentre: { alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
  backdropBottom: { justifyContent: 'flex-end' },

  wrap: { width: '100%' },
  wrapWide: { maxWidth: 520 },
  wrapNarrow: {
    // Home-indicator clearance on iPhones; harmless elsewhere.
    paddingBottom: Platform.OS === 'ios' ? spacing.lg : 0,
  },

  sheet: {
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: 'rgba(20, 27, 58, 0.90)',
    padding: spacing.md,
  },

  grabber: {
    width: 38, height: 4, borderRadius: 2, backgroundColor: colors.glassHighlight,
    alignSelf: 'center', marginBottom: spacing.sm,
  },

  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, marginBottom: spacing.sm },
  title: { ...typography.h3, color: colors.text },
  subtitle: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  close: {
    width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
  },
  closeText: { color: colors.textMuted, fontSize: 13 },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    minHeight: TAP, paddingHorizontal: spacing.md, borderRadius: radius.md,
  },
  rowPressed: { backgroundColor: colors.glass },
  rowIcon: { fontSize: 17, width: 24, textAlign: 'center' },
  rowLabel: { ...typography.body },
  rowHint: { ...typography.small, color: colors.textFaint, marginTop: 1 },

  detail: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.glassBorder,
  },
  detailLabel: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' },
  detailValue: { ...typography.body, color: colors.text, marginTop: 2 },
});
