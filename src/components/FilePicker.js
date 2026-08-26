import React, { useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme/tokens';

/**
 * Choose a file to upload.
 *
 * On web this is a real DOM `<input type="file">`. React Native Web renders to
 * the DOM, so `createElement('input')` is a genuine file input with the OS
 * picker attached — no dependency, no permissions prompt.
 *
 * On Android and iOS there is no equivalent without a native module. Rather
 * than render a button that silently does nothing, the control says so and
 * points at the link option, which works everywhere. Installing
 * `expo-document-picker` and wiring it into `pickNative` below is the fix; the
 * admin dashboard is a web app by design, so it has not been needed yet.
 */
export function FilePicker({ file, onPick, accept, hint }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);

  if (Platform.OS !== 'web') {
    return (
      <View style={styles.unsupported}>
        <Text style={styles.unsupportedText}>
          File upload is available in the web dashboard. On this device, add a link instead.
        </Text>
      </View>
    );
  }

  const onChange = (e) => {
    const picked = e.target.files?.[0] || null;
    onPick(picked);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer?.files?.[0];
    if (dropped) onPick(dropped);
  };

  return (
    <View style={{ marginBottom: spacing.md }}>
      {React.createElement('input', {
        ref: inputRef,
        type: 'file',
        accept,
        onChange,
        style: { display: 'none' },
      })}

      <Pressable
        onPress={() => inputRef.current?.click()}
        accessibilityRole="button"
        accessibilityLabel="Choose a file"
        // Drag-and-drop is the way most people move a PDF into a web form, and
        // the handlers are three lines. Passed through to the DOM by RNW.
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={({ pressed }) => [
          styles.drop,
          dragging && styles.dropActive,
          file && styles.dropFilled,
          pressed && { opacity: 0.8 },
        ]}
      >
        {file ? (
          <>
            <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
            <Text style={styles.fileMeta}>
              {formatBytes(file.size)} · tap to replace
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.dropIcon}>⤒</Text>
            <Text style={styles.dropText}>
              {dragging ? 'Drop it here' : 'Choose a file or drag one in'}
            </Text>
            {hint ? <Text style={styles.dropHint}>{hint}</Text> : null}
          </>
        )}
      </Pressable>

      {file && (
        <Pressable onPress={() => onPick(null)} style={styles.clear} accessibilityRole="button">
          <Text style={styles.clearText}>Remove file</Text>
        </Pressable>
      )}
    </View>
  );
}

/** 1536 → "1.5 KB". Decimal units, matching what the OS file dialog shows. */
export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = Number(bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n < 10 && i > 0 ? n.toFixed(1) : Math.round(n)} ${units[i]}`;
}

const styles = StyleSheet.create({
  drop: {
    minHeight: 96, borderRadius: radius.md, borderWidth: 1,
    borderStyle: 'dashed', borderColor: colors.glassBorder,
    backgroundColor: colors.glass,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.md, gap: 4,
  },
  dropActive: { borderColor: colors.accentFrom, backgroundColor: colors.accentSoft, borderStyle: 'solid' },
  dropFilled: { borderStyle: 'solid', borderColor: colors.success, backgroundColor: 'rgba(52,211,153,0.10)' },
  dropIcon: { fontSize: 22, color: colors.accentFrom },
  dropText: { ...typography.body, color: colors.textMuted },
  dropHint: { ...typography.small, color: colors.textFaint },
  fileName: { ...typography.body, color: colors.text, fontWeight: '600' },
  fileMeta: { ...typography.small, color: colors.textFaint },
  clear: { alignSelf: 'center', paddingVertical: spacing.xs },
  clearText: { ...typography.small, color: colors.danger },

  unsupported: {
    borderRadius: radius.md, borderWidth: 1, borderColor: colors.glassBorder,
    backgroundColor: colors.glass, padding: spacing.md, marginBottom: spacing.md,
  },
  unsupportedText: { ...typography.small, color: colors.textMuted, textAlign: 'center' },
});
