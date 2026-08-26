import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote, StatTile,
} from '../../src/components/Glass';
import { Dropdown, Chevron } from '../../src/components/Dropdown';
import { FilePicker, formatBytes } from '../../src/components/FilePicker';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Documents and notices — admin side.
 *
 * Publish an uploaded file *or* a link, aimed at everyone, one school, or one
 * class. The audience is resolved on the server; this screen only collects it
 * and shows how many students it reaches before you commit.
 */

const CATEGORIES = [
  { value: 'gk',        label: 'General Knowledge', icon: '🧠' },
  { value: 'notice',    label: 'Notice',            icon: '📢' },
  { value: 'important', label: 'Important',         icon: '⚠️' },
  { value: 'homework',  label: 'Homework',          icon: '📝' },
  { value: 'general',   label: 'General',           icon: '📄' },
];

const iconFor = (c) => CATEGORIES.find((x) => x.value === c)?.icon || '📄';

export default function Documents() {
  const insets = useSafeAreaInsets();
  const { constants } = useAuth();

  const [docs, setDocs] = useState(null);
  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  // Form
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('notice');
  const [scope, setScope] = useState('global');
  const [schoolId, setSchoolId] = useState(null);
  const [classLevel, setClassLevel] = useState(null);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reach, setReach] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.documents.list({ limit: 100 });
      setDocs(r.documents);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    api.meta.schools().then((r) => setSchools(r.schools || [])).catch(() => setSchools([]));
  }, []);

  /**
   * Ask the server who this would reach, whenever the audience changes.
   *
   * "Publish to 0 students" is the mistake this prevents — a class notice aimed
   * at a class with nobody in it looks identical to a correct one until someone
   * asks why nobody replied.
   */
  useEffect(() => {
    if (scope !== 'global' && !schoolId) { setReach(null); return undefined; }
    if (scope === 'class' && !classLevel) { setReach(null); return undefined; }

    let cancelled = false;
    api.documents
      .audiencePreview({ scope, schoolId: schoolId || undefined, classLevel: classLevel || undefined })
      .then((r) => { if (!cancelled) setReach(r.audienceSize); })
      .catch(() => { if (!cancelled) setReach(null); });
    return () => { cancelled = true; };
  }, [scope, schoolId, classLevel]);

  const classOptions = useMemo(() => {
    const min = constants?.minClass ?? 2;
    const max = constants?.maxClass ?? 10;
    return Array.from({ length: max - min + 1 }, (_, i) => ({
      value: min + i, label: `Class ${min + i}`,
    }));
  }, [constants]);

  const reset = () => {
    setFile(null); setUrl(''); setTitle(''); setDescription('');
    setCategory('notice'); setScope('global'); setSchoolId(null); setClassLevel(null);
    setNotify(true); setMode('file'); setReach(null);
  };

  const submit = async () => {
    setError(''); setNotice(''); setSaving(true);
    try {
      // FormData, not JSON — a document may carry a file, and the endpoint
      // takes both shapes through the same multipart handler.
      const fd = new FormData();
      fd.append('title', title.trim());
      if (description.trim()) fd.append('description', description.trim());
      fd.append('category', category);
      fd.append('scope', scope);
      if (schoolId) fd.append('schoolId', String(schoolId));
      if (classLevel) fd.append('classLevel', String(classLevel));
      fd.append('notify', notify ? 'true' : 'false');
      fd.append('status', 'published');

      if (mode === 'file' && file) fd.append('file', file);
      else if (mode === 'link' && url.trim()) fd.append('url', url.trim());

      const r = await api.documents.create(fd);
      setNotice(`Published — reaches ${r.audienceSize} student${r.audienceSize === 1 ? '' : 's'}.`);
      reset();
      setFormOpen(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const remove = (doc) => {
    const go = async () => {
      try { await api.documents.remove(doc.id); await load(); }
      catch (err) { setError(err.message); }
    };
    // Alert has no web implementation in RNW, so confirm() covers the dashboard.
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete “${doc.title}”? This cannot be undone.`)) go();
    } else {
      Alert.alert('Delete this document?', doc.title, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: go },
      ]);
    }
  };

  const ready = title.trim().length >= 2
    && (mode === 'file' ? !!file : url.trim().length > 5)
    && (scope === 'global' || !!schoolId)
    && (scope !== 'class' || !!classLevel);

  const published = docs?.filter((d) => d.status === 'published').length ?? 0;

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Documents & notices</Text>
      <Text style={styles.sub}>Share a file or a link with everyone, a school, or one class.</Text>

      <View style={styles.tiles}>
        <StatTile label="Published" value={published} loading={!docs} />
        <StatTile label="Total" value={docs?.length ?? '—'} loading={!docs} />
        <StatTile label="Schools" value={schools.length || '—'} loading={!schools.length} />
      </View>

      {/* ── Composer ───────────────────────────────────────────────────────── */}
      <Pressable onPress={() => setFormOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={formOpen} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{formOpen ? 'New document' : 'Add a document or notice'}</Text>
      </Pressable>

      {formOpen && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <View style={styles.segment}>
            <Seg label="Upload a file" active={mode === 'file'} onPress={() => setMode('file')} />
            <Seg label="Add a link" active={mode === 'link'} onPress={() => setMode('link')} />
          </View>

          {mode === 'file' ? (
            <FilePicker
              file={file}
              onPick={setFile}
              hint="PDF, image, video or document"
            />
          ) : (
            <Field
              label="Link"
              value={url}
              onChangeText={setUrl}
              placeholder="https://example.com/notice.pdf"
              keyboardType="url"
              hint="Opens in the browser. Anything reachable works — Drive, YouTube, a news page."
            />
          )}

          <Field label="Title" value={title} onChangeText={setTitle} placeholder="Republic Day quiz" autoCapitalize="sentences" />
          <Field label="Description (optional)" value={description} onChangeText={setDescription}
                 placeholder="What is this and who is it for?" autoCapitalize="sentences" />

          <Text style={styles.label}>Category</Text>
          <View style={styles.chipRow}>
            {CATEGORIES.map((c) => (
              <Chip key={c.value} label={`${c.icon} ${c.label}`} active={category === c.value}
                    onPress={() => setCategory(c.value)} />
            ))}
          </View>

          <Text style={styles.label}>Who sees this</Text>
          <View style={styles.chipRow}>
            <Chip label="Everyone" active={scope === 'global'}
                  onPress={() => { setScope('global'); setSchoolId(null); setClassLevel(null); }} />
            <Chip label="One school" active={scope === 'school'}
                  onPress={() => { setScope('school'); setClassLevel(null); }} />
            <Chip label="One class" active={scope === 'class'} onPress={() => setScope('class')} />
          </View>

          {scope !== 'global' && (
            <View style={styles.filterRow}>
              <View style={styles.filterCol}>
                <Dropdown
                  label="School"
                  value={schoolId}
                  options={schools.map((s) => ({ value: s.id, label: s.name, hint: s.code }))}
                  onChange={setSchoolId}
                  placeholder="Choose a school"
                  clearable={false}
                />
              </View>
              {scope === 'class' && (
                <View style={styles.filterCol}>
                  <Dropdown
                    label="Class"
                    value={classLevel}
                    options={classOptions}
                    onChange={setClassLevel}
                    placeholder="Choose a class"
                    clearable={false}
                  />
                </View>
              )}
            </View>
          )}

          <Pressable onPress={() => setNotify((n) => !n)} style={styles.toggleRow} accessibilityRole="switch"
                     accessibilityState={{ checked: notify }}>
            <View style={[styles.checkbox, notify && styles.checkboxOn]}>
              {notify && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.toggleLabel}>Notify members</Text>
              <Text style={styles.toggleHint}>
                Shows as unread with a badge. Turn off for reference material that shouldn't interrupt.
              </Text>
            </View>
          </Pressable>

          {reach !== null && (
            <View style={[styles.reach, reach === 0 && styles.reachEmpty]}>
              <Text style={[styles.reachText, reach === 0 && { color: colors.warning }]}>
                {reach === 0
                  ? 'This reaches 0 active students — check the school and class.'
                  : `Reaches ${reach} active student${reach === 1 ? '' : 's'}, plus their linked parents.`}
              </Text>
            </View>
          )}

          <GlassButton title="Publish" onPress={submit} loading={saving} disabled={!ready} />
          <GhostButton title="Cancel" onPress={() => { reset(); setFormOpen(false); }} />
          <ErrorNote message={error} />
        </GlassCard>
      )}

      {notice ? <Text style={styles.successNote}>{notice}</Text> : null}
      {!formOpen && error ? <ErrorNote message={error} /> : null}

      {/* ── List ───────────────────────────────────────────────────────────── */}
      <Text style={styles.sectionTitle}>Published</Text>

      {!docs && !error && <SkeletonRows rows={4} />}

      {docs?.length === 0 ? (
        <Empty title="Nothing shared yet" hint="Add a file or a link above." />
      ) : docs?.map((d) => (
        <GlassCard key={d.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <Text style={styles.rowIcon}>{iconFor(d.category)}</Text>

            <View style={{ flex: 1, minWidth: 180 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{d.title}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {audienceLabel(d)}
                {d.sizeBytes ? ` · ${formatBytes(d.sizeBytes)}` : ''}
                {` · ${d.readCount ?? 0} read`}
              </Text>
              {d.description ? <Text style={styles.rowDesc} numberOfLines={2}>{d.description}</Text> : null}
            </View>

            <Pill label={d.sourceType} tone="default" />
            {!d.notify && <Pill label="silent" tone="default" />}

            <GhostButton
              title="Open"
              onPress={() => Linking.openURL(absolute(d.url))}
            />
            <GhostButton title="Delete" onPress={() => remove(d)} />
          </View>
        </GlassCard>
      ))}
    </ScrollView>
  );
}

/** Uploaded files come back as a root-relative /media path. */
const absolute = (u) => (u?.startsWith('/') ? `${api.baseUrl}${u}` : u);

function audienceLabel(d) {
  if (d.scope === 'global') return 'Everyone';
  if (d.scope === 'school') return d.schoolName || 'One school';
  return `${d.schoolName || 'School'} · Class ${d.classLevel}`;
}

function Seg({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]} accessibilityRole="tab"
               accessibilityState={{ selected: active }}>
      <Text style={[styles.segText, active && { color: colors.text, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

function Chip({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]} accessibilityRole="button"
               accessibilityState={{ selected: active }}>
      <Text style={[styles.chipText, active && { color: colors.text }]} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.lg },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.md, marginBottom: spacing.md },
  label: { ...typography.caption, color: colors.textMuted, textTransform: 'uppercase', marginBottom: spacing.xs, marginLeft: spacing.xs },

  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  composerTitle: { ...typography.h3, color: colors.text },

  segment: { flexDirection: 'row', backgroundColor: colors.glass, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
  seg: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  segActive: { backgroundColor: colors.glassStrong },
  segText: { ...typography.small, color: colors.textMuted },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginBottom: spacing.md },
  chip: {
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    minHeight: 40, justifyContent: 'center', maxWidth: 240,
  },
  chipActive: { backgroundColor: colors.accentSoft, borderColor: colors.accentFrom },
  chipText: { ...typography.small, color: colors.textMuted },

  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  filterCol: { flexGrow: 1, flexBasis: 200, minWidth: 180 },

  toggleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginBottom: spacing.md, paddingVertical: spacing.xs },
  checkbox: {
    width: 24, height: 24, borderRadius: 7, borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: colors.glass, alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxOn: { backgroundColor: colors.accentFrom, borderColor: colors.accentFrom },
  checkmark: { color: colors.text, fontSize: 14, fontWeight: '700' },
  toggleLabel: { ...typography.body, color: colors.text },
  toggleHint: { ...typography.small, color: colors.textFaint, marginTop: 2 },

  reach: {
    backgroundColor: 'rgba(52,211,153,0.12)', borderColor: 'rgba(52,211,153,0.35)', borderWidth: 1,
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md,
  },
  reachEmpty: { backgroundColor: 'rgba(251,191,36,0.12)', borderColor: 'rgba(251,191,36,0.35)' },
  reachText: { ...typography.small, color: colors.success },

  successNote: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  rowIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowMeta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  rowDesc: { ...typography.small, color: colors.textMuted, marginTop: 4 },
});
