/**
 * `<RNButton>` — React Native 전용 버튼.
 *
 * DS `<Button>` 의 token (color/spacing/radius) 만 재사용.
 * DS 컴포넌트 import 금지 (RN 미호환).
 *
 * variant: primary (브랜드) / secondary (회색) / ghost (투명) / danger (빨강) / dark (BizGate 어두운 배경 전용)
 */

import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';

export type RNButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'dark';

export interface RNButtonProps {
  label: string;
  onPress?: () => void;
  variant?: RNButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  testID?: string;
}

export function RNButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  fullWidth = false,
  style,
  testID,
}: RNButtonProps): JSX.Element {
  const palette = PALETTE[variant];
  const isDisabled = disabled || loading;

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      disabled={isDisabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: palette.bg },
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} size="small" />
      ) : (
        <Text style={[styles.label, { color: palette.fg }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const PALETTE: Record<RNButtonVariant, { bg: string; fg: string }> = {
  primary: { bg: colors.brand500, fg: colors.textOnBrand },
  secondary: { bg: colors.neutral100, fg: colors.text },
  ghost: { bg: 'transparent', fg: colors.brand500 },
  danger: { bg: colors.danger, fg: colors.neutral0 },
  dark: { bg: colors.bizButton, fg: colors.neutral0 }, // legacy biz-buttons
};

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: spacing.base,
    paddingVertical: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullWidth: { width: '100%' },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  label: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
