/**
 * `<RNCard>` — DS `<Card>` token 동일 적용.
 *
 * legacy partner-order `.card` (border + radius + bg) RN 변환.
 */

import { StyleSheet, View, type ViewProps, type ViewStyle } from 'react-native';
import { colors, radii, shadows, spacing } from '@/tokens/tokens';

export interface RNCardProps extends ViewProps {
  /** padding 적용 여부 (기본 true) */
  padded?: boolean;
  /** elevation (기본 sm) */
  elevation?: 'none' | 'sm' | 'md';
  style?: ViewStyle;
}

export function RNCard({ padded = true, elevation = 'sm', style, children, ...rest }: RNCardProps): JSX.Element {
  return (
    <View
      {...rest}
      style={[
        styles.card,
        padded && styles.padded,
        elevation === 'sm' && shadows.sm,
        elevation === 'md' && shadows.md,
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.neutral0,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  padded: {
    padding: spacing.base,
  },
});
