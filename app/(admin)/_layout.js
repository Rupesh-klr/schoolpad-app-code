import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Slot, usePathname, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { useAuth } from '../../src/auth/AuthContext';
import { colors, radius, spacing, TAP, typography } from '../../src/theme/tokens';

/**
 * Admin shell — the sidebar from section 4.
 *
 * A side rail on a wide screen, a bottom bar on a narrow one. The dashboard is
 * primarily a desktop tool, but an admin approving a student from their phone
 * is the common case at the start of a term, so it has to work there too.
 */

const NAV = [
  { href: '/(admin)/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/(admin)/schools',   label: 'Schools',   icon: '🏫' },
  { href: '/(admin)/students',  label: 'Students',  icon: '👤' },
  { href: '/(admin)/codes',     label: 'Codes',     icon: '#'  },
  { href: '/(admin)/content',   label: 'Content',   icon: '▶'  },
  { href: '/(admin)/documents', label: 'Notices',   icon: '📢' },
  { href: '/(admin)/settings',  label: 'Settings',  icon: '⚙'  },
];

export default function AdminLayout() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useAuth();

  const wide = width >= 900;

  const Item = ({ item }) => {
    const active = pathname.startsWith(item.href.replace('/(admin)', '/'))
      || pathname.includes(item.href.split('/').pop());
    return (
      <Pressable
        onPress={() => router.replace(item.href)}
        accessibilityRole="link"
        accessibilityState={{ selected: active }}
        style={[
          wide ? styles.railItem : styles.barItem,
          active && (wide ? styles.railItemActive : styles.barItemActive),
        ]}
      >
        <Text style={[styles.icon, active && { color: colors.text }]}>{item.icon}</Text>
        {wide && <Text style={[styles.railLabel, active && styles.railLabelActive]}>{item.label}</Text>}
        {!wide && <Text style={[styles.barLabel, active && { color: colors.text }]}>{item.label}</Text>}
      </Pressable>
    );
  };

  return (
    <View style={[styles.root, wide && { flexDirection: 'row' }]}>
      {wide && (
        <BlurView intensity={40} tint="dark" style={[styles.rail, { paddingTop: insets.top + spacing.lg }]}>
          <Text style={styles.brand}>◆ Admin</Text>
          <ScrollView style={{ flex: 1 }}>
            {NAV.map((item) => <Item key={item.href} item={item} />)}
          </ScrollView>
          <View style={styles.railFooter}>
            <Text style={styles.who} numberOfLines={1}>{user?.fullName || user?.email}</Text>
            <Pressable onPress={signOut} accessibilityRole="button">
              <Text style={styles.signOut}>Sign out</Text>
            </Pressable>
          </View>
        </BlurView>
      )}

      <View style={{ flex: 1 }}>
        <Slot />
      </View>

      {!wide && (
        <BlurView
          intensity={40}
          tint="dark"
          style={[styles.bar, { paddingBottom: insets.bottom || spacing.sm }]}
        >
          {NAV.map((item) => <Item key={item.href} item={item} />)}
        </BlurView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },

  rail: {
    width: 216, borderRightWidth: 1, borderRightColor: colors.glassBorder,
    paddingHorizontal: spacing.sm, paddingBottom: spacing.md,
  },
  brand: { ...typography.h3, color: colors.text, paddingHorizontal: spacing.md, marginBottom: spacing.lg },
  railItem: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    paddingHorizontal: spacing.md, minHeight: TAP, borderRadius: radius.md, marginBottom: 2,
  },
  railItemActive: { backgroundColor: colors.accentSoft },
  railLabel: { ...typography.body, color: colors.textMuted },
  railLabelActive: { color: colors.text, fontWeight: '600' },
  railFooter: { borderTopWidth: 1, borderTopColor: colors.glassBorder, paddingTop: spacing.md, paddingHorizontal: spacing.md },
  who: { ...typography.small, color: colors.textMuted },
  signOut: { ...typography.small, color: colors.danger, marginTop: spacing.xs },

  bar: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.glassBorder,
    paddingTop: spacing.sm, justifyContent: 'space-around',
  },
  barItem: { alignItems: 'center', justifyContent: 'center', minWidth: 52, minHeight: TAP, gap: 2 },
  barItemActive: {},
  barLabel: { ...typography.caption, color: colors.textFaint },
  icon: { fontSize: 17, color: colors.textMuted },
});
