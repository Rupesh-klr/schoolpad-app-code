import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote, StatTile,
} from '../../src/components/Glass';
import { Dropdown, Chevron } from '../../src/components/Dropdown';
import { Sheet, SheetRow, SheetDetail } from '../../src/components/Sheet';
import { FilePicker, formatBytes } from '../../src/components/FilePicker';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Content management — sections 2.5 and 2.6.
 *
 * The tree is browsed one level at a time with a breadcrumb, not rendered
 * whole. A school with 10 classes × 6 subjects × 12 chapters is 800 nodes; an
 * expand-everything tree is unusable at that size and slow to render on the
 * tablets this dashboard runs on.
 */

// The order the levels nest in. What you can add is decided by where you are.
const LEVELS = ['class', 'subject', 'chapter', 'topic'];
const CHILD_OF = { root: 'class', class: 'subject', subject: 'chapter', chapter: 'topic', topic: null };

const ICON = { class: '🎓', subject: '📚', chapter: '📖', topic: '📄' };
const ITEM_ICON = { video: '▶', pdf: '📄', image: '🖼', link: '🔗' };

export default function Content() {
  const insets = useSafeAreaInsets();
  const { constants } = useAuth();

  // Breadcrumb of ancestors; the last entry is where we are. Empty = root.
  const [path, setPath] = useState([]);
  const [roots, setRoots] = useState(null);
  const [level, setLevel] = useState(null);
  const [schools, setSchools] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [selected, setSelected] = useState(null);

  const here = path[path.length - 1] || null;
  const childType = CHILD_OF[here?.nodeType || 'root'];

  const loadRoot = useCallback(async () => {
    try {
      const r = await api.content.tree();
      setRoots(r.tree);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadLevel = useCallback(async (nodeId) => {
    try {
      setLevel(null);
      setLevel(await api.content.children(nodeId));
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, []);

  useEffect(() => { loadRoot(); }, [loadRoot]);
  useEffect(() => {
    api.meta.schools().then((r) => setSchools(r.schools || [])).catch(() => {});
  }, []);
  useEffect(() => {
    if (here) loadLevel(here.id);
  }, [here, loadLevel]);

  const refresh = useCallback(async () => {
    if (here) await loadLevel(here.id);
    else await loadRoot();
  }, [here, loadLevel, loadRoot]);

  const open = (node) => setPath((p) => [...p, node]);
  const jumpTo = (index) => setPath((p) => p.slice(0, index + 1));

  const folders = here ? (level?.children || []) : (roots || []);
  const items = here ? (level?.items || []) : [];
  const loading = here ? !level : !roots;

  const setVisibility = async (node, visibility) => {
    try {
      await api.content.updateNode(node.id, { visibility });
      setSelected(null);
      await refresh();
    } catch (err) { setError(err.message); setSelected(null); }
  };

  const removeNode = async (node) => {
    const go = async () => {
      try {
        const r = await api.content.deleteNode(node.id);
        setSelected(null);
        setNotice(`Deleted “${node.title}”${r.directItems ? ` and ${r.directItems} item(s) inside it` : ''}.`);
        await refresh();
      } catch (err) { setError(err.message); setSelected(null); }
    };
    // Deleting a folder cascades to everything beneath it, which is not
    // recoverable — so this is the one place a confirm is worth the friction.
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete “${node.title}” and everything inside it? This cannot be undone.`)) go();
    } else go();
  };

  const removeItem = async (item) => {
    const go = async () => {
      try {
        await api.content.deleteItem(item.id);
        setSelected(null);
        await refresh();
      } catch (err) { setError(err.message); setSelected(null); }
    };
    if (typeof window !== 'undefined' && window.confirm) {
      if (window.confirm(`Delete “${item.title}”?`)) go();
    } else go();
  };

  const toggleItem = async (item) => {
    try {
      const fd = new FormData();
      fd.append('visibility', item.visibility === 'visible' ? 'hidden' : 'visible');
      await api.content.updateItem(item.id, fd);
      setSelected(null);
      await refresh();
    } catch (err) { setError(err.message); setSelected(null); }
  };

  const totalItems = useMemo(
    () => (roots || []).reduce(function count(sum, n) {
      return (n.children || []).reduce(count, sum + (n.itemCount || 0));
    }, 0),
    [roots],
  );

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Content</Text>
      <Text style={styles.sub}>Class → Subject → Chapter → Topic. Files live under each topic.</Text>

      <View style={styles.tiles}>
        <StatTile label="Classes" value={roots?.length ?? '—'} loading={!roots} />
        <StatTile label="Items" value={totalItems || '—'} loading={!roots} />
        <StatTile label="Here" value={folders.length + items.length} loading={loading} />
      </View>

      {/* ── Breadcrumb ─────────────────────────────────────────────────────── */}
      <View style={styles.crumbs}>
        <Crumb label="All classes" active={!here} onPress={() => setPath([])} />
        {path.map((n, i) => (
          <React.Fragment key={n.id}>
            <Text style={styles.crumbSep}>›</Text>
            <Crumb label={n.title} active={i === path.length - 1} onPress={() => jumpTo(i)} />
          </React.Fragment>
        ))}
      </View>

      <ErrorNote message={error} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {/* ── Add ────────────────────────────────────────────────────────────── */}
      {childType && (
        <AddFolder
          parent={here}
          childType={childType}
          schools={schools}
          constants={constants}
          onDone={refresh}
          setError={setError}
        />
      )}

      {here?.nodeType === 'topic' && (
        <AddItems node={here} constants={constants} onDone={refresh} setError={setError} />
      )}

      {/* ── Folders ────────────────────────────────────────────────────────── */}
      {loading && <SkeletonRows rows={4} />}

      {!loading && folders.length === 0 && items.length === 0 && (
        <Empty
          title={here ? 'Nothing in here yet' : 'No classes yet'}
          hint={childType ? `Add a ${childType} above.` : 'Upload files above.'}
        />
      )}

      {folders.map((f) => (
        <Pressable key={f.id} onPress={() => open(f)} accessibilityRole="button"
                   accessibilityLabel={`Open ${f.title}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <Text style={styles.rowIcon}>{ICON[f.nodeType] || '📁'}</Text>
              <View style={{ flex: 1, minWidth: 140 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>{f.title}</Text>
                <Text style={styles.rowMeta} numberOfLines={1}>
                  {[f.nodeType,
                    f.classLevel ? `Class ${f.classLevel}` : null,
                    f.itemCount !== undefined ? `${f.itemCount} item${f.itemCount === 1 ? '' : 's'}` : null,
                    f.children?.length ? `${f.children.length} inside` : null,
                  ].filter(Boolean).join(' · ')}
                </Text>
              </View>
              {f.visibility === 'hidden' && <Pill label="hidden" tone="inactive" />}
              <Pressable onPress={() => setSelected({ kind: 'node', data: f })}
                         accessibilityRole="button" accessibilityLabel={`Options for ${f.title}`}
                         style={styles.moreBtn} hitSlop={8}>
                <Text style={styles.moreText}>⋯</Text>
              </Pressable>
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}

      {/* ── Items ──────────────────────────────────────────────────────────── */}
      {items.length > 0 && <Text style={styles.sectionTitle}>Files</Text>}

      {items.map((it) => (
        <GlassCard key={it.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <Text style={styles.rowIcon}>{ITEM_ICON[it.itemType] || '📄'}</Text>
            <View style={{ flex: 1, minWidth: 140 }}>
              <Text style={styles.rowTitle} numberOfLines={1}>{it.title}</Text>
              <Text style={styles.rowMeta} numberOfLines={1}>
                {[it.itemType, it.mimeType, it.durationSecs ? `${it.durationSecs}s` : null]
                  .filter(Boolean).join(' · ')}
              </Text>
            </View>
            {it.visibility === 'hidden' && <Pill label="hidden" tone="inactive" />}
            <Pressable onPress={() => setSelected({ kind: 'item', data: it })}
                       accessibilityRole="button" accessibilityLabel={`Options for ${it.title}`}
                       style={styles.moreBtn} hitSlop={8}>
              <Text style={styles.moreText}>⋯</Text>
            </Pressable>
          </View>
        </GlassCard>
      ))}

      {/* ── Options ────────────────────────────────────────────────────────── */}
      <Sheet
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.data?.title}
        subtitle={selected?.kind === 'node' ? selected?.data?.nodeType : selected?.data?.itemType}
      >
        {selected?.kind === 'node' ? (
          <>
            <SheetRow
              icon={selected.data.visibility === 'visible' ? '🙈' : '👁'}
              label={selected.data.visibility === 'visible' ? 'Hide from students' : 'Show to students'}
              hint="Hidden folders stay in the dashboard but vanish from the app."
              onPress={() => setVisibility(selected.data,
                selected.data.visibility === 'visible' ? 'hidden' : 'visible')}
            />
            <SheetRow icon="🗑" tone="danger" label="Delete this folder"
                      hint="Everything inside goes too. This cannot be undone."
                      onPress={() => removeNode(selected.data)} />
            <SheetDetail label="Type" value={selected.data.nodeType} />
            <SheetDetail label="Visibility" value={selected.data.visibility} />
          </>
        ) : selected?.kind === 'item' ? (
          <>
            <SheetRow icon="↗" label="Open the file"
                      onPress={() => Linking.openURL(absolute(selected.data.url))} />
            <SheetRow
              icon={selected.data.visibility === 'visible' ? '🙈' : '👁'}
              label={selected.data.visibility === 'visible' ? 'Hide from students' : 'Show to students'}
              onPress={() => toggleItem(selected.data)}
            />
            <SheetRow icon="🗑" tone="danger" label="Delete this file"
                      onPress={() => removeItem(selected.data)} />
            <SheetDetail label="Type" value={selected.data.itemType} />
            <SheetDetail label="Format" value={selected.data.mimeType} />
          </>
        ) : null}
      </Sheet>
    </ScrollView>
  );
}

// ─── Add a folder ────────────────────────────────────────────────────────────

function AddFolder({ parent, childType, schools, constants, onDone, setError }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [classLevel, setClassLevel] = useState(null);
  const [schoolId, setSchoolId] = useState(null);
  const [saving, setSaving] = useState(false);

  const min = constants?.minClass ?? 2;
  const max = constants?.maxClass ?? 10;
  const levelOptions = Array.from({ length: max - min + 1 }, (_, i) => ({
    value: min + i, label: `Class ${min + i}`,
  }));

  const submit = async () => {
    setSaving(true);
    try {
      await api.content.createNode({
        parentId: parent?.id ?? null,
        nodeType: childType,
        title: title.trim(),
        description: description.trim() || null,
        // Only a class node carries these; everything below inherits.
        ...(childType === 'class' ? { classLevel, schoolId: schoolId || null } : {}),
      });
      setTitle(''); setDescription(''); setClassLevel(null); setSchoolId(null);
      setOpen(false);
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const ready = title.trim().length >= 1 && (childType !== 'class' || !!classLevel);

  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>
          {open ? `New ${childType}` : `Add a ${childType}`}
        </Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Field label="Name" value={title} onChangeText={setTitle}
                 placeholder={PLACEHOLDER[childType]} autoCapitalize="sentences" />
          <Field label="Description (optional)" value={description} onChangeText={setDescription}
                 placeholder="What this covers" autoCapitalize="sentences" />

          {childType === 'class' && (
            <View style={styles.row2}>
              <View style={styles.col}>
                <Dropdown label="Class level" value={classLevel} options={levelOptions}
                          onChange={setClassLevel} placeholder="Choose" clearable={false} />
              </View>
              <View style={styles.col}>
                <Dropdown
                  label="School"
                  value={schoolId}
                  options={schools.map((s) => ({ value: s.id, label: s.name, hint: s.code }))}
                  onChange={setSchoolId}
                  placeholder="All schools"
                />
              </View>
            </View>
          )}
          {childType === 'class' && (
            <Text style={styles.hint}>
              Leave the school blank to share this content with every school.
            </Text>
          )}

          <GlassButton title={`Add ${childType}`} onPress={submit} loading={saving} disabled={!ready} />
          <GhostButton title="Cancel" onPress={() => setOpen(false)} />
        </GlassCard>
      )}
    </>
  );
}

const PLACEHOLDER = {
  class: 'Class 6',
  subject: 'Mathematics',
  chapter: 'Chapter 1 — Number systems',
  topic: 'Topic 1.1 — Place value',
};

// ─── Upload files ────────────────────────────────────────────────────────────

function AddItems({ node, constants, onDone, setError }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState([]);
  const [url, setUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);

  const maxFiles = constants?.uploadMaxFiles ?? 10;
  const maxMb = constants?.uploadMaxMb;

  const upload = async () => {
    setUploading(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('nodeId', String(node.id));
      // Decides the storage sub-folder, so files land under the right school.
      if (node.schoolId) fd.append('schoolId', String(node.schoolId));
      for (const f of files) fd.append('files', f);

      const r = await api.content.uploadBulk(fd);
      setResult(r);
      setFiles([]);
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const addLink = async () => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('nodeId', String(node.id));
      fd.append('itemType', 'link');
      fd.append('title', linkTitle.trim() || url.trim());
      fd.append('url', url.trim());
      await api.content.createItem(fd);
      setUrl(''); setLinkTitle('');
      await onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{open ? 'Add files' : 'Upload files or add a link'}</Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <FilePicker
            multiple
            maxFiles={maxFiles}
            file={files}
            onPick={setFiles}
            hint={maxMb
              ? `Video up to ${maxMb.video} MB · PDF ${maxMb.pdf} MB · images ${maxMb.image} MB`
              : 'Videos, PDFs, images and documents'}
          />

          {files.length > 0 && (
            <GlassButton
              title={`Upload ${files.length} file${files.length === 1 ? '' : 's'}`}
              onPress={upload}
              loading={uploading}
            />
          )}

          {/* Partial success is a real outcome here, so it gets real feedback
              rather than a generic toast. */}
          {result && (
            <View style={styles.result}>
              <Text style={styles.resultOk}>
                {result.uploaded} file{result.uploaded === 1 ? '' : 's'} uploaded.
              </Text>
              {result.rejected?.map((r) => (
                <Text key={r.name} style={styles.resultBad}>✕ {r.name} — {r.reason}</Text>
              ))}
            </View>
          )}

          <View style={styles.divider}>
            <View style={styles.line} /><Text style={styles.dividerText}>or</Text><View style={styles.line} />
          </View>

          <Field label="Link" value={url} onChangeText={setUrl}
                 placeholder="https://example.com/lesson" keyboardType="url" />
          <Field label="Link title (optional)" value={linkTitle} onChangeText={setLinkTitle}
                 placeholder="Shown to students" autoCapitalize="sentences" />
          <GlassButton title="Add link" onPress={addLink} loading={uploading}
                       disabled={url.trim().length < 8} />
        </GlassCard>
      )}
    </>
  );
}

const absolute = (u) => (u?.startsWith('/') ? `${api.baseUrl}${u}` : u);

function Crumb({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="link" style={styles.crumb}>
      <Text style={[styles.crumbText, active && { color: colors.text, fontWeight: '600' }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 1100, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  sectionTitle: { ...typography.h3, color: colors.text, marginTop: spacing.lg, marginBottom: spacing.md },
  hint: { ...typography.small, color: colors.textFaint, marginBottom: spacing.md },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },

  crumbs: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: spacing.md },
  crumb: { paddingVertical: 6, paddingHorizontal: spacing.sm, borderRadius: radius.sm, maxWidth: 220 },
  crumbText: { ...typography.small, color: colors.textMuted },
  crumbSep: { color: colors.textFaint, fontSize: 15 },

  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  composerTitle: { ...typography.h3, color: colors.text },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  row2: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  col: { flexGrow: 1, flexBasis: 180, minWidth: 150 },
  rowIcon: { fontSize: 19, width: 28, textAlign: 'center' },
  rowTitle: { ...typography.body, color: colors.text, fontWeight: '600' },
  rowMeta: { ...typography.small, color: colors.textFaint, marginTop: 2 },
  moreBtn: {
    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder,
  },
  moreText: { color: colors.textMuted, fontSize: 16 },
  chevron: { fontSize: 22, color: colors.textFaint },

  result: {
    marginTop: spacing.md, padding: spacing.md, borderRadius: radius.md,
    backgroundColor: 'rgba(52,211,153,0.10)', borderWidth: 1, borderColor: 'rgba(52,211,153,0.30)',
  },
  resultOk: { ...typography.small, color: colors.success },
  resultBad: { ...typography.small, color: colors.warning, marginTop: 4 },

  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.glassBorder },
  dividerText: { ...typography.caption, color: colors.textFaint, textTransform: 'uppercase' },
});
