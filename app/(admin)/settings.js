import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { api } from '../../src/api/client';
import { useAuth } from '../../src/auth/AuthContext';
import {
  GlassButton, GhostButton, GlassCard, Pill, Empty, SkeletonRows, ErrorNote,
} from '../../src/components/Glass';
import { Chevron } from '../../src/components/Dropdown';
import { Sheet, SheetRow, SheetDetail } from '../../src/components/Sheet';
import { Field } from '../../src/components/Field';
import { colors, radius, spacing, typography } from '../../src/theme/tokens';

/**
 * Settings — section 2.7.
 *
 * Admin accounts, your own password, the legal documents the stores require,
 * and the audit trail.
 */

const LEGAL = [
  { key: 'privacy_policy', label: 'Privacy policy', hint: 'Both app stores require a reachable URL for this.' },
  { key: 'terms_conditions', label: 'Terms & conditions', hint: 'Shown on the sign-up screen.' },
];

export default function Settings() {
  const insets = useSafeAreaInsets();
  const { user, signOut } = useAuth();

  const [tab, setTab] = useState('admins');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  return (
    <ScrollView
      contentContainerStyle={[styles.scroll, { paddingTop: insets.top + spacing.lg, paddingBottom: spacing.xxl }]}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.title}>Settings</Text>
      <Text style={styles.sub}>Signed in as {user?.fullName || user?.email}</Text>

      <View style={styles.tabs}>
        <Tab label="Admins" active={tab === 'admins'} onPress={() => setTab('admins')} />
        <Tab label="Password" active={tab === 'password'} onPress={() => setTab('password')} />
        <Tab label="Legal" active={tab === 'legal'} onPress={() => setTab('legal')} />
        <Tab label="Activity" active={tab === 'audit'} onPress={() => setTab('audit')} />
      </View>

      <ErrorNote message={error} />
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}

      {tab === 'admins' && <AdminsTab me={user} setError={setError} setNotice={setNotice} />}
      {tab === 'password' && <PasswordTab setError={setError} setNotice={setNotice} />}
      {tab === 'legal' && <LegalTab setError={setError} setNotice={setNotice} />}
      {tab === 'audit' && <AuditTab setError={setError} />}

      <GhostButton title="Sign out" onPress={signOut} style={{ marginTop: spacing.xl }} />
    </ScrollView>
  );
}

// ─── Admin users ─────────────────────────────────────────────────────────────

