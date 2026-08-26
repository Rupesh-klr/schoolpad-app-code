import React, { useMemo, useRef, useState } from 'react';
import {
  Animated, Easing, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing, TAP, timing, typography } from '../theme/tokens';

/**
 * A select control.
 *
 * Implemented as a Modal with a list rather than a native picker. RN's Picker
 * looks completely different on each platform and cannot be styled to match the
 * glass panels, which is exactly the inconsistency this screen is trying to
 * avoid. The Modal renders identically on Android, iOS and web.
 *
 *   <Dropdown
 *     label="School"
 *     value={schoolId}
 *     options={[{ value: 1, label: 'Greenwood High', hint: '42 students' }]}
 *     onChange={setSchoolId}
 *     placeholder="All schools"
 *   />
 */
export function Dropdown({
  label, value, options, onChange, placeholder = 'Select…', clearable = true, disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value],
  );

  const pick = (v) => { onChange(v); setOpen(false); };

  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        onPress={() => !disabled && setOpen(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label || 'Select'}: ${selected?.label || placeholder}`}
        accessibilityState={{ expanded: open, disabled }}
        style={({ pressed }) => [
          styles.trigger,
          open && { borderColor: colors.accentFrom, backgroundColor: colors.accentSoft },
          disabled && { opacity: 0.5 },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.triggerText, !selected && { color: colors.textFaint }]} numberOfLines={1}>
          {selected?.label || placeholder}
        </Text>
        {/* Rotates rather than swapping glyphs, so the state change is a motion
            the eye follows instead of a flicker. */}
        <Chevron open={open} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
        // Android's hardware back must close the sheet, not the screen behind it.
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} accessibilityLabel="Close">
          {/* Stops a tap inside the sheet from closing it. */}
          <Pressable style={styles.sheetWrap} onPress={(e) => e.stopPropagation?.()}>
            <BlurView intensity={60} tint="dark" style={styles.sheet}>
              <Text style={styles.sheetTitle}>{label || 'Select'}</Text>

              <ScrollView style={{ maxHeight: 380 }} keyboardShouldPersistTaps="handled">
                {clearable && (
                  <Row
                    label={placeholder}
                    active={value === null || value === undefined || value === ''}
                    onPress={() => pick(null)}
                  />
                )}
                {options.map((o) => (
                  <Row
                    key={String(o.value)}
                    label={o.label}
                    hint={o.hint}
                    active={String(o.value) === String(value)}
                    onPress={() => pick(o.value)}
                  />
                ))}
                {options.length === 0 && (
                  <Text style={styles.emptyText}>Nothing to choose from yet.</Text>
                )}
              </ScrollView>
            </BlurView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function Row({ label, hint, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="menuitem"
      accessibilityState={{ selected: active }}
      style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && { opacity: 0.7 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[styles.rowText, active && { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
          {label}
        </Text>
        {hint ? <Text style={styles.rowHint}>{hint}</Text> : null}
      </View>
      {active && <Text style={styles.tick}>✓</Text>}
    </Pressable>
  );
}

/**
 * The disclosure arrow, shared by the dropdown and the collapsible sections.
 *
 * Native driver, so the rotation never competes with a list re-render for the
 * JS thread — the one place a dropped frame is most obvious.
 */
export function Chevron({ open, size = 13, color = colors.textMuted }) {
  const spin = useRef(new Animated.Value(open ? 1 : 0)).current;

  React.useEffect(() => {
    Animated.timing(spin, {
      toValue: open ? 1 : 0,
      duration: timing.fast,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [open, spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  return (
    <Animated.Text
      // Decorative: the pressable that owns it already announces its state.
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ fontSize: size, color, transform: [{ rotate }] }}
    >
      ▾
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.caption, color: colors.textMuted, textTransform: 'uppercase',
    marginBottom: spacing.xs, marginLeft: spacing.xs,
  },
  trigger: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: TAP, paddingHorizontal: spacing.md,
    borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.md,
    backgroundColor: colors.glass,
  },
  triggerText: { ...typography.body, color: colors.text, flex: 1 },

  backdrop: {
    flex: 1, backgroundColor: colors.overlay,
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  sheetWrap: { width: '100%', maxWidth: 460 },
  sheet: {
    borderRadius: radius.lg, overflow: 'hidden',
    borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: 'rgba(20, 27, 58, 0.86)', padding: spacing.md,
  },
  sheetTitle: {
    ...typography.caption, color: colors.textFaint, textTransform: 'uppercase',
    marginBottom: spacing.sm, marginLeft: spacing.xs,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    minHeight: TAP, paddingHorizontal: spacing.md, borderRadius: radius.md,
  },
  rowActive: { backgroundColor: colors.accentSoft },
  rowText: { ...typography.body, color: colors.textMuted },
  rowHint: { ...typography.small, color: colors.textFaint, marginTop: 1 },
  tick: { ...typography.body, color: colors.accentFrom },
  emptyText: {
    ...typography.small, color: colors.textFaint,
    padding: spacing.lg, textAlign: 'center',
  },
});
