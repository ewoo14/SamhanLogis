/**
 * DispatchListScreen — 본인 배차 목록 (skeleton).
 *
 * 실제 GET /driver-app/arologis/dispatches/today 호출 + 정차 목록 렌더는
 * 후속 슬라이스 (mobile-staff 의 DriverDashboardScreen 이식 후) 에서 구현.
 *
 * 본 placeholder 는 로그인 후 진입점 navigator 가 동작하도록 export 만 유지.
 */
import * as React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens';
import { useAuth, clearAuth } from '../stores/authStore';

export default function DispatchListScreen(): React.ReactElement {
  const auth = useAuth();
  return (
    <View style={styles.container}>
      <Text style={styles.heading}>오늘의 배차</Text>
      <Text style={styles.body}>
        기사 {auth?.driverCode ?? '-'} — 본인 배차 목록 화면은 후속 슬라이스에서 구현됩니다.
      </Text>
      <Text style={styles.link} onPress={clearAuth}>
        로그아웃
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface.app,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing[4],
  },
  heading: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semibold,
    color: colors.ink.primary,
    marginBottom: spacing[2],
  },
  body: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
    textAlign: 'center',
    marginBottom: spacing[4],
  },
  link: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.action.brand,
    textDecorationLine: 'underline',
  },
});
