/**
 * `<RNFormField>` — Label + TextInput.
 *
 * DS `<FormField>` token 재사용. RN 의 `<TextInput>` 단일 wrapper.
 */

import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';

export interface RNFormFieldProps extends Omit<TextInputProps, 'style'> {
  label?: string;
  hint?: string;
  error?: string;
  /** 필수 표시 (label 옆 빨간 *) */
  required?: boolean;
  /** 어두운 BizGate 변형 */
  variant?: 'light' | 'dark';
}

export function RNFormField({
  label,
  hint,
  error,
  required,
  variant = 'light',
  ...inputProps
}: RNFormFieldProps): JSX.Element {
  const isDark = variant === 'dark';
  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, isDark && styles.labelDark]}>
          {label}
          {required ? <Text style={styles.required}> *</Text> : null}
        </Text>
      ) : null}
      <TextInput
        {...inputProps}
        style={[
          styles.input,
          isDark && styles.inputDark,
          Boolean(error) && styles.inputError,
        ]}
        placeholderTextColor={isDark ? colors.neutral400 : colors.textSubtle}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.base,
  },
  label: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  labelDark: {
    color: colors.bizText,
  },
  required: {
    color: colors.danger,
  },
  input: {
    minHeight: 44,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutral0,
    fontSize: fontSize.lg,
    color: colors.text,
  },
  inputDark: {
    backgroundColor: colors.gateBg,
    borderColor: colors.neutral700,
    color: colors.bizText,
    textAlign: 'center',
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.danger,
  },
  hintText: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textSubtle,
  },
});
