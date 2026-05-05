/**
 * `<RNBadge>` — 상태 표시 칩.
 *
 * legacy partner-order `.badge` / `.tag-ok` / `.tag-bad` 변환.
 */

import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';

export type RNBadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

export interface RNBadgeProps {
  label: string;
  tone?: RNBadgeTone;
}

export function RNBadge({ label, tone = 'neutral' }: RNBadgeProps): JSX.Element {
  const palette = TONES[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <Text style={[styles.text, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

const TONES: Record<RNBadgeTone, { bg: string; fg: string }> = {
  neutral: { bg: colors.neutral100, fg: colors.text },
  brand: { bg: colors.brand100, fg: colors.brand700 },
  success: { bg: '#E6FFFA', fg: '#065F46' }, // legacy .tag-ok
  warning: { bg: '#FEF3C7', fg: '#92400E' },
  danger: { bg: '#FFE4E6', fg: '#B91C1C' }, // legacy .tag-bad
  info: { bg: '#DBEAFE', fg: '#1E40AF' },
};

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.full,
  },
  text: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
