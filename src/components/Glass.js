import React, { useEffect, useRef } from 'react';
import {
  Animated, Easing, Platform, Pressable, StyleSheet, Text, View, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors, radius, shadow, spacing, TAP, timing, typography } from '../theme/tokens';

/**
 * The glass design system.
 *
 * Everything visual in the app is built from these. Two rules hold it together:
 *
 *  1. Glass needs something behind it. `Screen` paints the gradient every other
 *     component assumes; a GlassCard on a white background is a grey rectangle.
 *  2. Motion respects the platform. Every animation here runs on the native
 *     driver (transform and opacity only) so it stays at 60fps on the cheap
 *     Android tablets these students actually use.
 */

// ─── Screen ──────────────────────────────────────────────────────────────────

/** Gradient backdrop. Wrap every screen in this. */
export function Screen({ children, style }) {
  return (
    <LinearGradient
      colors={[colors.bgTop, colors.bgMid, colors.bgBottom]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[StyleSheet.absoluteFill, { flex: 1 }]}
    >
      <View style={[{ flex: 1 }, style]}>{children}</View>
    </LinearGradient>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────

/**
 * A frosted panel.
 *
 * BlurView is skipped on Android below API 31, where it is emulated in software
 * and drops a scrolling list to single-digit frame rates. The translucent fill
 * and hairline border carry the look on their own there — slightly flatter, but
 * a card that renders is better than one that stutters.
 */
const CAN_BLUR = Platform.OS === 'ios' || Platform.OS === 'web' || Number(Platform.Version) >= 31;

export function GlassCard({ children, style, intensity = 30, strong = false, padded = true }) {
  const body = (
    <View style={[
      styles.cardInner,
      padded && { padding: spacing.lg },
      { backgroundColor: strong ? colors.glassStrong : colors.glass },
    ]}>
      {children}
    </View>
  );

  return (
    <View style={[styles.card, shadow('md'), style]}>
      {CAN_BLUR ? (
        <BlurView intensity={intensity} tint="dark" style={styles.fill}>{body}</BlurView>
      ) : body}
    </View>
  );
}

// ─── Shimmer ─────────────────────────────────────────────────────────────────

/**
 * The sweeping highlight — used as a loading skeleton and as the sheen on a
 * primary button.
 *
 * `useNativeDriver` needs a fixed width to translate across, so the sweep is
 * sized by the parent and clipped by `overflow: hidden` rather than measured at
 * runtime. Measuring would force a layout pass on every frame.
 */
export function Shimmer({ width = 220, height = 16, style, radius: r = radius.sm }) {
  const x = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(x, {
        toValue: 1,
        duration: timing.shimmer,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    loop.start();
    // Stopping on unmount matters: a looping animation left running keeps the
    // JS thread awake and drains battery on a screen nobody is looking at.
    return () => loop.stop();
  }, [x]);

  const translateX = x.interpolate({ inputRange: [-1, 1], outputRange: [-width, width] });

  return (
    <View style={[{ width, height, borderRadius: r, backgroundColor: colors.glass, overflow: 'hidden' }, style]}>
      <Animated.View style={{ width, height, transform: [{ translateX }] }}>
        <LinearGradient
          colors={['transparent', colors.glassHighlight, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={{ flex: 1 }}
        />
      </Animated.View>
    </View>
  );
}

/** Several shimmer bars, for a list that has not loaded yet. */
export function SkeletonRows({ rows = 3, width = 260 }) {
  return (
    <View style={{ gap: spacing.sm }}>
      {Array.from({ length: rows }).map((_, i) => (
        <GlassCard key={i} style={{ marginBottom: spacing.sm }}>
          <Shimmer width={width} height={14} />
          <View style={{ height: spacing.sm }} />
          <Shimmer width={width * 0.6} height={10} />
        </GlassCard>
      ))}
    </View>
  );
}

// ─── Button ──────────────────────────────────────────────────────────────────

/**
 * Primary action.
 *
 * Two pieces of motion:
 *   press  — scales to 0.97, which is the whole reason a tap feels acknowledged
 *            on a device with no haptics.
 *   sheen  — a slow highlight sweep while `loading`, so a slow network reads as
 *            "working" instead of "frozen".
 */
export function GlassButton({
  title, onPress, variant = 'primary', loading = false, disabled = false, style, icon = null,
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const sheen = useRef(new Animated.Value(-1)).current;

  useEffect(() => {
    if (!loading) { sheen.setValue(-1); return undefined; }
    const loop = Animated.loop(
      Animated.timing(sheen, {
        toValue: 1, duration: timing.shimmer, easing: Easing.linear, useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [loading, sheen]);

  const to = (v) => Animated.spring(scale, {
    toValue: v, useNativeDriver: true, speed: 40, bounciness: 6,
  }).start();

  const inert = disabled || loading;
  const isPrimary = variant === 'primary';

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={inert ? undefined : onPress}
        onPressIn={() => !inert && to(0.97)}
        onPressOut={() => !inert && to(1)}
        // Without these the control is invisible to TalkBack and VoiceOver,
        // which for a children's education app is not optional.
        accessibilityRole="button"
        accessibilityState={{ disabled: inert, busy: loading }}
        accessibilityLabel={title}
        style={[styles.btn, shadow('sm'), inert && { opacity: 0.55 }]}
      >
        <LinearGradient
          colors={isPrimary
            ? [colors.accentFrom, colors.accentTo]
            : [colors.glassStrong, colors.glass]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.btnFill}
        >
          {loading && (
            <Animated.View
              pointerEvents="none"
              style={[
                StyleSheet.absoluteFill,
                { transform: [{ translateX: sheen.interpolate({ inputRange: [-1, 1], outputRange: [-260, 260] }) }] },
              ]}
            >
              <LinearGradient
                colors={['transparent', colors.glassHighlight, 'transparent']}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                style={{ flex: 1 }}
              />
            </Animated.View>
          )}

          <View style={styles.btnRow}>
            {loading && <ActivityIndicator size="small" color={colors.text} style={{ marginRight: spacing.sm }} />}
            {!loading && icon}
            <Text style={styles.btnText} numberOfLines={1}>{title}</Text>
          </View>
        </LinearGradient>
      </Pressable>
    </Animated.View>
  );
}

/** Low-emphasis action — cancel, back, "use a different number". */
export function GhostButton({ title, onPress, style }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.6 }, style]}
    >
      <Text style={styles.ghostText}>{title}</Text>
    </Pressable>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

export function StatTile({ label, value, tone = 'default', loading = false }) {
  const toneColor = {
    default: colors.text, success: colors.success, warning: colors.warning, danger: colors.danger,
  }[tone];

  return (
    <GlassCard style={styles.tile}>
      <Text style={styles.tileLabel} numberOfLines={1}>{label}</Text>
      {loading
        ? <Shimmer width={64} height={26} />
        : <Text style={[styles.tileValue, { color: toneColor }]}>{value}</Text>}
    </GlassCard>
  );
}

export function Pill({ label, tone = 'default' }) {
  const map = {
    default: colors.glassStrong,
    active: 'rgba(52, 211, 153, 0.20)',
    pending: 'rgba(251, 191, 36, 0.20)',
    inactive: 'rgba(251, 113, 133, 0.20)',
  };
  const text = {
    default: colors.textMuted, active: colors.success, pending: colors.warning, inactive: colors.danger,
  };
  return (
    <View style={[styles.pill, { backgroundColor: map[tone] || map.default }]}>
      <Text style={[styles.pillText, { color: text[tone] || text.default }]}>{label}</Text>
    </View>
  );
}

export function Empty({ title, hint }) {
  return (
    <GlassCard style={{ alignItems: 'center', paddingVertical: spacing.xxl }}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
    </GlassCard>
  );
}

/** Inline error. Red text alone fails for the ~8% of boys who are colourblind. */
export function ErrorNote({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBox} accessibilityLiveRegion="polite" accessibilityRole="alert">
      <Text style={styles.errorText}>⚠  {message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder },
  fill: { flex: 1 },
  cardInner: { flex: 1 },

  btn: { borderRadius: radius.pill, overflow: 'hidden', minHeight: TAP },
  btnFill: {
    minHeight: TAP, paddingHorizontal: spacing.lg,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.pill,
    overflow: 'hidden',
  },
  btnRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  btnText: { ...typography.h3, color: colors.text, fontFamily: typography.familyMedium },

  ghost: { minHeight: TAP, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.md },
  ghostText: { ...typography.body, color: colors.textMuted, fontFamily: typography.family },

  tile: { flex: 1, minWidth: 140, marginBottom: spacing.sm },
  tileLabel: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase', marginBottom: spacing.xs },
  tileValue: { ...typography.h1, fontFamily: typography.familyMedium },

  pill: { paddingHorizontal: spacing.sm, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { ...typography.caption, textTransform: 'uppercase' },

  emptyTitle: { ...typography.h3, color: colors.text, marginBottom: spacing.xs },
  emptyHint: { ...typography.small, color: colors.textMuted, textAlign: 'center' },

  errorBox: {
    backgroundColor: 'rgba(251, 113, 133, 0.14)',
    borderColor: 'rgba(251, 113, 133, 0.40)', borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginTop: spacing.sm,
  },
  errorText: { ...typography.small, color: colors.danger },
});
