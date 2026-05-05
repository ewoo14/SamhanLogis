/**
 * `<RootNavigator>` — 영업직원 인증 상태 기반 루트 stack.
 *
 * 미인증 → AuthStackNavigator (StaffLogin, 사번 + 비밀번호)
 * 인증 → BottomTabNavigator (홈 / 견적 / 프로필 — 3 tabs 단순)
 *
 * mobile-staff v1 추가:
 *   - hydrate 시 estimate-app v2 URL 환경변수 (`EXPO_PUBLIC_ESTIMATE_APP_URL`) 검증.
 *   - 환경변수 미정의 시 dev/prod default (localhost:5183 / estimate.samhan-air.com) 사용.
 *   - 잘못된 URL 형태 시 console.warn — RN 화면에서는 LegacyEstimateWebViewScreen 의 errorBox 가 노출.
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { validateEstimateAppUrl } from '@/webview/legacyEstimateSource';
import { AuthStackNavigator } from './AuthStackNavigator';
import { BottomTabNavigator } from './BottomTabNavigator';
import type { RootStackParamList } from './types';

const Root = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator(): JSX.Element {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const hydrate = useAuthStore((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  // hydrate 1회 시 estimate-app v2 URL 환경변수 검증 (개발자 가시성).
  useEffect(() => {
    const v = validateEstimateAppUrl();
    if (!v.ok) {
      // eslint-disable-next-line no-console
      console.warn(`[mobile-staff] EXPO_PUBLIC_ESTIMATE_APP_URL 형태 오류: ${v.url}`);
    } else {
      // eslint-disable-next-line no-console
      console.log(`[mobile-staff] estimate-app v2 source (${v.source}): ${v.url}`);
    }
  }, []);

  return (
    <Root.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Root.Screen name="Main" component={BottomTabNavigator} />
      ) : (
        <Root.Screen name="Auth" component={AuthStackNavigator} />
      )}
    </Root.Navigator>
  );
}
