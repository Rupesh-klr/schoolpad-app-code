import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, radius, spacing, TAP, typography } from '../theme/tokens';

/**
 * Text inputs.
 *
 * Every input here is 16px or larger on iOS. Safari zooms the whole page when a
 * field smaller than that receives focus, which on the web build shoves the
 * submit button off screen and looks like the form broke.
 */

export function Field({
  label, value, onChangeText, placeholder, hint, error,
  keyboardType = 'default', autoCapitalize = 'none', secureTextEntry = false,
  maxLength, editable = true, autoFocus = false, onSubmitEditing, style,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[{ marginBottom: spacing.md }, style]}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <View style={[
        styles.wrap,
        focused && { borderColor: colors.accentFrom, backgroundColor: colors.accentSoft },
        error && { borderColor: colors.danger },
        !editable && { opacity: 0.6 },
      ]}>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          secureTextEntry={secureTextEntry}
          maxLength={maxLength}
          editable={editable}
          autoFocus={autoFocus}
          onSubmitEditing={onSubmitEditing}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={styles.input}
          accessibilityLabel={label || placeholder}
        />
      </View>

      {error ? <Text style={styles.error}>{error}</Text>
        : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/**
 * Segmented code entry — used for both the OTP and the access code.
 *
 * `length` is passed in from the server's constants rather than hardcoded, so
 * changing ACCESS_CODE.LENGTH on the backend reshapes this input with no app
 * release.
 *
 * The implementation is one real TextInput behind a row of drawn boxes, not one
 * input per box. Per-box inputs have to hand focus around manually, and they
 * break paste, autofill and every OTP-from-SMS integration on both platforms.
 */
export function CodeInput({ length = 6, value, onChangeText, autoFocus = true, error, secure = false }) {
  const ref = useRef(null);
  const [focused, setFocused] = useState(false);
  const chars = String(value || '').split('');

  return (
    <View style={{ marginBottom: spacing.md }}>
      <View
        style={styles.codeRow}
        // Tapping any box focuses the single hidden input behind them.
        onStartShouldSetResponder={() => { ref.current?.focus(); return true; }}
      >
        {Array.from({ length }).map((_, i) => {
          const filled = i < chars.length;
          const isCursor = focused && i === chars.length;
          return (
            <View
              key={i}
              style={[
                styles.codeBox,
                filled && styles.codeBoxFilled,
                isCursor && styles.codeBoxCursor,
                error && { borderColor: colors.danger },
              ]}
            >
              <Text style={styles.codeChar}>
                {filled ? (secure ? '•' : chars[i]) : ''}
              </Text>
            </View>
          );
        })}
      </View>

      <TextInput
        ref={ref}
        value={value}
        onChangeText={(t) => onChangeText(t.replace(/\D/g, '').slice(0, length))}
        keyboardType="number-pad"
        maxLength={length}
        autoFocus={autoFocus}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        // Lets both platforms fill the code straight from the SMS or WhatsApp
        // notification instead of making a child memorise six digits.
        textContentType="oneTimeCode"
        autoComplete={Platform.OS === 'android' ? 'sms-otp' : 'one-time-code'}
        style={styles.hiddenInput}
        accessibilityLabel={`${length} digit code`}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.caption, color: colors.textMuted,
    textTransform: 'uppercase', marginBottom: spacing.xs, marginLeft: spacing.xs,
  },
  wrap: {
    borderWidth: 1, borderColor: colors.glassBorder, borderRadius: radius.md,
    backgroundColor: colors.glass, minHeight: TAP, justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  input: {
    // 16 is the floor that stops iOS Safari zooming on focus.
    fontSize: 16, color: colors.text, fontFamily: typography.family,
    minHeight: TAP, paddingVertical: spacing.sm,
    // React Native Web draws a focus ring that clashes with the glass border.
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  hint: { ...typography.small, color: colors.textFaint, marginTop: 4, marginLeft: spacing.xs },
  error: { ...typography.small, color: colors.danger, marginTop: 4, marginLeft: spacing.xs },

  codeRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  codeBox: {
    width: 42, height: 54, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.glassBorder, backgroundColor: colors.glass,
    alignItems: 'center', justifyContent: 'center',
  },
  codeBoxFilled: { backgroundColor: colors.glassStrong, borderColor: colors.glassHighlight },
  codeBoxCursor: { borderColor: colors.accentFrom, backgroundColor: colors.accentSoft },
  codeChar: { fontSize: 22, color: colors.text, fontFamily: typography.mono, fontWeight: '600' },

  // Kept on screen but invisible. `display: none` would stop the keyboard
  // opening on Android and break autofill on both platforms.
  hiddenInput: {
    position: 'absolute', opacity: 0, height: 54, width: '100%',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
});
