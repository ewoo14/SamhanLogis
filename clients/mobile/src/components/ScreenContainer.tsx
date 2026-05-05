/**
 * `<ScreenContainer>` — 모든 screen 의 SafeAreaView + ScrollView wrapper.
 *
 * - status bar 영역 안전 (SafeAreaView)
 * - 가로/세로 padding 일관 적용
 * - scroll 자동 (option)
 */

import { ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, spacing } from '@/tokens/tokens';

export interface ScreenContainerProps {
  children: React.ReactNode;
  /** scroll 적용 (기본 true) */
  scroll?: boolean;
  /** 배경색 (BizGate 등은 어둡게) */
  background?: string;
  /** padding 적용 (기본 true) */
  padded?: boolean;
  contentStyle?: ViewStyle;
}

export function ScreenContainer({
  children,
  scroll = true,
  background = colors.bgSubtle,
  padded = true,
  contentStyle,
}: ScreenContainerProps): JSX.Element {
  const inner = (
    <View style={[padded && styles.padded, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: background }]} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {inner}
        </ScrollView>
      ) : (
        <View style={styles.scroll}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1 },
  padded: {
    padding: spacing.base,
    gap: spacing.base,
  },
});