function AdminsTab({ me, setError, setNotice }) {
  const [admins, setAdmins] = useState(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const [resetting, setResetting] = useState(null);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try { setAdmins((await api.admin.users()).admins); }
    catch (err) { setError(err.message); }
  }, [setError]);

  useEffect(() => { load(); }, [load]);

  const create = async () => {
    setSaving(true);
    try {
      await api.admin.createUser({ fullName: fullName.trim(), email: email.trim(), password });
      setFullName(''); setEmail(''); setPassword('');
      setOpen(false);
      setNotice('Admin created.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (admin, status) => {
    try {
      const r = await api.admin.setUserStatus(admin.id, status);
      setSelected(null);
      setNotice(`${admin.fullName} is now ${status}${r.sessionsRevoked ? ` — ${r.sessionsRevoked} session(s) ended` : ''}.`);
      await load();
    } catch (err) { setError(err.message); setSelected(null); }
  };

  const resetPassword = async () => {
    setSaving(true);
    try {
      const r = await api.admin.resetPassword(resetting.id, newPassword);
      setNotice(`Password reset for ${resetting.fullName} — ${r.sessionsRevoked} session(s) ended.`);
      setNewPassword('');
      setResetting(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Pressable onPress={() => setOpen((o) => !o)} style={styles.composerHeader} accessibilityRole="button">
        <Chevron open={open} size={15} color={colors.accentFrom} />
        <Text style={styles.composerTitle}>{open ? 'New admin' : 'Add an admin'}</Text>
      </Pressable>

      {open && (
        <GlassCard strong style={{ marginBottom: spacing.lg }}>
          <Field label="Full name" value={fullName} onChangeText={setFullName}
                 placeholder="Their name" autoCapitalize="words" />
          <Field label="Email" value={email} onChangeText={setEmail}
                 placeholder="admin@example.com" keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword}
                 placeholder="At least 8 characters" secureTextEntry
                 hint="They should change this after their first sign-in." />
          <Text style={styles.warn}>
            One email, one role. An address already used by a student or parent cannot become an admin.
          </Text>
          <GlassButton title="Create admin" onPress={create} loading={saving}
                       disabled={fullName.trim().length < 2 || !email.includes('@') || password.length < 8} />
          <GhostButton title="Cancel" onPress={() => setOpen(false)} />
        </GlassCard>
      )}

      {!admins && <SkeletonRows rows={2} />}

      {admins?.map((a) => (
        <Pressable key={a.id} onPress={() => setSelected(a)} accessibilityRole="button"
                   accessibilityLabel={`Options for ${a.fullName}`}>
          <GlassCard style={{ marginBottom: spacing.sm }}>
            <View style={styles.row}>
              <View style={{ flex: 1, minWidth: 160 }}>
                <Text style={styles.name}>
                  {a.fullName}
                  {Number(a.id) === Number(me?.id) ? '  (you)' : ''}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>{a.email}</Text>
                <Text style={styles.sub2}>
                  {a.lastLoginAt ? `Last seen ${new Date(a.lastLoginAt).toLocaleString()}` : 'Never signed in'}
                </Text>
              </View>
              <Pill label={a.status} tone={a.status === 'active' ? 'active' : 'inactive'} />
              <Text style={styles.chevron}>›</Text>
            </View>
          </GlassCard>
        </Pressable>
      ))}

      <Sheet open={!!selected} onClose={() => setSelected(null)}
             title={selected?.fullName} subtitle={selected?.email}>
        {Number(selected?.id) === Number(me?.id) ? (
          <SheetRow icon="🙋" tone="muted" disabled label="This is your own account"
                    hint="Use the Password tab to change your own password." />
        ) : (
          <>
            {selected?.status === 'active' ? (
              <SheetRow icon="⛔" tone="danger" label="Deactivate this admin"
                        hint="Signs them out everywhere. Refused if they are the last active admin."
                        onPress={() => setStatus(selected, 'inactive')} />
            ) : (
              <SheetRow icon="✅" tone="success" label="Reactivate this admin"
                        onPress={() => setStatus(selected, 'active')} />
            )}
            <SheetRow icon="🔑" label="Reset their password"
                      hint="Ends all their sessions."
                      onPress={() => { setResetting(selected); setSelected(null); }} />
          </>
        )}
        <SheetDetail label="Status" value={selected?.status} />
        <SheetDetail label="Created"
                     value={selected?.createdAt ? new Date(selected.createdAt).toLocaleDateString() : '—'} />
      </Sheet>

      <Sheet open={!!resetting} onClose={() => { setResetting(null); setNewPassword(''); }}
             title={`Reset password`} subtitle={resetting?.email}>
        <View style={{ padding: spacing.md }}>
          <Field label="New password" value={newPassword} onChangeText={setNewPassword}
                 placeholder="At least 8 characters" secureTextEntry
                 hint="Their existing sessions all end — which is the point of a reset." />
          <GlassButton title="Reset password" onPress={resetPassword} loading={saving}
                       disabled={newPassword.length < 8} />
        </View>
      </Sheet>
    </>
  );
}

// ─── Own password ────────────────────────────────────────────────────────────

function PasswordTab({ setError, setNotice }) {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  const mismatch = confirm.length > 0 && next !== confirm;

  const submit = async () => {
    setSaving(true);
    try {
      await api.auth.changePassword(current, next);
      setCurrent(''); setNext(''); setConfirm('');
      setNotice('Password changed.');
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard>
      <Field label="Current password" value={current} onChangeText={setCurrent} secureTextEntry
             placeholder="••••••••" />
      <Field label="New password" value={next} onChangeText={setNext} secureTextEntry
             placeholder="At least 8 characters" />
      <Field label="Confirm new password" value={confirm} onChangeText={setConfirm} secureTextEntry
             placeholder="Type it again" error={mismatch ? 'These do not match' : ''} />
      <GlassButton title="Change password" onPress={submit} loading={saving}
                   disabled={!current || next.length < 8 || next !== confirm} />
      <Text style={styles.hint}>
        Your other devices stay signed in — changing your own password does not end your sessions.
        Use "Reset their password" on another admin if you need to force them out.
      </Text>
    </GlassCard>
  );
}

// ─── Legal documents ─────────────────────────────────────────────────────────

function LegalTab({ setError, setNotice }) {
  const [settings, setSettings] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await api.admin.settings();
      setSettings(r.settings);
      setDrafts(Object.fromEntries(LEGAL.map((l) => [l.key, r.settings?.[l.key]?.value || ''])));
    } catch (err) { setError(err.message); }
  }, [setError]);

  useEffect(() => { load(); }, [load]);

  const save = async (key) => {
    setSaving(key);
    try {
      await api.admin.saveSetting(key, drafts[key]);
      setNotice('Saved. The app picks this up immediately.');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  };

  if (!settings) return <SkeletonRows rows={2} />;

  return (
    <>
      {LEGAL.map((l) => {
        const changed = (drafts[l.key] || '') !== (settings?.[l.key]?.value || '');
        return (
          <GlassCard key={l.key} style={{ marginBottom: spacing.md }}>
            <Text style={styles.cardTitle}>{l.label}</Text>
            <Text style={styles.hint}>{l.hint}</Text>

            <Field
              label=""
              value={drafts[l.key] || ''}
              onChangeText={(v) => setDrafts((d) => ({ ...d, [l.key]: v }))}
              placeholder="Markdown or plain text"
              autoCapitalize="sentences"
            />

            <Text style={styles.urlHint}>
              Public URL: {api.baseUrl}/api/meta/legal/{l.key}
            </Text>

            <GlassButton
              title={changed ? 'Save changes' : 'Saved'}
              onPress={() => save(l.key)}
              loading={saving === l.key}
              disabled={!changed}
            />
            {settings?.[l.key]?.updatedAt ? (
              <Text style={styles.sub2}>
                Last updated {new Date(settings[l.key].updatedAt).toLocaleString()}
              </Text>
            ) : null}
          </GlassCard>
        );
      })}
    </>
  );
}

// ─── Audit ───────────────────────────────────────────────────────────────────

function AuditTab({ setError }) {
  const [entries, setEntries] = useState(null);

  useEffect(() => {
    api.admin.audit(100)
      .then((r) => setEntries(r.entries))
      .catch((err) => setError(err.message));
  }, [setError]);

  if (!entries) return <SkeletonRows rows={5} />;
  if (entries.length === 0) return <Empty title="Nothing recorded yet" hint="Admin actions appear here." />;

  return (
    <>
      <Text style={styles.hint}>
        Who generated which codes, who approved which student. Newest first.
      </Text>
      {entries.map((e) => (
        <GlassCard key={e.id} style={{ marginBottom: spacing.sm }}>
          <View style={styles.row}>
            <View style={{ flex: 1, minWidth: 160 }}>
              <Text style={styles.name}>{prettyAction(e.action)}</Text>
              <Text style={styles.meta} numberOfLines={2}>
                {e.actor?.name || 'System'}
                {e.entityType ? ` · ${e.entityType} ${e.entityId ?? ''}` : ''}
                {e.detail ? ` · ${summarise(e.detail)}` : ''}
              </Text>
            </View>
            <Text style={styles.when}>{new Date(e.createdAt).toLocaleString()}</Text>
          </View>
        </GlassCard>
      ))}
    </>
  );
}

/** "code.generate" → "Code generate". Readable without a lookup table. */
const prettyAction = (a) => {
  const s = String(a || '').replace(/[._]/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

const summarise = (d) => {
  if (typeof d === 'string') return d.slice(0, 80);
  return Object.entries(d)
    .filter(([, v]) => v !== null && v !== undefined)
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
};

function Tab({ label, active, onPress }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabActive]}
               accessibilityRole="tab" accessibilityState={{ selected: active }}>
      <Text style={[styles.tabText, active && { color: colors.text, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: spacing.lg, maxWidth: 900, width: '100%', alignSelf: 'center' },
  title: { ...typography.h1, color: colors.text },
  sub: { ...typography.small, color: colors.textFaint, marginBottom: spacing.lg },

  tabs: { flexDirection: 'row', backgroundColor: colors.glass, borderRadius: radius.pill, padding: 4, marginBottom: spacing.lg },
  tab: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: 'center' },
  tabActive: { backgroundColor: colors.glassStrong },
  tabText: { ...typography.small, color: colors.textMuted },

  composerHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.md },
  composerTitle: { ...typography.h3, color: colors.text },
  cardTitle: { ...typography.h3, color: colors.text },
  hint: { ...typography.small, color: colors.textFaint, marginTop: 4, marginBottom: spacing.md },
  urlHint: { ...typography.caption, color: colors.textFaint, marginBottom: spacing.md, fontFamily: typography.mono },
  warn: { ...typography.small, color: colors.warning, marginBottom: spacing.md },
  notice: { ...typography.small, color: colors.success, textAlign: 'center', marginBottom: spacing.md },

  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  name: { ...typography.body, color: colors.text, fontWeight: '600' },
  meta: { ...typography.small, color: colors.textMuted, marginTop: 2 },
  sub2: { ...typography.small, color: colors.textFaint, marginTop: 4 },
  when: { ...typography.caption, color: colors.textFaint },
  chevron: { fontSize: 22, color: colors.textFaint },
});
