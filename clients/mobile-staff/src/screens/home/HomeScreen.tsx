/**
 * HomeScreen v1 — 영업직원 환영 + 견적 진입 button.
 *
 * mobile-staff = 영업직원 전용 단순 UX.
 * Mobile v4 의 거래처용 4 카테고리 (홈멀티/싱글/상업멀티/구형) + 5 추가 메뉴 모두 X.
 *
 * 구성:
 *   - 영업직원 환영 (이름 + 사번)
 *   - "견적 작성하기" 큰 진입 button → EstimateTab
 *   - 최근 견적 목록 stub (v2 후속 — quote-history endpoint 호출)
 *
 * UUID 미노출 — employeeName + employeeCode 만 노출.
 */

import { useNavigation } from '@react-navigation/native';
import type { CompositeNavigationProp } from '@react-navigation/native';
import type { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { colors, fontSize, fontWeight, radii, spacing } from '@/tokens/tokens';
import type { EstimateStackParamList, RootTabParamList } from '@/navigation/types';

type Nav = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'HomeTab'>,
  NativeStackNavigationProp<EstimateStackParamList>
>;

export function HomeScreen(): JSX.Element {
  const nav = useNavigation<Nav>();
  const employeeName = useAuthStore((s) => s.employeeName);
  const employeeCode = useAuthStore((s) => s.employeeCode);

  const handleOpenEstimate = (): void => {
    nav.navigate('EstimateTab', { screen: 'LegacyEstimate' });
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* 환영 헤더 */}
        <View style={styles.titleBar}>
          <Text style={styles.titleText}>영업직원 견적</Text>
          {employeeCode ? (
            <Text style={styles.staffBadge} testID="staff-badge">
              {employeeName ?? '영업직원'} ({employeeCode})
            </Text>
          ) : null}
        </View>

        {/* 환영 메시지 */}
        <View style={styles.welcomeCard} testID="welcome-card">
          <Text style={styles.welcomeText}>
            안녕하세요, {employeeName ?? '영업직원'}님.
          </Text>
          <Text style={styles.welcomeSubtext}>
            오늘도 좋은 견적 부탁드립니다.
          </Text>
        </View>

        {/* 견적 진입 큰 button */}
        <Pressable
          style={({ pressed }) => [styles.bigButton, pressed && styles.pressed]}
          onPress={handleOpenEstimate}
          testID="enter-estimate"
        >
          <Text style={styles.bigButtonLabel}>견적 작성하기</Text>
          <Text style={styles.bigButtonSub}>estimate.samhan-air.com 임베드</Text>
        </Pressable>

        {/* 최근 견적 stub (v2 후속) */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>최근 견적</Text>
          <View style={styles.emptyBox} testID="recent-empty">
            <Text style={styles.emptyText}>
              최근 작성한 견적이 없습니다.{'\n'}
              "견적 작성하기" 를 눌러 새 견적을 시작하세요.
            </Text>
          </View>
          <Text style={styles.stubHint}>
            (v2 후속 — quote-history endpoint 연동 예정)
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bgSubtle },
  scroll: { paddingBottom: spacing['2xl'] },

  titleBar: {
    paddingHorizontal: spacing.base,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.neutral0,
  },
  titleText: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.text,
  },
  staffBadge: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },

  welcomeCard: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    padding: spacing.base,
    borderRadius: radii.lg,
    backgroundColor: colors.staffBadgeBg,
  },
  welcomeText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.staffBadgeText,
  },
  welcomeSubtext: {
    marginTop: spacing.xs,
    fontSize: fontSize.sm,
    color: colors.staffBadgeText,
  },

  bigButton: {
    marginHorizontal: spacing.base,
    marginTop: spacing.base,
    minHeight: 120,
    borderRadius: radii.xl,
    backgroundColor: colors.brand500,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  bigButtonLabel: {
    fontSize: fontSize['3xl'],
    fontWeight: fontWeight.bold,
    color: colors.textOnBrand,
  },
  bigButtonSub: {
    fontSize: fontSize.xs,
    color: colors.brand100,
  },
  pressed: { opacity: 0.85 },

  section: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.base,
  },
  sectionTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyBox: {
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.base,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.neutral0,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: fontSize.sm,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  stubHint: {
    marginTop: spacing.xs,
    fontSize: fontSize.xs,
    color: colors.textSubtle,
    textAlign: 'center',
  },
});
