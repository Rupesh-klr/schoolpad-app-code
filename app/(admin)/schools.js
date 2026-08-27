import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote, StatTile,
} from '../../src/components/Glass';
import { Chevron } from '../../src/components/Dropdown';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Schools — the list, and adding one.
 *
 * Everything below a school (classes, teachers, timetable, calendar) lives on
 * the detail screen. Putting it all here would be one screen with five jobs and
 * no URL you could send someone.
 */
export default function Schools() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [schools, setSchools] = useState(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [address, setAddress] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await api.schools.list({ search: search || undefined, limit: 100 });
      setSchools(r.schools);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const reset = () => {
    setName(''); setCode(''); setAddress('');
    setContactPerson(''); setPhone(''); setEmail('');
  };

  const submit = async () => {
    setError(''); setSaving(true);
    try {
      await api.schools.create({
        name: name.trim(),
        code: code.trim().toUpperCase(),
        address: address.trim() || null,
        contactPerson: contactPerson.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        status: 'active',
      });
      reset();
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (s) => {
    try {
      await api.schools.setStatus(s.id, s.status === 'active' ? 'inactive' : 'active');
      await load();
    } catch (err) {
      setError(err.message);
    }
  };

  const totalStudents = schools?.reduce((n, s) => n + (s.studentCount || 0), 0) ?? 0;
  const ready = name.trim().length >= 2 && /^[A-Za-z0-9_-]{2,}$/.test(code.trim());

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Schools</Text>
      <Text style={styles.sub}>Open a school to manage its classes, teachers, timetable and calendar.</Text>

      <View style={styles.tiles}>
        <StatTile label="Schools" value={schools?.length ?? '—'} loading={!schools} />
        <StatTile label="Students" value={totalStudents || '—'} loading={!schools} />
        <StatTile
          label="Active"
          value={schools?.filter((s) => s.status === 'active').length ?? '—'}
          tone="success"
          loading={!schools}
        />
      </View>

      <Pressable onPress={() => setFormOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={formOpen} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{formOpen ? 'New school' : 'Add a school'}</Text>
      </Pressable>

      {formOpen && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Field label="School name" value={name} onChangeText={setName}
                 placeholder="Greenwood High School" autoCapitalize="words" />
          <Field label="School code" value={code} onChangeText={(v) => setCode(v.replace(/[^A-Za-z0-9_-]/g, ''))}
                 placeholder="GWH001" autoCapitalize="characters"
                 hint="Short unique identifier. Letters, numbers, dash or underscore." />
          <Field label="Address" value={address} onChangeText={setAddress}
                 placeholder="Street, city" autoCapitalize="sentences" />

          <View style={styles.row2}>
            <View style={styles.col}>
              <Field label="Contact person" value={contactPerson} onChangeText={setContactPerson}
                     placeholder="Principal's name" autoCapitalize="words" />
            </View>
            <View style={styles.col}>
              <Field label="Phone" value={phone} onChangeText={setPhone}
                     placeholder="+91…" keyboardType="phone-pad" />
            </View>
          </View>

          <Field label="Email" value={email} onChangeText={setEmail}
                 placeholder="office@school.example" keyboardType="email-address" />

          <GlassButton title="Add school" onPress={submit} loading={saving} disabled={!ready} />
          <GhostButton title="Cancel" onPress={() => { reset(); setFormOpen(false); }} />
          <ErrorNote message={error} />
        </GlassCard>
      )}

      <Field label="Search" value={search} onChangeText={setSearch}
             placeholder="Name, code or contact" style={{ marginBottom: spacing.md }} />

      {!formOpen && error ? <ErrorNote message={error} /> : null}
      {!schools && !error && <SkeletonRows rows={3} />}

      {schools?.length === 0 ? (
        <Empty title="No schools yet" hint="Add one above to get started." />
      ) : schools?.map((s) => (
        <Pressable key={s.id} onPress={() => router.push(`/(admin)/school/${s.id}`)}
                   accessibilityRole="button" accessibilityLabel={`Open ${s.name}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 180 }}>
                <Text style={styles.name}>{s.name}</Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {[s.code, s.contactPerson, s.phone].filter(Boolean).join(' · ')}
                </Text>
                <Text style={styles.sub2}>
                  {s.studentCount ?? 0} students · {s.codeUsed ?? 0}/{s.codeCount ?? 0} codes used
                </Text>
              </View>

              <Pill label={s.status} tone={s.status === 'active' ? 'active' : 'inactive'} />
              <GhostButton
                title={s.status === 'active' ? 'Deactivate' : 'Activate'}
                onPress={() => toggleStatus(s)}
              />
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  composerTitle: { ...typography.h3, color: colors.text },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  col: { flexGrow: 1, flexBasis: 200, minWidth: 160 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  sub2: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textFaint },
});
