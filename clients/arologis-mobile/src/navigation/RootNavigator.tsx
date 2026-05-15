/**
 * RootNavigator — 어플 최상위 navigation.
 *
 * 분기 우선순위 (가드 chain):
 * 1) useGpsPermission().blocked = true → GpsPermissionScreen 차단 화면 (F7).
 *    foreground 권한 = 의무 (사용자 결정 4 GPS 하이브리드).
 * 2) 비로그인 → PhoneLoginScreen (휴대번호 passwordless, F6).
 * 3) 로그인 → DriverTabNavigator (본인 배차 + GPS).
 *
 * GPS 권한 조회는 useGpsPermission hook 이 mount 직후 1회 자동 수행.
 * `status === 'unknown'` 시점에는 splash 텍스트로 시각적 가드.
 */
import * as React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useAuth } from '../stores/authStore';
import { useGpsPermission } from '../hooks/useGpsPermission';
import PhoneLoginScreen from '../screens/PhoneLoginScreen';
import GpsPermissionScreen from '../screens/GpsPermissionScreen';
import DriverTabNavigator from '../screens/driver/DriverTabNavigator';
import { colors, spacing, typography } from '../theme/tokens';

export default function RootNavigator(): React.ReactElement {
  const auth = useAuth();
  const gps = useGpsPermission();

  if (gps.status === 'unknown') {
    return (
      <View style={styles.splash}>
        <ActivityIndicator color={colors.action.brand} />
        <Text style={styles.splashText}>위치 권한을 확인하는 중입니다…</Text>
      </View>
    );
  }

  if (gps.blocked) {
    return (
      <GpsPermissionScreen
        status={gps.status === 'unavailable' ? 'unavailable' : 'denied'}
        onRetry={gps.retry}
      />
    );
  }

  if (!auth) {
    return <PhoneLoginScreen />;
  }

  return (
    <DriverTabNavigator
      token={auth.accessToken}
      driverCode={auth.driverCode}
      backgroundGranted={gps.backgroundGranted}
    />
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.surface.app,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[3],
  },
  splashText: {
    fontFamily: typography.fontFamily.sans,
    fontSize: typography.fontSize.base,
    color: colors.ink.secondary,
  },
});
